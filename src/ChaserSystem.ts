import * as THREE from 'three';

// --- Enderman-style shared geometries (all BoxGeometry, tall & thin) ---
const chaserGeo = {
  head: new THREE.BoxGeometry(0.5, 0.5, 0.5),
  eye: new THREE.BoxGeometry(0.18, 0.06, 0.02),
  torso: new THREE.BoxGeometry(0.4, 0.9, 0.2),
  arm: new THREE.BoxGeometry(0.15, 1.1, 0.15),
  leg: new THREE.BoxGeometry(0.18, 1.2, 0.18),
  particle: new THREE.BoxGeometry(0.06, 0.06, 0.06),
};

// --- Shared materials ---
const chaserMat = {
  body: new THREE.MeshStandardMaterial({
    color: 0x0a0a0a,
    roughness: 1.0,
    metalness: 0,
    emissive: 0x1a0030,
    emissiveIntensity: 0.3,
  }),
  eye: new THREE.MeshStandardMaterial({
    color: 0xcc55ff,
    emissive: 0xcc55ff,
    emissiveIntensity: 3.0,
  }),
  particle: new THREE.MeshStandardMaterial({
    color: 0x6622aa,
    emissive: 0x6622aa,
    emissiveIntensity: 1.5,
    transparent: true,
    opacity: 0.7,
  }),
};

// Spawn thresholds
const SPAWN_THRESHOLDS = [100, 400, 800];
const MAX_CHASERS = 3;
const SPAWN_OFFSET_Z = -8;

// Follow distances — very close so heads peek at bottom of screen
// Camera is at playerZ - 10, so chasers at playerZ - 3..5 are between camera and player
const BASE_FOLLOW_DIST = 4;    // normal distance behind player
const CLOSE_FOLLOW_DIST = 2;   // after stumble, closing in
const FAR_FOLLOW_DIST = 10;    // after 20s clean, falling back

// Catch mechanic
const CATCH_DIST = 0.3;        // distance at which Enderman catches player

// Clean running timer
const CLEAN_RUN_FALLBACK_TIME = 20; // seconds of no stumble before they fall back

const PARTICLES_PER_CHASER = 6;

interface Chaser {
  group: THREE.Group;
  bodyGroup: THREE.Group;
  headGroup: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  light: THREE.PointLight;
  particles: THREE.Mesh[];
  runPhase: number;
  active: boolean;
  currentDist: number; // current follow distance (lerps toward target)
}

function createChaser(): Chaser {
  const group = new THREE.Group();
  const bodyGroup = new THREE.Group();

  const torso = new THREE.Mesh(chaserGeo.torso, chaserMat.body);
  torso.position.y = 1.65;
  torso.castShadow = true;
  bodyGroup.add(torso);

  const headGroup = new THREE.Group();
  headGroup.position.y = 2.35;

  const head = new THREE.Mesh(chaserGeo.head, chaserMat.body);
  head.castShadow = true;
  headGroup.add(head);

  const leftEye = new THREE.Mesh(chaserGeo.eye, chaserMat.eye);
  leftEye.position.set(-0.1, 0.02, 0.26);
  headGroup.add(leftEye);

  const rightEye = new THREE.Mesh(chaserGeo.eye, chaserMat.eye);
  rightEye.position.set(0.1, 0.02, 0.26);
  headGroup.add(rightEye);

  bodyGroup.add(headGroup);

  const leftArm = new THREE.Group();
  leftArm.position.set(-0.275, 2.05, 0);
  {
    const arm = new THREE.Mesh(chaserGeo.arm, chaserMat.body);
    arm.position.y = -0.55;
    arm.castShadow = true;
    leftArm.add(arm);
  }
  bodyGroup.add(leftArm);

  const rightArm = new THREE.Group();
  rightArm.position.set(0.275, 2.05, 0);
  {
    const arm = new THREE.Mesh(chaserGeo.arm, chaserMat.body);
    arm.position.y = -0.55;
    arm.castShadow = true;
    rightArm.add(arm);
  }
  bodyGroup.add(rightArm);

  const leftLeg = new THREE.Group();
  leftLeg.position.set(-0.1, 1.2, 0);
  {
    const leg = new THREE.Mesh(chaserGeo.leg, chaserMat.body);
    leg.position.y = -0.6;
    leg.castShadow = true;
    leftLeg.add(leg);
  }
  bodyGroup.add(leftLeg);

  const rightLeg = new THREE.Group();
  rightLeg.position.set(0.1, 1.2, 0);
  {
    const leg = new THREE.Mesh(chaserGeo.leg, chaserMat.body);
    leg.position.y = -0.6;
    leg.castShadow = true;
    rightLeg.add(leg);
  }
  bodyGroup.add(rightLeg);

  group.add(bodyGroup);

  const particles: THREE.Mesh[] = [];
  for (let i = 0; i < PARTICLES_PER_CHASER; i++) {
    const p = new THREE.Mesh(chaserGeo.particle, chaserMat.particle);
    p.position.set(
      (Math.random() - 0.5) * 1.0,
      0.5 + Math.random() * 2.0,
      (Math.random() - 0.5) * 0.8,
    );
    group.add(p);
    particles.push(p);
  }

  const light = new THREE.PointLight(0x8844cc, 1.5, 15);
  light.position.y = 2.0;
  group.add(light);

  group.visible = false;

  return {
    group,
    bodyGroup,
    headGroup,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    light,
    particles,
    runPhase: 0,
    active: false,
    currentDist: BASE_FOLLOW_DIST,
  };
}

export class ChaserSystem {
  private chasers: Chaser[] = [];
  private elapsedTime = 0;
  private deathMode = false;
  private deathTargetZ = 0;

  // Stumble/clean tracking
  private timeSinceStumble = 0;
  private targetFollowDist = BASE_FOLLOW_DIST;

  // Catch mechanic
  private catchMode = false;
  caught = false;

  constructor(private scene: THREE.Scene) {
    for (let i = 0; i < MAX_CHASERS; i++) {
      const chaser = createChaser();
      this.scene.add(chaser.group);
      this.chasers.push(chaser);
    }
  }

  /** Called by Game when player hits a low obstacle (stumble) */
  onPlayerStumble(): void {
    this.timeSinceStumble = 0;
    this.targetFollowDist = CLOSE_FOLLOW_DIST; // close in!
  }

  /** Called on second stumble — Endermen rush in to catch the player */
  closeToCatch(): void {
    this.targetFollowDist = 0;
    this.catchMode = true;
  }

  update(dt: number, playerZ: number, playerSpeed: number, distance: number): void {
    this.elapsedTime += dt;
    this.timeSinceStumble += dt;

    // After 20s clean running, target distance increases (they fall back)
    if (this.timeSinceStumble >= CLEAN_RUN_FALLBACK_TIME) {
      this.targetFollowDist = FAR_FOLLOW_DIST;
    } else if (this.timeSinceStumble > 5) {
      // Gradually return to base distance after 5s
      this.targetFollowDist = BASE_FOLLOW_DIST;
    }

    for (let i = 0; i < MAX_CHASERS; i++) {
      const chaser = this.chasers[i];

      if (!chaser.active && distance >= SPAWN_THRESHOLDS[i]) {
        chaser.active = true;
        chaser.group.visible = true;
        chaser.group.position.set(0, 0, playerZ + SPAWN_OFFSET_Z);
        chaser.runPhase = i * 2;
        chaser.currentDist = BASE_FOLLOW_DIST;
      }

      if (!chaser.active) continue;

      if (this.deathMode) {
        const targetZ = this.deathTargetZ;
        const dz = targetZ - chaser.group.position.z;
        if (Math.abs(dz) > 2) {
          chaser.group.position.z += Math.sign(dz) * playerSpeed * 4 * dt;
        }
      } else {
        // Smoothly lerp current follow distance toward target
        const lerpRate = this.targetFollowDist < chaser.currentDist ? 3.0 : 0.5; // close in fast, fall back slow
        chaser.currentDist += (this.targetFollowDist - chaser.currentDist) * lerpRate * dt;

        // Each additional chaser is offset further back
        const desiredDist = chaser.currentDist + i * 2.5;
        const desiredZ = playerZ - desiredDist;
        const gap = desiredZ - chaser.group.position.z;

        // Smoothly move toward desired position
        chaser.group.position.z += gap * 3.0 * dt;
      }

      // Slight lateral drift, each chaser offset
      chaser.group.position.x = Math.sin((this.elapsedTime + i * 1.5) * 0.5) * 0.3;

      const freq = 6 * (playerSpeed / 12);
      chaser.runPhase += freq * dt;
      this.animateChaser(chaser);

      // Check if Enderman has caught the player
      if (this.catchMode && !this.deathMode && chaser.currentDist <= CATCH_DIST) {
        this.caught = true;
      }
    }
  }

  onPlayerDeath(): void {
    if (this.deathMode) return;
    this.deathMode = true;
  }

  setDeathTarget(playerZ: number): void {
    this.deathTargetZ = playerZ;
  }

  reset(): void {
    this.elapsedTime = 0;
    this.deathMode = false;
    this.deathTargetZ = 0;
    this.timeSinceStumble = 0;
    this.targetFollowDist = BASE_FOLLOW_DIST;
    this.catchMode = false;
    this.caught = false;
    for (const chaser of this.chasers) {
      chaser.active = false;
      chaser.group.visible = false;
      chaser.group.position.set(0, 0, 0);
      chaser.runPhase = 0;
      chaser.currentDist = BASE_FOLLOW_DIST;
    }
  }

  private animateChaser(chaser: Chaser): void {
    const s = Math.sin(chaser.runPhase);
    const c = Math.cos(chaser.runPhase);
    const t = this.elapsedTime;

    chaser.bodyGroup.position.y = Math.abs(c) * 0.04;
    chaser.headGroup.rotation.x = -0.05 + Math.abs(c) * 0.02;

    const armSwing = 0.4;
    chaser.leftArm.rotation.x = -s * armSwing;
    chaser.leftArm.rotation.z = -0.05;
    chaser.rightArm.rotation.x = s * armSwing;
    chaser.rightArm.rotation.z = 0.05;

    const legSwing = 0.5;
    chaser.leftLeg.rotation.x = s * legSwing;
    chaser.rightLeg.rotation.x = -s * legSwing;

    for (let i = 0; i < chaser.particles.length; i++) {
      const p = chaser.particles[i];
      const offset = i * 1.7;
      p.position.x = Math.sin(t * 1.2 + offset) * 0.6;
      p.position.y = 0.8 + Math.sin(t * 0.8 + offset * 0.5) * 1.0 + i * 0.2;
      p.position.z = Math.cos(t * 1.0 + offset) * 0.5;
      p.rotation.x = t * 2 + offset;
      p.rotation.y = t * 1.5 + offset;
    }
  }
}
