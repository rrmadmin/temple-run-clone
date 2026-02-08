import * as THREE from 'three';
import { EventBus } from './EventBus.ts';
import {
  LANE_POSITIONS, PLAYER_Y,
  JUMP_FORCE, GRAVITY, SLIDE_DURATION, LANE_SWITCH_SPEED,
  PALETTE,
} from './config.ts';

const LIMB_BASE_FREQ = 8; // radians/sec at base speed

// --- Shared geometries (all BoxGeometry for blocky Minecraft style) ---
const geo = {
  // Head (8x8x8 pixels → 0.5 cube)
  head: new THREE.BoxGeometry(0.5, 0.5, 0.5),
  // Eyes (painted on front face as small boxes)
  eyeWhite: new THREE.BoxGeometry(0.1, 0.06, 0.02),
  eyePupil: new THREE.BoxGeometry(0.06, 0.06, 0.02),
  mouth: new THREE.BoxGeometry(0.16, 0.04, 0.02),
  nose: new THREE.BoxGeometry(0.08, 0.06, 0.02),
  // Hair (top and sides)
  hairTop: new THREE.BoxGeometry(0.52, 0.08, 0.52),
  hairFront: new THREE.BoxGeometry(0.52, 0.12, 0.08),
  hairSide: new THREE.BoxGeometry(0.08, 0.3, 0.52),
  hairBack: new THREE.BoxGeometry(0.52, 0.4, 0.08),
  // Torso (8x12x4 pixels → 0.5 x 0.75 x 0.25)
  torso: new THREE.BoxGeometry(0.5, 0.75, 0.25),
  // Arms (4x12x4 pixels → 0.25 x 0.75 x 0.25)
  arm: new THREE.BoxGeometry(0.25, 0.75, 0.25),
  // Legs (4x12x4 pixels → 0.25 x 0.75 x 0.25)
  leg: new THREE.BoxGeometry(0.25, 0.75, 0.25),
  // Shoes (bottom of legs)
  shoe: new THREE.BoxGeometry(0.26, 0.12, 0.26),
};

// --- Shared materials (flat/blocky look, low metalness) ---
const mat = {
  skin: new THREE.MeshStandardMaterial({ color: PALETTE.player.skin, roughness: 1.0, metalness: 0 }),
  shirt: new THREE.MeshStandardMaterial({ color: PALETTE.player.shirt, roughness: 1.0, metalness: 0 }),
  pants: new THREE.MeshStandardMaterial({ color: PALETTE.player.pants, roughness: 1.0, metalness: 0 }),
  shoe: new THREE.MeshStandardMaterial({ color: PALETTE.player.shoes, roughness: 1.0, metalness: 0 }),
  hair: new THREE.MeshStandardMaterial({ color: PALETTE.player.hair, roughness: 1.0, metalness: 0 }),
  eye: new THREE.MeshStandardMaterial({ color: PALETTE.player.eyes, roughness: 1.0, metalness: 0 }),
  eyeWhite: new THREE.MeshStandardMaterial({ color: PALETTE.player.eyeWhite, roughness: 1.0, metalness: 0 }),
  mouth: new THREE.MeshStandardMaterial({ color: PALETTE.player.mouth, roughness: 1.0, metalness: 0 }),
};

export class Player {
  mesh: THREE.Group;
  lane = 1;
  targetX = 0;
  velocityY = 0;
  isJumping = false;
  isSliding = false;
  isAlive = true;

  private slideTimer = 0;
  private deathTimer = 0;
  private fallEdgeZ = Infinity; // far edge of pit — stop forward motion here
  private edgeFallSide = 0; // -1 = left, 1 = right

  // Body hierarchy
  private bodyGroup: THREE.Group;
  private torsoGroup: THREE.Group;
  private headGroup: THREE.Group;

  // Arms (single-segment boxes pivoting from shoulder)
  private leftArm: THREE.Group;
  private rightArm: THREE.Group;

  // Legs (single-segment boxes pivoting from hip)
  private leftLeg: THREE.Group;
  private rightLeg: THREE.Group;

  // Animation
  private runPhase = 0;
  private gameSpeed = 12;

  constructor(private scene: THREE.Scene, private bus: EventBus) {
    this.mesh = new THREE.Group();
    this.bodyGroup = new THREE.Group();
    this.torsoGroup = new THREE.Group();

    // ===== TORSO (cyan shirt) =====
    const torso = new THREE.Mesh(geo.torso, mat.shirt);
    torso.position.y = 0;
    torso.castShadow = true;
    this.torsoGroup.add(torso);

    // ===== HEAD GROUP =====
    this.headGroup = new THREE.Group();
    this.headGroup.position.y = 0.625; // top of torso + half head

    // Head box (skin color)
    const head = new THREE.Mesh(geo.head, mat.skin);
    head.castShadow = true;
    this.headGroup.add(head);

    // Hair - top
    const hairTop = new THREE.Mesh(geo.hairTop, mat.hair);
    hairTop.position.y = 0.25;
    this.headGroup.add(hairTop);

    // Hair - front bangs
    const hairFront = new THREE.Mesh(geo.hairFront, mat.hair);
    hairFront.position.set(0, 0.19, 0.23);
    this.headGroup.add(hairFront);

    // Hair - left side
    const hairLeft = new THREE.Mesh(geo.hairSide, mat.hair);
    hairLeft.position.set(-0.26, 0.1, 0);
    this.headGroup.add(hairLeft);

    // Hair - right side
    const hairRight = new THREE.Mesh(geo.hairSide, mat.hair);
    hairRight.position.set(0.26, 0.1, 0);
    this.headGroup.add(hairRight);

    // Hair - back
    const hairBack = new THREE.Mesh(geo.hairBack, mat.hair);
    hairBack.position.set(0, 0.05, -0.23);
    this.headGroup.add(hairBack);

    // Eyes - white backgrounds
    const leftEyeWhite = new THREE.Mesh(geo.eyeWhite, mat.eyeWhite);
    leftEyeWhite.position.set(-0.1, 0.05, 0.26);
    this.headGroup.add(leftEyeWhite);

    const rightEyeWhite = new THREE.Mesh(geo.eyeWhite, mat.eyeWhite);
    rightEyeWhite.position.set(0.1, 0.05, 0.26);
    this.headGroup.add(rightEyeWhite);

    // Eyes - dark pupils
    const leftPupil = new THREE.Mesh(geo.eyePupil, mat.eye);
    leftPupil.position.set(-0.1, 0.05, 0.27);
    this.headGroup.add(leftPupil);

    const rightPupil = new THREE.Mesh(geo.eyePupil, mat.eye);
    rightPupil.position.set(0.1, 0.05, 0.27);
    this.headGroup.add(rightPupil);

    // Nose
    const nose = new THREE.Mesh(geo.nose, mat.skin);
    nose.position.set(0, -0.02, 0.26);
    this.headGroup.add(nose);

    // Mouth
    const mouth = new THREE.Mesh(geo.mouth, mat.mouth);
    mouth.position.set(0, -0.12, 0.26);
    this.headGroup.add(mouth);

    this.torsoGroup.add(this.headGroup);

    // ===== ARMS =====
    // Left arm (pivots from top/shoulder)
    this.leftArm = new THREE.Group();
    this.leftArm.position.set(-0.375, 0.375, 0); // shoulder position
    {
      const arm = new THREE.Mesh(geo.arm, mat.skin);
      arm.position.y = -0.375; // hang below pivot
      arm.castShadow = true;
      this.leftArm.add(arm);

      // Shirt sleeve (upper portion of arm)
      const sleeve = new THREE.Mesh(
        new THREE.BoxGeometry(0.26, 0.38, 0.26),
        mat.shirt,
      );
      sleeve.position.y = -0.19;
      this.leftArm.add(sleeve);
    }
    this.torsoGroup.add(this.leftArm);

    // Right arm
    this.rightArm = new THREE.Group();
    this.rightArm.position.set(0.375, 0.375, 0);
    {
      const arm = new THREE.Mesh(geo.arm, mat.skin);
      arm.position.y = -0.375;
      arm.castShadow = true;
      this.rightArm.add(arm);

      const sleeve = new THREE.Mesh(
        new THREE.BoxGeometry(0.26, 0.38, 0.26),
        mat.shirt,
      );
      sleeve.position.y = -0.19;
      this.rightArm.add(sleeve);
    }
    this.torsoGroup.add(this.rightArm);

    // Position torso group at hip height
    this.torsoGroup.position.y = 1.125; // legs(0.75) + half torso(0.375)
    this.bodyGroup.add(this.torsoGroup);

    // ===== LEGS =====
    // Left leg (pivots from top/hip)
    this.leftLeg = new THREE.Group();
    this.leftLeg.position.set(-0.125, 0.75, 0); // hip position
    {
      const leg = new THREE.Mesh(geo.leg, mat.pants);
      leg.position.y = -0.375; // hang below pivot
      leg.castShadow = true;
      this.leftLeg.add(leg);

      // Shoe at bottom
      const shoe = new THREE.Mesh(geo.shoe, mat.shoe);
      shoe.position.y = -0.69;
      this.leftLeg.add(shoe);
    }
    this.bodyGroup.add(this.leftLeg);

    // Right leg
    this.rightLeg = new THREE.Group();
    this.rightLeg.position.set(0.125, 0.75, 0);
    {
      const leg = new THREE.Mesh(geo.leg, mat.pants);
      leg.position.y = -0.375;
      leg.castShadow = true;
      this.rightLeg.add(leg);

      const shoe = new THREE.Mesh(geo.shoe, mat.shoe);
      shoe.position.y = -0.69;
      this.rightLeg.add(shoe);
    }
    this.bodyGroup.add(this.rightLeg);

    this.mesh.add(this.bodyGroup);
    this.mesh.position.set(0, 0, PLAYER_Y);
    this.targetX = LANE_POSITIONS[1];
    scene.add(this.mesh);
  }

  setSpeed(speed: number): void {
    this.gameSpeed = speed;
  }

  switchLane(direction: number): void {
    if (!this.isAlive) return;
    const newLane = Math.max(0, Math.min(2, this.lane + direction));
    if (newLane !== this.lane) {
      this.lane = newLane;
      this.targetX = LANE_POSITIONS[this.lane];
      this.bus.emit('player:lane-changed', this.lane);
    }
  }

  jump(): void {
    if (!this.isAlive || this.isJumping) return;
    this.isJumping = true;
    this.isSliding = false;
    this.slideTimer = 0;
    this.velocityY = JUMP_FORCE;
    this.bus.emit('player:jumped');
  }

  slide(): void {
    if (!this.isAlive || this.isJumping) return;
    this.isSliding = true;
    this.slideTimer = SLIDE_DURATION;
    this.bus.emit('player:slid');
  }

  update(dt: number): void {
    if (!this.isAlive) return;

    // Lane switching (smooth lerp on X)
    const dx = this.targetX - this.mesh.position.x;
    if (Math.abs(dx) > 0.01) {
      this.mesh.position.x += dx * LANE_SWITCH_SPEED * dt;
    } else {
      this.mesh.position.x = this.targetX;
    }

    // Jump physics
    if (this.isJumping) {
      this.velocityY += GRAVITY * dt;
      this.mesh.position.y += this.velocityY * dt;
      if (this.mesh.position.y <= 0) {
        this.mesh.position.y = 0;
        this.velocityY = 0;
        this.isJumping = false;
      }
    }

    // Slide timer
    if (this.isSliding) {
      this.slideTimer -= dt;
      if (this.slideTimer <= 0) {
        this.isSliding = false;
      }
    }

    this.animate(dt);
  }

  private animate(dt: number): void {
    const freq = LIMB_BASE_FREQ * (this.gameSpeed / 12);
    this.runPhase += freq * dt;

    if (this.isSliding) {
      this.applySlide();
    } else if (this.isJumping) {
      this.applyJump();
    } else {
      this.applyRun();
    }
  }

  private applyRun(): void {
    const s = Math.sin(this.runPhase);
    const c = Math.cos(this.runPhase);
    const swing = 0.6; // Minecraft-style stiff arm/leg swing

    // Reset body group
    this.bodyGroup.position.y = Math.abs(c) * 0.03; // subtle bob
    this.bodyGroup.rotation.set(0, 0, 0);

    // Torso slight forward lean
    this.torsoGroup.rotation.x = 0.05;
    this.torsoGroup.rotation.z = 0;

    // Head stays level
    this.headGroup.rotation.x = -0.03;
    this.headGroup.rotation.z = 0;

    // Legs swing (stiff, Minecraft style — no knee bend)
    this.leftLeg.rotation.x = s * swing;
    this.rightLeg.rotation.x = -s * swing;

    // Arms swing opposite to legs (contralateral)
    this.leftArm.rotation.x = -s * swing * 0.7;
    this.leftArm.rotation.z = 0;
    this.rightArm.rotation.x = s * swing * 0.7;
    this.rightArm.rotation.z = 0;
  }

  private applyJump(): void {
    // Reset body group
    this.bodyGroup.position.y = 0;
    this.bodyGroup.rotation.set(0, 0, 0);

    // Torso slight lean
    this.torsoGroup.rotation.x = -0.05;
    this.torsoGroup.rotation.z = 0;
    this.headGroup.rotation.x = 0.05;
    this.headGroup.rotation.z = 0;

    // Legs slightly tucked
    this.leftLeg.rotation.x = -0.4;
    this.rightLeg.rotation.x = -0.4;

    // Arms up
    this.leftArm.rotation.x = -0.5;
    this.leftArm.rotation.z = -0.3;
    this.rightArm.rotation.x = -0.5;
    this.rightArm.rotation.z = 0.3;
  }

  private applySlide(): void {
    // Lean backward for feet-first slide
    this.bodyGroup.rotation.x = -1.3;
    this.bodyGroup.position.y = 0.15;

    // Torso stays straight relative to body group
    this.torsoGroup.rotation.set(0, 0, 0);
    this.headGroup.rotation.x = 0.6; // chin up, looking forward
    this.headGroup.rotation.z = 0;

    // Legs extend forward
    this.leftLeg.rotation.x = 0.3;
    this.rightLeg.rotation.x = 0.3;

    // Arms tucked at sides
    this.leftArm.rotation.x = 0;
    this.leftArm.rotation.z = -0.4;
    this.rightArm.rotation.x = 0;
    this.rightArm.rotation.z = 0.4;
  }

  /** Plays death tumble animation. Returns true while animating, false when done. */
  playDeathAnimation(dt: number): boolean {
    const DURATION = 1.2;
    this.deathTimer += dt;
    const t = Math.min(this.deathTimer / DURATION, 1);

    // Vertical arc
    let yOffset: number;
    if (t < 0.4) {
      const p = t / 0.4;
      yOffset = Math.sin(p * Math.PI) * 1.2;
    } else if (t < 0.85) {
      const p = (t - 0.4) / 0.45;
      yOffset = (1 - p) * 0.3;
    } else {
      const p = (t - 0.85) / 0.15;
      yOffset = Math.sin(p * Math.PI) * 0.08;
    }
    this.mesh.position.y = yOffset;

    // Slight backward drift
    this.mesh.position.z -= dt * 1.5;

    // Full backward tumble
    const tumbleAngle = -t * Math.PI * 1.67;
    this.bodyGroup.rotation.x = tumbleAngle;
    this.bodyGroup.position.y = 0;
    this.bodyGroup.rotation.y = 0;
    this.bodyGroup.rotation.z = Math.sin(t * 4) * 0.15;

    // Torso goes limp
    this.torsoGroup.rotation.x = Math.sin(t * 3) * 0.3;
    this.torsoGroup.rotation.z = Math.sin(t * 5) * 0.1;

    // Head flops
    this.headGroup.rotation.x = Math.sin(t * 7 + 1) * 0.5;
    this.headGroup.rotation.z = Math.sin(t * 6) * 0.3;

    // Arms flail
    const armSpread = Math.min(t * 3, 1);
    this.leftArm.rotation.x = -0.8 + Math.sin(t * 6 + 0.5) * 0.5;
    this.leftArm.rotation.z = -0.7 * armSpread + Math.sin(t * 5) * 0.3;
    this.rightArm.rotation.x = -0.6 + Math.sin(t * 6 + 2) * 0.5;
    this.rightArm.rotation.z = 0.7 * armSpread + Math.sin(t * 5 + 1) * 0.3;

    // Legs spread
    const legSpread = Math.min(t * 2.5, 1);
    this.leftLeg.rotation.x = -0.4 * legSpread + Math.sin(t * 4 + 0.3) * 0.3;
    this.rightLeg.rotation.x = 0.3 * legSpread + Math.sin(t * 4 + 1.5) * 0.3;

    return t < 1;
  }

  /** Set the far edge Z of the pit so forward motion stops there */
  setFallEdge(z: number): void {
    this.fallEdgeZ = z;
  }

  /** Set which side the player fell off (-1 = left, 1 = right) */
  setEdgeFallSide(side: number): void {
    this.edgeFallSide = side;
  }

  /** Plays edge-fall animation (tipping sideways off the path). Returns true while animating. */
  playEdgeFallAnimation(dt: number): boolean {
    const DURATION = 0.7;
    this.deathTimer += dt;
    const t = Math.min(this.deathTimer / DURATION, 1);

    // Drift sideways off the edge
    this.mesh.position.x += this.edgeFallSide * dt * 3.0;

    // Tip sideways toward the edge
    this.bodyGroup.rotation.z = this.edgeFallSide * t * 1.2;
    this.bodyGroup.position.y = 0;

    // Drop down
    const fallSpeed = 4 + t * t * 20;
    this.mesh.position.y -= fallSpeed * dt;

    // Arms flail outward
    const armReach = Math.min(t * 3, 1);
    this.leftArm.rotation.x = -1.0 * armReach + Math.sin(t * 10) * 0.3;
    this.leftArm.rotation.z = -0.8 * armReach;
    this.rightArm.rotation.x = -1.0 * armReach + Math.sin(t * 10 + 1) * 0.3;
    this.rightArm.rotation.z = 0.8 * armReach;

    // Legs kick
    this.leftLeg.rotation.x = Math.sin(t * 8) * 0.4;
    this.rightLeg.rotation.x = Math.sin(t * 8 + Math.PI) * 0.4;

    // Head looks toward camera
    this.headGroup.rotation.x = -0.3 * armReach;
    this.headGroup.rotation.z = -this.edgeFallSide * 0.2;

    // Torso resets
    this.torsoGroup.rotation.set(0, 0, 0);

    return t < 1;
  }

  /** Plays falling-into-pit animation. Returns true while animating, false when done. */
  playFallAnimation(dt: number): boolean {
    const DURATION = 0.6;
    this.deathTimer += dt;
    const t = Math.min(this.deathTimer / DURATION, 1);

    // Full speed forward until slamming into the far wall of the pit
    if (this.mesh.position.z < this.fallEdgeZ) {
      this.mesh.position.z += this.gameSpeed * dt;
      if (this.mesh.position.z >= this.fallEdgeZ) {
        this.mesh.position.z = this.fallEdgeZ;
      }
    }

    // Fast drop — starts quick, accelerates hard
    const fallSpeed = 6 + t * t * 30;
    this.mesh.position.y -= fallSpeed * dt;

    // Arms reach up (flailing)
    const armReach = Math.min(t * 5, 1);
    this.leftArm.rotation.x = -2.5 * armReach + Math.sin(t * 14) * 0.4;
    this.leftArm.rotation.z = -0.5 * armReach;
    this.rightArm.rotation.x = -2.5 * armReach + Math.sin(t * 14 + 1) * 0.4;
    this.rightArm.rotation.z = 0.5 * armReach;

    // Legs kick
    this.leftLeg.rotation.x = Math.sin(t * 12) * 0.5;
    this.rightLeg.rotation.x = Math.sin(t * 12 + Math.PI) * 0.5;

    // Slight body twist as falling
    this.bodyGroup.rotation.y = Math.sin(t * 8) * 0.3;

    // Head looks up (toward camera)
    this.headGroup.rotation.x = -0.4 * armReach;

    return t < 1;
  }

  /** Plays caught-by-Enderman animation. Returns true while animating, false when done. */
  playCaughtAnimation(dt: number): boolean {
    const DURATION = 0.8;
    this.deathTimer += dt;
    const t = Math.min(this.deathTimer / DURATION, 1);

    // Player stops and gets pulled backward slightly
    this.mesh.position.z -= dt * 2.0 * (1 - t);

    // Arms go up in panic
    const armRaise = Math.min(t * 4, 1);
    this.leftArm.rotation.x = -2.2 * armRaise;
    this.leftArm.rotation.z = -0.4 * armRaise;
    this.rightArm.rotation.x = -2.2 * armRaise;
    this.rightArm.rotation.z = 0.4 * armRaise;

    // Body tilts backward (being grabbed)
    this.bodyGroup.rotation.x = -0.3 * t;
    this.bodyGroup.position.y = 0;

    // Head looks up in terror
    this.headGroup.rotation.x = -0.5 * armRaise;
    this.headGroup.rotation.z = Math.sin(t * 12) * 0.15;

    // Legs stiffen/lock
    this.leftLeg.rotation.x = 0.2 * t;
    this.rightLeg.rotation.x = -0.1 * t;

    // Torso twists slightly
    this.torsoGroup.rotation.y = Math.sin(t * 8) * 0.2 * (1 - t);
    this.torsoGroup.rotation.x = 0;
    this.torsoGroup.rotation.z = 0;

    // Slight lift off ground toward end (Enderman picking up)
    if (t > 0.5) {
      this.mesh.position.y = (t - 0.5) * 0.6;
    }

    return t < 1;
  }

  getBoundingBox(): THREE.Box3 {
    const pos = this.mesh.position;
    const halfW = 0.35;
    const height = this.isSliding ? 0.5 : 1.8;
    const yBase = pos.y;
    return new THREE.Box3(
      new THREE.Vector3(pos.x - halfW, yBase, pos.z - halfW),
      new THREE.Vector3(pos.x + halfW, yBase + height, pos.z + halfW),
    );
  }

  reset(): void {
    this.lane = 1;
    this.targetX = LANE_POSITIONS[1];
    this.mesh.position.set(LANE_POSITIONS[1], 0, 0);
    this.velocityY = 0;
    this.isJumping = false;
    this.isSliding = false;
    this.isAlive = true;
    this.slideTimer = 0;
    this.deathTimer = 0;
    this.fallEdgeZ = Infinity;
    this.edgeFallSide = 0;
    this.runPhase = 0;
    this.gameSpeed = 12;

    // Reset body group
    this.bodyGroup.position.y = 0;
    this.bodyGroup.rotation.set(0, 0, 0);

    // Reset torso
    this.torsoGroup.rotation.set(0, 0, 0);
    this.headGroup.rotation.set(0, 0, 0);

    // Reset arms
    this.leftArm.rotation.set(0, 0, 0);
    this.rightArm.rotation.set(0, 0, 0);

    // Reset legs
    this.leftLeg.rotation.set(0, 0, 0);
    this.rightLeg.rotation.set(0, 0, 0);
  }
}
