import * as THREE from 'three';
import {
  SEGMENT_LENGTH, SEGMENT_WIDTH, SEGMENTS_AHEAD, SEGMENTS_BEHIND,
  LANE_POSITIONS,
  OBSTACLE_START_DISTANCE,
  COIN_RADIUS, COIN_HEIGHT, COIN_SPACING, COIN_TIERS,
  OBSTACLE_COLORS,
  SEGMENT_THEMES, SEGMENT_POOL_SIZE,
  TORCH_LIGHT_COLOR, TORCH_LIGHT_INTENSITY, TORCH_LIGHT_DISTANCE,
  PILLAR_COLOR, ARCHWAY_COLOR,
  WALL_WIDTH, WALL_HEIGHT, WALL_INSET_DEPTH,
  PALETTE, BIOMES,
  type BiomeConfig,
} from './config.ts';
import { EventBus } from './EventBus.ts';
import type { DifficultyInfo } from './DifficultyManager.ts';
import type { PowerUpManager } from './PowerUpManager.ts';

export type ObstacleType = 'barrier' | 'low_hurdle' | 'high_barrier' | 'two_lane' | 'gap';

export interface Obstacle {
  mesh: THREE.Object3D;
  lanes: number[];     // lane indices this obstacle occupies
  z: number;
  type: ObstacleType;
  collected: boolean;
}

export interface Coin {
  z: number;
  lane: number;
  y: number;           // custom Y height (for arc patterns)
  collected: boolean;
  instanceId: number;
  tier: number;        // 0=gold, 1=red, 2=blue
}

interface Segment {
  group: THREE.Group;
  z: number;
  themeIndex: number;
  hasWalls: boolean;
}

// Pool entry: pre-created THREE.Group with all decorative children
interface PoolEntry {
  group: THREE.Group;
  inUse: boolean;
  floor: THREE.Mesh;
  leftWall: THREE.Mesh;
  rightWall: THREE.Mesh;
  leftInsets: THREE.Mesh[];
  rightInsets: THREE.Mesh[];
  floorStripes: THREE.Mesh[];
  torchLights: THREE.PointLight[];
  torchMeshes: THREE.Mesh[];
  pillars: THREE.Mesh[];
  archway: THREE.Group;
  // Biome-specific decoration meshes (all pre-created, toggled by applyBiomeDecor)
  templeDecor: THREE.Mesh[];
  jungleDecor: THREE.Mesh[];
  caveDecor: THREE.Mesh[];
  ruinsDecor: THREE.Mesh[];
  // Edge markers for open-edge segments
  edgeMarkers: THREE.Mesh[];
}

export class WorldGenerator {
  private segments: Segment[] = [];
  private obstacles: Obstacle[] = [];
  private coins: Coin[] = [];
  private scene: THREE.Scene;
  private generationCursor = 0;
  private lastObstacleZ = -Infinity;
  private lastFrenzyZ = -Infinity;
  private segmentIndex = 0;

  // Difficulty info (updated from Game each frame)
  private difficulty: DifficultyInfo = {
    scalar: 0, tier: 0, speed: 12, density: 0.2, minGap: 18,
  };

  // Optional power-up manager for spawning power-ups during generation
  private powerUpManager: PowerUpManager | null = null;

  // Instanced meshes for coins (one per tier)
  coinInstances: THREE.InstancedMesh[];
  private maxCoins = 300;
  private coinCount = 0;
  private coinDummy = new THREE.Object3D();
  private coinRotation = 0;
  private currentDistance = 0; // tracked for coin tier selection

  // Per-theme materials
  private themeMaterials: {
    floor: THREE.MeshStandardMaterial;
    wall: THREE.MeshStandardMaterial;
    accent: THREE.MeshStandardMaterial;
  }[];
  private stripeMats: THREE.MeshStandardMaterial[];
  private obstacleMats: Record<ObstacleType, THREE.MeshStandardMaterial>;
  private pillarMat: THREE.MeshStandardMaterial;
  private archwayMat: THREE.MeshStandardMaterial;
  private torchStickMat: THREE.MeshStandardMaterial;
  private torchTopMat: THREE.MeshStandardMaterial;

  // Biome-specific obstacle materials
  private obstBiomeMats: Record<string, THREE.MeshStandardMaterial>;
  private obstBiomeAccentMats: Record<string, THREE.MeshStandardMaterial>;

  // Shared obstacle geometries (biome-themed variants)
  private obstBarrierBoxGeo: THREE.BoxGeometry;
  private obstBarrierSlabGeo: THREE.BoxGeometry;
  private obstLogGeo: THREE.CylinderGeometry;
  private obstLogCapGeo: THREE.CircleGeometry;
  private obstBoulderGeo: THREE.DodecahedronGeometry;
  private obstRuinWallGeo: THREE.BoxGeometry;
  private obstDebrisGeo: THREE.BoxGeometry;
  private obstHurdleBoxGeo: THREE.BoxGeometry;
  private obstRootTorusGeo: THREE.TorusGeometry;
  private obstRootBoxGeo: THREE.BoxGeometry;
  private obstStalagConeGeo: THREE.ConeGeometry;
  private obstRubbleGeo: THREE.BoxGeometry;
  private obstLintelGeo: THREE.BoxGeometry;
  private obstPillarGeo: THREE.CylinderGeometry;
  private obstBranchGeo: THREE.CylinderGeometry;
  private obstTrunkGeo: THREE.CylinderGeometry;
  private obstShelfGeo: THREE.BoxGeometry;
  private obstStalactiteGeo: THREE.ConeGeometry;
  private obstArchGeo: THREE.BoxGeometry;
  private obstArchSupportGeo: THREE.BoxGeometry;
  private obstGapEdgeGeo: THREE.BoxGeometry;

  // Shared geometries
  private pathGeo: THREE.BoxGeometry;
  private wallGeo: THREE.BoxGeometry;
  private wallInsetGeo: THREE.BoxGeometry;
  private pillarGeo: THREE.CylinderGeometry;
  private torchStickGeo: THREE.BoxGeometry;
  private torchTopGeo: THREE.BoxGeometry;
  private stripeGeo: THREE.BoxGeometry;
  private archwayPillarGeo: THREE.CylinderGeometry;
  private archwayBeamGeo: THREE.BoxGeometry;

  // Segment object pool
  private pool: PoolEntry[] = [];
  private segmentToPool = new Map<THREE.Group, PoolEntry>();

  // Current biome name (tracked for decoration switching)
  private currentBiomeName = 'Jungle';

  // Shared biome decoration geometries
  private reliefPanelGeo: THREE.BoxGeometry;
  private tileLineGeoX: THREE.BoxGeometry;
  private tileLineGeoZ: THREE.BoxGeometry;
  private vineGeo: THREE.CylinderGeometry;
  private mossPatchGeo: THREE.BoxGeometry;
  private rootBumpGeo: THREE.BoxGeometry;
  private stalactiteGeo: THREE.ConeGeometry;
  private crystalGeo: THREE.OctahedronGeometry;
  private crumbledBlockGeo: THREE.BoxGeometry;
  private pillarStumpGeo: THREE.CylinderGeometry;
  private sandDriftGeo: THREE.BoxGeometry;
  private crackLineGeo: THREE.BoxGeometry;

  // Edge marker for open-edge segments
  private edgeMarkerGeo: THREE.BoxGeometry;
  private edgeMarkerMat: THREE.MeshStandardMaterial;

  // Shared biome decoration materials
  private reliefMat: THREE.MeshStandardMaterial;
  private tileLineMat: THREE.MeshStandardMaterial;
  private vineMat: THREE.MeshStandardMaterial;
  private mossMat: THREE.MeshStandardMaterial;
  private rootMat: THREE.MeshStandardMaterial;
  private stalactiteMat: THREE.MeshStandardMaterial;
  private crystalMat: THREE.MeshStandardMaterial;
  private crumbledMat: THREE.MeshStandardMaterial;
  private sandDriftMat: THREE.MeshStandardMaterial;
  private crackMat: THREE.MeshStandardMaterial;
  private caveFloorOverlayMat: THREE.MeshStandardMaterial;

  constructor(scene: THREE.Scene, private bus: EventBus) {
    this.scene = scene;

    // Per-theme materials (dirt/earth path look)
    this.themeMaterials = SEGMENT_THEMES.map((t) => ({
      floor: new THREE.MeshStandardMaterial({ color: t.floor, roughness: 0.85, metalness: 0 }),
      wall: new THREE.MeshStandardMaterial({ color: t.wall, roughness: 0.9, metalness: 0 }),
      accent: new THREE.MeshStandardMaterial({ color: t.accent, roughness: 0.8, metalness: 0 }),
    }));

    // Per-theme stripe materials (worn track lines in the dirt — start with Jungle)
    this.stripeMats = BIOMES[0].stripes.map(c => new THREE.MeshStandardMaterial({
      color: c, metalness: 0, roughness: 0.9,
    }));

    // Per-type obstacle materials
    this.obstacleMats = {
      barrier:      new THREE.MeshStandardMaterial({ color: OBSTACLE_COLORS.barrier }),
      low_hurdle:   new THREE.MeshStandardMaterial({ color: OBSTACLE_COLORS.low_hurdle }),
      high_barrier: new THREE.MeshStandardMaterial({ color: OBSTACLE_COLORS.high_barrier }),
      two_lane:     new THREE.MeshStandardMaterial({ color: OBSTACLE_COLORS.two_lane }),
      gap:          new THREE.MeshStandardMaterial({ color: OBSTACLE_COLORS.gap }),
    };

    // Biome-specific obstacle materials (derived from biome config)
    this.obstBiomeMats = {} as Record<string, THREE.MeshStandardMaterial>;
    this.obstBiomeAccentMats = {} as Record<string, THREE.MeshStandardMaterial>;
    for (const biome of BIOMES) {
      this.obstBiomeMats[biome.name] = new THREE.MeshStandardMaterial({ color: biome.obstacleColor, roughness: 0.85 });
      this.obstBiomeAccentMats[biome.name] = new THREE.MeshStandardMaterial({ color: biome.obstacleAccent, roughness: 0.85 });
    }

    this.pillarMat = new THREE.MeshStandardMaterial({ color: PILLAR_COLOR });
    this.archwayMat = new THREE.MeshStandardMaterial({ color: ARCHWAY_COLOR });
    // Minecraft-style torch: dark brown stick with bright orange/yellow flame top
    this.torchStickMat = new THREE.MeshStandardMaterial({
      color: PALETTE.decor.torchStick,
      roughness: 0.9,
      metalness: 0,
    });
    this.torchTopMat = new THREE.MeshStandardMaterial({
      color: PALETTE.decor.torchFlame,
      emissive: PALETTE.decor.torchEmissive,
      emissiveIntensity: 2.0,
    });

    // Shared geometries
    this.pathGeo = new THREE.BoxGeometry(SEGMENT_WIDTH, 0.5, SEGMENT_LENGTH);
    this.wallGeo = new THREE.BoxGeometry(WALL_WIDTH, WALL_HEIGHT, SEGMENT_LENGTH);
    this.wallInsetGeo = new THREE.BoxGeometry(WALL_INSET_DEPTH, WALL_HEIGHT * 0.6, 2.5);
    this.pillarGeo = new THREE.CylinderGeometry(0.25, 0.3, WALL_HEIGHT, 8);
    // Minecraft torch: square stick (2px wide in 16px texture = 0.1 units) and square flame top
    this.torchStickGeo = new THREE.BoxGeometry(0.1, 0.5, 0.1);
    this.torchTopGeo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
    this.stripeGeo = new THREE.BoxGeometry(SEGMENT_WIDTH - 0.1, 0.02, 0.3);
    this.archwayPillarGeo = new THREE.CylinderGeometry(0.3, 0.35, WALL_HEIGHT + 0.5, 8);
    this.archwayBeamGeo = new THREE.BoxGeometry(SEGMENT_WIDTH + WALL_WIDTH * 2, 0.5, 0.8);

    // Shared obstacle geometries for biome-themed variants
    this.obstBarrierBoxGeo = new THREE.BoxGeometry(2, 1.7, 0.5);
    this.obstBarrierSlabGeo = new THREE.BoxGeometry(2.2, 0.3, 0.6);
    this.obstLogGeo = new THREE.CylinderGeometry(0.5, 0.5, 2, 10);
    this.obstLogCapGeo = new THREE.CircleGeometry(0.5, 10);
    this.obstBoulderGeo = new THREE.DodecahedronGeometry(1.0);
    this.obstRuinWallGeo = new THREE.BoxGeometry(2, 1.6, 0.4);
    this.obstDebrisGeo = new THREE.BoxGeometry(0.4, 0.3, 0.3);
    this.obstHurdleBoxGeo = new THREE.BoxGeometry(2, 0.6, 0.6);
    this.obstRootTorusGeo = new THREE.TorusGeometry(0.4, 0.12, 6, 8);
    this.obstRootBoxGeo = new THREE.BoxGeometry(1.2, 0.3, 0.5);
    this.obstStalagConeGeo = new THREE.ConeGeometry(0.15, 0.5, 6);
    this.obstRubbleGeo = new THREE.BoxGeometry(0.5, 0.35, 0.4);
    this.obstLintelGeo = new THREE.BoxGeometry(2, 0.3, 0.5);
    this.obstPillarGeo = new THREE.CylinderGeometry(0.15, 0.18, 1.7, 6);
    this.obstBranchGeo = new THREE.CylinderGeometry(0.15, 0.12, 2, 8);
    this.obstTrunkGeo = new THREE.CylinderGeometry(0.12, 0.15, 1.7, 6);
    this.obstShelfGeo = new THREE.BoxGeometry(2, 0.25, 0.8);
    this.obstStalactiteGeo = new THREE.ConeGeometry(0.1, 0.4, 5);
    this.obstArchGeo = new THREE.BoxGeometry(2, 0.35, 0.5);
    this.obstArchSupportGeo = new THREE.BoxGeometry(0.25, 1.5, 0.4);
    this.obstGapEdgeGeo = new THREE.BoxGeometry(0.15, 0.15, 2.5);

    // Edge marker for open-edge segments (thin strip at floor level)
    this.edgeMarkerGeo = new THREE.BoxGeometry(0.15, 0.06, SEGMENT_LENGTH);
    this.edgeMarkerMat = new THREE.MeshStandardMaterial({
      color: PALETTE.decor.edgeMarker, roughness: 0.9, metalness: 0,
    });

    // Biome decoration geometries
    this.reliefPanelGeo = new THREE.BoxGeometry(0.08, WALL_HEIGHT * 0.6, 2.0);
    this.tileLineGeoX = new THREE.BoxGeometry(SEGMENT_WIDTH - 0.5, 0.02, 0.06);
    this.tileLineGeoZ = new THREE.BoxGeometry(0.06, 0.02, SEGMENT_LENGTH);
    this.vineGeo = new THREE.CylinderGeometry(0.04, 0.03, 1.5, 5);
    this.mossPatchGeo = new THREE.BoxGeometry(0.6, 0.05, 0.4);
    this.rootBumpGeo = new THREE.BoxGeometry(0.8, 0.2, 0.6);
    this.stalactiteGeo = new THREE.ConeGeometry(0.15, 0.8, 6);
    this.crystalGeo = new THREE.OctahedronGeometry(0.18);
    this.crumbledBlockGeo = new THREE.BoxGeometry(0.5, 0.4, 0.5);
    this.pillarStumpGeo = new THREE.CylinderGeometry(0.2, 0.25, 0.7, 6);
    this.sandDriftGeo = new THREE.BoxGeometry(1.2, 0.15, 2.0);
    this.crackLineGeo = new THREE.BoxGeometry(2.5, 0.02, 0.04);

    // Biome decoration materials (derived from PALETTE)
    this.reliefMat = new THREE.MeshStandardMaterial({ color: PALETTE.biomeDecor.relief, roughness: 0.9 });
    this.tileLineMat = new THREE.MeshStandardMaterial({ color: PALETTE.biomeDecor.tileLine, roughness: 0.85 });
    this.vineMat = new THREE.MeshStandardMaterial({ color: PALETTE.biomeDecor.vine, roughness: 0.7 });
    this.mossMat = new THREE.MeshStandardMaterial({
      color: PALETTE.biomeDecor.moss, emissive: PALETTE.biomeDecor.mossEmissive, emissiveIntensity: 0.2,
    });
    this.rootMat = new THREE.MeshStandardMaterial({ color: PALETTE.biomeDecor.root, roughness: 0.9 });
    this.stalactiteMat = new THREE.MeshStandardMaterial({ color: PALETTE.biomeDecor.stalactite, roughness: 0.85 });
    this.crystalMat = new THREE.MeshStandardMaterial({
      color: PALETTE.biomeDecor.crystal, emissive: PALETTE.biomeDecor.crystalEmissive, emissiveIntensity: 0.6, roughness: 0.3,
    });
    this.crumbledMat = new THREE.MeshStandardMaterial({ color: PALETTE.biomeDecor.crumbled, roughness: 0.9 });
    this.sandDriftMat = new THREE.MeshStandardMaterial({ color: PALETTE.biomeDecor.sandDrift, roughness: 0.8 });
    this.crackMat = new THREE.MeshStandardMaterial({ color: PALETTE.biomeDecor.crack, roughness: 0.9 });
    this.caveFloorOverlayMat = new THREE.MeshStandardMaterial({
      color: PALETTE.biomeDecor.caveFloorOverlay, metalness: 0.3, roughness: 0.4, transparent: true, opacity: 0.4,
    });

    // Instanced coin meshes (one per tier)
    const coinGeo = new THREE.CylinderGeometry(COIN_RADIUS, COIN_RADIUS, 0.08, 12);
    this.coinInstances = COIN_TIERS.map(tier => {
      const mat = new THREE.MeshStandardMaterial({
        color: tier.color,
        metalness: 0.6,
        roughness: 0.3,
      });
      const mesh = new THREE.InstancedMesh(coinGeo, mat, this.maxCoins);
      mesh.count = 0;
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      scene.add(mesh);
      return mesh;
    });

    // Pre-create segment pool
    this.initPool();
  }

  // ---- Pool management ----

  private initPool(): void {
    for (let i = 0; i < SEGMENT_POOL_SIZE; i++) {
      this.pool.push(this.createPoolEntry());
    }
  }

  private createPoolEntry(): PoolEntry {
    const group = new THREE.Group();
    const wallXOffset = SEGMENT_WIDTH / 2 + WALL_WIDTH / 2;

    // Floor
    const floor = new THREE.Mesh(this.pathGeo, this.themeMaterials[0].floor);
    floor.position.set(0, -0.25, SEGMENT_LENGTH / 2);
    floor.receiveShadow = true;
    group.add(floor);

    // Floor stripes (3 per segment for visual texture)
    const floorStripes: THREE.Mesh[] = [];
    for (let s = 0; s < 3; s++) {
      const stripe = new THREE.Mesh(this.stripeGeo, this.stripeMats[0]);
      stripe.position.set(0, 0.01, 3 + s * 6.5);
      stripe.receiveShadow = true;
      group.add(stripe);
      floorStripes.push(stripe);
    }

    // Left wall (wider, taller temple walls)
    const leftWall = new THREE.Mesh(this.wallGeo, this.themeMaterials[0].wall);
    leftWall.position.set(-wallXOffset, WALL_HEIGHT / 2 - 0.25, SEGMENT_LENGTH / 2);
    leftWall.castShadow = true;
    leftWall.receiveShadow = true;
    group.add(leftWall);

    // Right wall
    const rightWall = new THREE.Mesh(this.wallGeo, this.themeMaterials[0].wall);
    rightWall.position.set(wallXOffset, WALL_HEIGHT / 2 - 0.25, SEGMENT_LENGTH / 2);
    rightWall.castShadow = true;
    rightWall.receiveShadow = true;
    group.add(rightWall);

    // Wall inset details (3 per side - recessed rectangular panels)
    const leftInsets: THREE.Mesh[] = [];
    const rightInsets: THREE.Mesh[] = [];
    for (let n = 0; n < 3; n++) {
      const zOff = 3 + n * 6.5;

      const li = new THREE.Mesh(this.wallInsetGeo, this.themeMaterials[0].accent);
      li.position.set(-wallXOffset + WALL_WIDTH / 2 + WALL_INSET_DEPTH / 2, WALL_HEIGHT / 2, zOff);
      group.add(li);
      leftInsets.push(li);

      const ri = new THREE.Mesh(this.wallInsetGeo, this.themeMaterials[0].accent);
      ri.position.set(wallXOffset - WALL_WIDTH / 2 - WALL_INSET_DEPTH / 2, WALL_HEIGHT / 2, zOff);
      group.add(ri);
      rightInsets.push(ri);
    }

    // Minecraft-style torches (one per wall side at segment midpoint)
    const torchLights: THREE.PointLight[] = [];
    const torchMeshes: THREE.Mesh[] = [];
    for (let side = -1; side <= 1; side += 2) {
      const xPos = side * wallXOffset;
      const zPos = SEGMENT_LENGTH / 2;
      const torchX = xPos + side * (WALL_WIDTH / 2 + 0.08);
      const torchBaseY = WALL_HEIGHT * 0.55;

      // Brown square stick — flat against wall, angled slightly outward
      const stick = new THREE.Mesh(this.torchStickGeo, this.torchStickMat);
      stick.position.set(torchX, torchBaseY, zPos);
      stick.rotation.z = side * Math.PI / 12; // slight tilt away from wall
      stick.castShadow = true;
      group.add(stick);
      torchMeshes.push(stick);

      // Orange/yellow flame block on top of stick
      const flameTop = new THREE.Mesh(this.torchTopGeo, this.torchTopMat);
      const stickTopY = torchBaseY + 0.28;
      flameTop.position.set(torchX + side * 0.02, stickTopY, zPos);
      group.add(flameTop);
      torchMeshes.push(flameTop);

      // Point light for warm glow
      const light = new THREE.PointLight(
        TORCH_LIGHT_COLOR,
        TORCH_LIGHT_INTENSITY,
        TORCH_LIGHT_DISTANCE,
      );
      light.position.set(torchX, stickTopY + 0.1, zPos);
      group.add(light);
      torchLights.push(light);
    }

    // Pillars (at segment corners, toggled per segment)
    const pillars: THREE.Mesh[] = [];
    for (let side = -1; side <= 1; side += 2) {
      const xPos = side * (SEGMENT_WIDTH / 2 - 0.1);
      for (let p = 0; p < 2; p++) {
        const zPos = 1 + p * (SEGMENT_LENGTH - 2);
        const pillar = new THREE.Mesh(this.pillarGeo, this.pillarMat);
        pillar.position.set(xPos, WALL_HEIGHT / 2 - 0.25, zPos);
        pillar.visible = false;
        group.add(pillar);
        pillars.push(pillar);
      }
    }

    // Archway (at segment entrance, toggled per segment)
    const archwayGroup = new THREE.Group();
    archwayGroup.visible = false;
    for (let side = -1; side <= 1; side += 2) {
      const ap = new THREE.Mesh(this.archwayPillarGeo, this.archwayMat);
      ap.position.set(side * wallXOffset, (WALL_HEIGHT + 0.5) / 2 - 0.25, 0);
      archwayGroup.add(ap);
    }
    const beam = new THREE.Mesh(this.archwayBeamGeo, this.archwayMat);
    beam.position.set(0, WALL_HEIGHT + 0.0, 0);
    archwayGroup.add(beam);
    group.add(archwayGroup);

    // ---- Biome-specific decorations (all pre-created, hidden by default) ----
    const wallXOuter = SEGMENT_WIDTH / 2 + WALL_WIDTH / 2;

    // TEMPLE: 2 relief panels per wall + 3 tile grid cross-lines
    const templeDecor: THREE.Mesh[] = [];
    for (let side = -1; side <= 1; side += 2) {
      for (let i = 0; i < 2; i++) {
        const relief = new THREE.Mesh(this.reliefPanelGeo, this.reliefMat);
        const xSign = side;
        relief.position.set(
          xSign * (wallXOuter - WALL_WIDTH / 2 - 0.02),
          WALL_HEIGHT / 2,
          5 + i * 9,
        );
        relief.visible = false;
        relief.castShadow = false;
        group.add(relief);
        templeDecor.push(relief);
      }
    }
    // Tile grid lines on floor (3 cross-lines + 2 lengthwise)
    for (let i = 0; i < 3; i++) {
      const tileLine = new THREE.Mesh(this.tileLineGeoX, this.tileLineMat);
      tileLine.position.set(0, 0.02, 3 + i * 7);
      tileLine.visible = false;
      tileLine.castShadow = false;
      group.add(tileLine);
      templeDecor.push(tileLine);
    }
    for (let lx = -1; lx <= 1; lx += 2) {
      const tileLine = new THREE.Mesh(this.tileLineGeoZ, this.tileLineMat);
      tileLine.position.set(lx * 2.0, 0.02, SEGMENT_LENGTH / 2);
      tileLine.visible = false;
      tileLine.castShadow = false;
      group.add(tileLine);
      templeDecor.push(tileLine);
    }

    // JUNGLE: 3 vines + 2 moss patches + 2 root bumps
    const jungleDecor: THREE.Mesh[] = [];
    for (let i = 0; i < 3; i++) {
      const vine = new THREE.Mesh(this.vineGeo, this.vineMat);
      const side = i < 2 ? -1 : 1;
      vine.position.set(
        side * (SEGMENT_WIDTH / 2 - 0.3),
        WALL_HEIGHT - 0.75,
        3 + i * 6,
      );
      vine.visible = false;
      vine.castShadow = false;
      group.add(vine);
      jungleDecor.push(vine);
    }
    for (let i = 0; i < 2; i++) {
      const moss = new THREE.Mesh(this.mossPatchGeo, this.mossMat);
      const side = i === 0 ? -1 : 1;
      moss.position.set(
        side * (wallXOuter - WALL_WIDTH / 2 + 0.05),
        WALL_HEIGHT * 0.4 + i * (WALL_HEIGHT * 0.35),
        SEGMENT_LENGTH * 0.3 + i * SEGMENT_LENGTH * 0.4,
      );
      moss.visible = false;
      moss.castShadow = false;
      group.add(moss);
      jungleDecor.push(moss);
    }
    for (let i = 0; i < 2; i++) {
      const root = new THREE.Mesh(this.rootBumpGeo, this.rootMat);
      const side = i === 0 ? -1 : 1;
      root.position.set(
        side * (SEGMENT_WIDTH / 2 - 0.6),
        -0.1,
        4 + i * 11,
      );
      root.visible = false;
      root.castShadow = false;
      group.add(root);
      jungleDecor.push(root);
    }

    // CAVE: 3 stalactites + 3 crystals + wet floor overlay
    const caveDecor: THREE.Mesh[] = [];
    for (let i = 0; i < 3; i++) {
      const stalactite = new THREE.Mesh(this.stalactiteGeo, this.stalactiteMat);
      stalactite.rotation.x = Math.PI; // point downward
      const xOff = (i - 1) * 2.0;
      stalactite.position.set(xOff, WALL_HEIGHT - 0.4, 4 + i * 6);
      stalactite.visible = false;
      stalactite.castShadow = false;
      group.add(stalactite);
      caveDecor.push(stalactite);
    }
    for (let i = 0; i < 3; i++) {
      const crystal = new THREE.Mesh(this.crystalGeo, this.crystalMat);
      const side = i < 2 ? -1 : 1;
      crystal.position.set(
        side * (wallXOuter - WALL_WIDTH / 2 + 0.05),
        0.5 + i * 0.6,
        3 + i * 7,
      );
      crystal.rotation.set(0.3 * i, 0.5 * i, 0.2);
      crystal.visible = false;
      crystal.castShadow = false;
      group.add(crystal);
      caveDecor.push(crystal);
    }
    // Wet floor overlay (translucent reflective layer on top of floor)
    const wetFloor = new THREE.Mesh(this.pathGeo, this.caveFloorOverlayMat);
    wetFloor.position.set(0, -0.24, SEGMENT_LENGTH / 2);
    wetFloor.visible = false;
    wetFloor.castShadow = false;
    wetFloor.receiveShadow = true;
    group.add(wetFloor);
    caveDecor.push(wetFloor);

    // RUINS: 3 crumbled blocks + 2 pillar stumps + 2 sand drifts + 2 crack lines
    const ruinsDecor: THREE.Mesh[] = [];
    for (let i = 0; i < 3; i++) {
      const block = new THREE.Mesh(this.crumbledBlockGeo, this.crumbledMat);
      const side = i === 1 ? 1 : -1;
      block.position.set(
        side * (SEGMENT_WIDTH / 2 - 0.5 - i * 0.2),
        0.0,
        3 + i * 6.5,
      );
      block.rotation.y = i * 0.4;
      block.visible = false;
      block.castShadow = false;
      group.add(block);
      ruinsDecor.push(block);
    }
    for (let i = 0; i < 2; i++) {
      const stump = new THREE.Mesh(this.pillarStumpGeo, this.pillarMat);
      const side = i === 0 ? -1 : 1;
      stump.position.set(
        side * (SEGMENT_WIDTH / 2 - 0.3),
        0.1,
        5 + i * 10,
      );
      stump.visible = false;
      stump.castShadow = false;
      group.add(stump);
      ruinsDecor.push(stump);
    }
    for (let i = 0; i < 2; i++) {
      const drift = new THREE.Mesh(this.sandDriftGeo, this.sandDriftMat);
      const side = i === 0 ? -1 : 1;
      drift.position.set(
        side * (SEGMENT_WIDTH / 2 - 0.8),
        -0.15,
        4 + i * 11,
      );
      drift.visible = false;
      drift.castShadow = false;
      group.add(drift);
      ruinsDecor.push(drift);
    }
    for (let i = 0; i < 2; i++) {
      const crack = new THREE.Mesh(this.crackLineGeo, this.crackMat);
      crack.position.set(
        -0.5 + i * 1.0,
        0.01,
        6 + i * 8,
      );
      crack.rotation.y = -0.2 + i * 0.4;
      crack.visible = false;
      crack.castShadow = false;
      group.add(crack);
      ruinsDecor.push(crack);
    }

    // Edge markers (thin red/brown strips at floor level along path edges)
    const edgeMarkers: THREE.Mesh[] = [];
    for (let side = -1; side <= 1; side += 2) {
      const marker = new THREE.Mesh(this.edgeMarkerGeo, this.edgeMarkerMat);
      marker.position.set(side * (SEGMENT_WIDTH / 2 - 0.05), 0.03, SEGMENT_LENGTH / 2);
      marker.visible = false;
      group.add(marker);
      edgeMarkers.push(marker);
    }

    return {
      group,
      inUse: false,
      floor,
      leftWall,
      rightWall,
      leftInsets,
      rightInsets,
      floorStripes,
      torchLights,
      torchMeshes,
      pillars,
      archway: archwayGroup,
      templeDecor,
      jungleDecor,
      caveDecor,
      ruinsDecor,
      edgeMarkers,
    };
  }

  private acquirePoolEntry(): PoolEntry {
    for (const entry of this.pool) {
      if (!entry.inUse) {
        entry.inUse = true;
        return entry;
      }
    }
    // Pool exhausted - grow dynamically
    const entry = this.createPoolEntry();
    entry.inUse = true;
    this.pool.push(entry);
    return entry;
  }

  private releasePoolEntry(entry: PoolEntry): void {
    entry.inUse = false;
    this.scene.remove(entry.group);
    // Reset visibility for clean reuse
    for (const p of entry.pillars) p.visible = false;
    entry.archway.visible = false;
    for (const t of entry.torchMeshes) t.visible = true;
    for (const l of entry.torchLights) l.visible = true;
    entry.leftWall.visible = true;
    entry.rightWall.visible = true;
    for (const inset of entry.leftInsets) inset.visible = true;
    for (const inset of entry.rightInsets) inset.visible = true;
    for (const marker of entry.edgeMarkers) marker.visible = false;
    // Reset biome-specific decorations and torch overrides
    this.resetBiomeDecor(entry);
  }

  private applyBiomeDecor(entry: PoolEntry, biomeName: string): void {
    // Hide all biome decorations first
    for (const m of entry.templeDecor) m.visible = false;
    for (const m of entry.jungleDecor) m.visible = false;
    for (const m of entry.caveDecor) m.visible = false;
    for (const m of entry.ruinsDecor) m.visible = false;

    // Find the biome config for torch tint
    const biome = BIOMES.find(b => b.name === biomeName);
    if (biome) {
      for (const l of entry.torchLights) {
        l.color.setHex(biome.torchTint);
        l.intensity = biomeName === 'Cave' ? TORCH_LIGHT_INTENSITY * 0.3 : TORCH_LIGHT_INTENSITY;
      }
    }

    // Show decorations for the active biome
    switch (biomeName) {
      case 'Temple':
        for (const m of entry.templeDecor) m.visible = true;
        break;
      case 'Jungle':
        for (const m of entry.jungleDecor) m.visible = true;
        break;
      case 'Cave':
        for (const m of entry.caveDecor) m.visible = true;
        break;
      case 'Ruins':
        for (const m of entry.ruinsDecor) m.visible = true;
        break;
    }
  }

  private resetBiomeDecor(entry: PoolEntry): void {
    // Hide all biome decorations
    for (const m of entry.templeDecor) m.visible = false;
    for (const m of entry.jungleDecor) m.visible = false;
    for (const m of entry.caveDecor) m.visible = false;
    for (const m of entry.ruinsDecor) m.visible = false;

    // Reset torch lights to defaults
    for (const l of entry.torchLights) {
      l.color.setHex(TORCH_LIGHT_COLOR);
      l.intensity = TORCH_LIGHT_INTENSITY;
    }
  }

  // ---- Difficulty ----

  setDifficulty(info: DifficultyInfo): void {
    this.difficulty = info;
  }

  setPowerUpManager(pm: PowerUpManager): void {
    this.powerUpManager = pm;
  }

  setBiome(biome: BiomeConfig): void {
    this.currentBiomeName = biome.name;
    // Update theme materials so new segments pick up biome colors
    for (let i = 0; i < biome.themes.length && i < this.themeMaterials.length; i++) {
      this.themeMaterials[i].floor.color.setHex(biome.themes[i].floor);
      this.themeMaterials[i].wall.color.setHex(biome.themes[i].wall);
      this.themeMaterials[i].accent.color.setHex(biome.themes[i].accent);
    }
    // Update stripe materials for biome-specific floor tones
    for (let i = 0; i < biome.stripes.length && i < this.stripeMats.length; i++) {
      this.stripeMats[i].color.setHex(biome.stripes[i]);
    }
  }

  // ---- Generation ----

  generate(playerZ: number): void {
    // Despawn behind
    while (this.segments.length > 0 && this.segments[0].z < playerZ - SEGMENTS_BEHIND * SEGMENT_LENGTH) {
      const seg = this.segments.shift()!;
      const poolEntry = this.segmentToPool.get(seg.group);
      if (poolEntry) {
        this.releasePoolEntry(poolEntry);
        this.segmentToPool.delete(seg.group);
      } else {
        this.scene.remove(seg.group);
      }
    }

    // Remove passed obstacles
    this.obstacles = this.obstacles.filter(o => {
      if (o.z < playerZ - SEGMENT_LENGTH) {
        this.scene.remove(o.mesh);
        return false;
      }
      return true;
    });

    // Spawn ahead
    while (this.generationCursor < playerZ + SEGMENTS_AHEAD * SEGMENT_LENGTH) {
      this.spawnSegment(this.generationCursor);
      this.spawnObstacles(this.generationCursor);
      this.spawnCoins(this.generationCursor);
      this.powerUpManager?.trySpawnForSegment(this.generationCursor);
      this.generationCursor += SEGMENT_LENGTH;
    }
  }

  private spawnSegment(z: number): void {
    const themeIndex = this.segmentIndex % SEGMENT_THEMES.length;
    const theme = this.themeMaterials[themeIndex];

    const entry = this.acquirePoolEntry();
    const group = entry.group;

    // Position group at segment's Z origin (children use local coords)
    group.position.set(0, 0, z);

    // Swap materials to match theme
    entry.floor.material = theme.floor;
    entry.leftWall.material = theme.wall;
    entry.rightWall.material = theme.wall;
    for (const inset of entry.leftInsets) inset.material = theme.accent;
    for (const inset of entry.rightInsets) inset.material = theme.accent;
    for (const stripe of entry.floorStripes) stripe.material = this.stripeMats[themeIndex];

    // Toggle decorations for variety
    const showPillars = this.segmentIndex % 3 === 1;
    const showTorches = this.segmentIndex % 2 === 0;

    for (const p of entry.pillars) p.visible = showPillars;
    entry.archway.visible = false;
    for (const t of entry.torchMeshes) t.visible = showTorches;
    for (const l of entry.torchLights) l.visible = showTorches;

    // Determine if this segment has walls
    const wallChance = this.currentBiomeName === 'Cave' ? 1.0 : 0.65;
    const hasWalls = Math.random() < wallChance;

    if (!hasWalls) {
      entry.leftWall.visible = false;
      entry.rightWall.visible = false;
      for (const inset of entry.leftInsets) inset.visible = false;
      for (const inset of entry.rightInsets) inset.visible = false;
      // Hide wall-mounted torches on open segments
      for (const t of entry.torchMeshes) t.visible = false;
      for (const l of entry.torchLights) l.visible = false;
      // Show edge markers as visual warning
      for (const marker of entry.edgeMarkers) marker.visible = true;
    }

    // Apply biome-specific decorations (only wall decorations if walls exist)
    this.applyBiomeDecor(entry, this.currentBiomeName);
    // Hide wall-specific biome decorations on open segments
    if (!hasWalls) {
      // Temple relief panels are on walls
      for (const m of entry.templeDecor) {
        // Relief panels are the first 4 (2 per side), hide them
        const idx = entry.templeDecor.indexOf(m);
        if (idx < 4) m.visible = false;
      }
      // Jungle vines and moss are on walls
      for (const m of entry.jungleDecor) {
        const idx = entry.jungleDecor.indexOf(m);
        if (idx < 5) m.visible = false; // vines + moss patches
      }
      // Cave crystals are on walls
      for (const m of entry.caveDecor) {
        const idx = entry.caveDecor.indexOf(m);
        if (idx >= 3 && idx < 6) m.visible = false; // crystals
      }
    }

    this.scene.add(group);
    this.segmentToPool.set(group, entry);
    this.segments.push({ group, z, themeIndex, hasWalls });
    this.segmentIndex++;
  }

  // ---- Obstacles (difficulty-scaled) ----

  private spawnObstacles(segZ: number): void {
    if (segZ < OBSTACLE_START_DISTANCE) return;

    const { density, minGap, tier } = this.difficulty;

    // 1 obstacle per segment normally, occasionally 2 at high density
    const count = (density >= 0.4 && Math.random() < 0.3) ? 2 : 1;

    for (let i = 0; i < count; i++) {
      const obstZ = segZ + 4 + Math.random() * (SEGMENT_LENGTH - 8);

      if (obstZ - this.lastObstacleZ < minGap) continue;

      // Skip based on inverse density (lower density = more skips)
      if (Math.random() > density + 0.15) continue;

      const type = this.pickObstacleType(tier);
      const lanes = this.pickObstacleLanes(type);

      const obstacle = this.createObstacleMesh(type, lanes, obstZ);
      this.obstacles.push(obstacle);
      this.scene.add(obstacle.mesh);
      this.lastObstacleZ = obstZ;

      // Spawn guide coins in the safe lane(s) before this obstacle
      this.spawnGuideCoins(obstZ, lanes);
    }
  }

  private pickObstacleType(tier: number): ObstacleType {
    const roll = Math.random();
    // Temple Run feel: gaps (jump) and roots (stumble) are the core challenges.
    // Speed is the real difficulty — obstacles are spaced out but hit hard.
    if (tier === 0) {
      // 45% gap, 40% roots, 15% barrier — learn jump and stumble early
      if (roll < 0.45) return 'gap';
      if (roll < 0.85) return 'low_hurdle';
      return 'barrier';
    }
    if (tier === 1) {
      // 40% gap, 30% roots, 15% high_barrier (slide), 10% barrier, 5% two_lane
      if (roll < 0.40) return 'gap';
      if (roll < 0.70) return 'low_hurdle';
      if (roll < 0.85) return 'high_barrier';
      if (roll < 0.95) return 'barrier';
      return 'two_lane';
    }
    if (tier === 2) {
      // 35% gap, 25% roots, 20% high_barrier, 10% barrier, 10% two_lane
      if (roll < 0.35) return 'gap';
      if (roll < 0.60) return 'low_hurdle';
      if (roll < 0.80) return 'high_barrier';
      if (roll < 0.90) return 'barrier';
      return 'two_lane';
    }
    // Tier 3+: 35% gap, 20% roots, 20% high_barrier, 10% barrier, 15% two_lane
    if (roll < 0.35) return 'gap';
    if (roll < 0.55) return 'low_hurdle';
    if (roll < 0.75) return 'high_barrier';
    if (roll < 0.85) return 'barrier';
    return 'two_lane';
  }

  private pickObstacleLanes(type: ObstacleType): number[] {
    if (type === 'two_lane') {
      const pairs = [[0, 1], [1, 2]];
      return pairs[Math.floor(Math.random() * pairs.length)];
    }
    if (type === 'gap') {
      // Gaps span ALL lanes (full path width) — you must jump, can't dodge sideways
      return [0, 1, 2];
    }
    if (type === 'low_hurdle' && Math.random() < 0.45) {
      // Wide tree root crossing 2/3 of the path — dodge to the open lane
      const pairs = [[0, 1], [1, 2]];
      return pairs[Math.floor(Math.random() * pairs.length)];
    }
    return [Math.floor(Math.random() * 3)];
  }

  private createObstacleMesh(type: ObstacleType, lanes: number[], z: number): Obstacle {
    const laneXs = lanes.map(l => LANE_POSITIONS[l]);
    const centerX = laneXs.reduce((a, b) => a + b, 0) / laneXs.length;
    const biome = this.currentBiomeName;
    const mat = this.obstBiomeMats[biome] || this.obstacleMats[type];
    const accentMat = this.obstBiomeAccentMats[biome] || mat;

    const group = new THREE.Group();

    switch (type) {
      case 'barrier':
        this.buildBarrierGroup(group, biome, mat, accentMat);
        group.position.set(centerX, 0, z);
        break;

      case 'low_hurdle': {
        const hurdleWidth = lanes.length > 1
          ? Math.abs(laneXs[laneXs.length - 1] - laneXs[0]) + 2
          : undefined;
        this.buildHurdleGroup(group, biome, mat, accentMat, hurdleWidth);
        group.position.set(centerX, 0, z);
        break;
      }

      case 'high_barrier':
        this.buildHighBarrierGroup(group, biome, mat, accentMat);
        group.position.set(centerX, 0, z);
        break;

      case 'two_lane': {
        const spanWidth = Math.abs(laneXs[1] - laneXs[0]) + 2;
        this.buildBarrierGroup(group, biome, mat, accentMat, spanWidth);
        group.position.set(centerX, 0, z);
        break;
      }

      case 'gap': {
        // Full-width gap (Temple Run style) — entire path floor is missing, must jump
        const gapWidth = SEGMENT_WIDTH + 1.0; // wider than path so no floor peeks through
        const gapLength = 8.0;

        // Invisible depth-mask cover — occludes the floor underneath so the gap
        // shows sky/fog (transparent abyss) instead of a black box
        const voidMat = new THREE.MeshBasicMaterial({ colorWrite: false });
        const coverGeo = new THREE.BoxGeometry(gapWidth, 0.6, gapLength);
        const cover = new THREE.Mesh(coverGeo, voidMat);
        cover.position.set(0, -0.25, 0);
        cover.renderOrder = -1; // render before other geometry so depth mask takes effect
        group.add(cover);

        // Earthy front wall (visible as player approaches — the "cliff edge" of the broken path)
        const edgeMat = new THREE.MeshStandardMaterial({ color: PALETTE.biomeDecor.root, roughness: 0.95 });
        const edgeDepth = 2.0;
        // Front edge (the approaching side — player sees this cross-section of dirt/earth)
        const frontGeo = new THREE.BoxGeometry(gapWidth, edgeDepth, 0.2);
        const front = new THREE.Mesh(frontGeo, edgeMat);
        front.position.set(0, -edgeDepth / 2, -gapLength / 2);
        group.add(front);
        // Back edge
        const back = new THREE.Mesh(frontGeo, edgeMat);
        back.position.set(0, -edgeDepth / 2, gapLength / 2);
        group.add(back);

        // Crumbled edge detail at the rim
        for (let end = -1; end <= 1; end += 2) {
          for (let i = 0; i < 4; i++) {
            const chunkSize = 0.12 + Math.random() * 0.18;
            const chunkGeo = new THREE.BoxGeometry(chunkSize, chunkSize, chunkSize);
            const chunk = new THREE.Mesh(chunkGeo, edgeMat);
            chunk.position.set(
              (Math.random() - 0.5) * (gapWidth - 2),
              -0.15 - Math.random() * 0.5,
              end * (gapLength / 2),
            );
            chunk.rotation.set(Math.random(), Math.random(), Math.random());
            group.add(chunk);
          }
        }

        group.position.set(0, 0, z);
        break;
      }
    }

    return { mesh: group, lanes, z, type, collected: false };
  }

  private buildBarrierGroup(
    group: THREE.Group, biome: string,
    mat: THREE.MeshStandardMaterial, accentMat: THREE.MeshStandardMaterial,
    width?: number,
  ): void {
    switch (biome) {
      case 'Temple': {
        // Stone carved block with top slab
        const baseGeo = width ? new THREE.BoxGeometry(width, 1.7, 0.5) : this.obstBarrierBoxGeo;
        const base = new THREE.Mesh(baseGeo, mat);
        base.position.set(0, 0.85, 0);
        base.castShadow = true;
        group.add(base);
        const slabGeo = width ? new THREE.BoxGeometry(width + 0.2, 0.3, 0.6) : this.obstBarrierSlabGeo;
        const slab = new THREE.Mesh(slabGeo, accentMat);
        slab.position.set(0, 1.85, 0);
        slab.castShadow = true;
        group.add(slab);
        break;
      }
      case 'Jungle': {
        // Thick log with bark texture
        const log = new THREE.Mesh(this.obstLogGeo, mat);
        log.rotation.z = Math.PI / 2;
        log.position.set(0, 0.5, 0);
        if (width) log.scale.y = width / 2;
        log.castShadow = true;
        group.add(log);
        // End caps
        for (let side = -1; side <= 1; side += 2) {
          const cap = new THREE.Mesh(this.obstLogCapGeo, accentMat);
          cap.position.set(side * (width ? width / 2 : 1), 0.5, 0);
          cap.rotation.y = side * Math.PI / 2;
          cap.castShadow = true;
          group.add(cap);
        }
        // Stack a second log on top
        const topLog = new THREE.Mesh(this.obstLogGeo, mat);
        topLog.rotation.z = Math.PI / 2;
        topLog.position.set(0, 1.4, 0);
        if (width) topLog.scale.y = width / 2;
        topLog.castShadow = true;
        group.add(topLog);
        break;
      }
      case 'Cave': {
        // Rough boulder
        const boulder = new THREE.Mesh(this.obstBoulderGeo, mat);
        boulder.position.set(0, 1.0, 0);
        if (width) boulder.scale.x = width / 2;
        boulder.castShadow = true;
        group.add(boulder);
        break;
      }
      case 'Ruins':
      default: {
        // Cracked wall section with top debris
        const wallGeo = width ? new THREE.BoxGeometry(width, 1.6, 0.4) : this.obstRuinWallGeo;
        const wall = new THREE.Mesh(wallGeo, mat);
        wall.position.set(0, 0.8, 0);
        wall.castShadow = true;
        group.add(wall);
        // Debris on top
        for (let i = -1; i <= 1; i++) {
          const debris = new THREE.Mesh(this.obstDebrisGeo, accentMat);
          debris.position.set(i * 0.5, 1.7 + Math.random() * 0.15, (Math.random() - 0.5) * 0.2);
          debris.rotation.set(Math.random() * 0.3, Math.random() * 0.5, Math.random() * 0.2);
          debris.castShadow = true;
          group.add(debris);
        }
        break;
      }
    }
  }

  private buildHurdleGroup(
    group: THREE.Group, biome: string,
    mat: THREE.MeshStandardMaterial, accentMat: THREE.MeshStandardMaterial,
    width?: number,
  ): void {
    const wide = width !== undefined && width > 2.5;
    switch (biome) {
      case 'Temple': {
        // Low stone altar/step
        const stepGeo = wide ? new THREE.BoxGeometry(width, 0.6, 0.6) : this.obstHurdleBoxGeo;
        const step = new THREE.Mesh(stepGeo, mat);
        step.position.set(0, 0.3, 0);
        step.castShadow = true;
        group.add(step);
        const topEdge = new THREE.Mesh(
          new THREE.BoxGeometry((width ?? 2) + 0.1, 0.08, 0.65), accentMat,
        );
        topEdge.position.set(0, 0.64, 0);
        topEdge.castShadow = true;
        group.add(topEdge);
        break;
      }
      case 'Jungle': {
        if (wide) {
          // Wide tree root crossing 2/3 of path — thick trunk root with knobbly detail
          const trunkGeo = new THREE.BoxGeometry(width!, 0.35, 0.5);
          const trunk = new THREE.Mesh(trunkGeo, mat);
          trunk.position.set(0, 0.17, 0);
          trunk.rotation.z = (Math.random() - 0.5) * 0.08; // slight natural angle
          trunk.castShadow = true;
          group.add(trunk);
          // Root knots along the trunk
          const knotCount = 2 + Math.floor(Math.random() * 2);
          for (let i = 0; i < knotCount; i++) {
            const knot = new THREE.Mesh(this.obstRootTorusGeo, accentMat);
            knot.rotation.x = Math.PI / 2;
            knot.position.set(
              (i / (knotCount - 1) - 0.5) * width! * 0.7,
              0.28 + Math.random() * 0.08,
              (Math.random() - 0.5) * 0.2,
            );
            knot.castShadow = true;
            group.add(knot);
          }
          // Thinner branch root trailing off one end
          const branchGeo = new THREE.BoxGeometry(0.8, 0.18, 0.3);
          const branch = new THREE.Mesh(branchGeo, mat);
          const branchSide = Math.random() < 0.5 ? -1 : 1;
          branch.position.set(branchSide * (width! * 0.5 + 0.3), 0.09, 0.3);
          branch.rotation.y = branchSide * 0.4;
          branch.castShadow = true;
          group.add(branch);
        } else {
          // Single-lane tangled root bundle
          const torus = new THREE.Mesh(this.obstRootTorusGeo, mat);
          torus.rotation.x = Math.PI / 2;
          torus.position.set(-0.3, 0.3, 0);
          torus.castShadow = true;
          group.add(torus);
          const rootBox = new THREE.Mesh(this.obstRootBoxGeo, accentMat);
          rootBox.position.set(0.3, 0.15, 0);
          rootBox.castShadow = true;
          group.add(rootBox);
        }
        break;
      }
      case 'Cave': {
        // Stalagmite cluster
        const spread = wide ? width! * 0.3 : 0.35;
        const count = wide ? 5 : 3;
        for (let i = 0; i < count; i++) {
          const cone = new THREE.Mesh(this.obstStalagConeGeo, mat);
          const t = count > 1 ? (i / (count - 1) - 0.5) * 2 : 0;
          cone.position.set(t * spread, 0.25 + Math.abs(t) * 0.03, (Math.random() - 0.5) * 0.15);
          cone.scale.y = 1.0 + (1 - Math.abs(t)) * 0.4;
          cone.castShadow = true;
          group.add(cone);
        }
        break;
      }
      case 'Ruins':
      default: {
        // Rubble pile
        const count = wide ? 5 : 3;
        const spread = wide ? width! * 0.4 : 0.45;
        for (let i = 0; i < count; i++) {
          const rubble = new THREE.Mesh(this.obstRubbleGeo, mat);
          const t = count > 1 ? (i / (count - 1) - 0.5) * 2 : 0;
          rubble.position.set(t * spread, 0.17 + Math.random() * 0.1, (Math.random() - 0.5) * 0.2);
          rubble.rotation.y = Math.random() * 0.8;
          rubble.castShadow = true;
          group.add(rubble);
        }
        break;
      }
    }
  }

  private buildHighBarrierGroup(
    group: THREE.Group, biome: string,
    mat: THREE.MeshStandardMaterial, accentMat: THREE.MeshStandardMaterial,
  ): void {
    // pillarH = height of support columns, centered so bottom touches y=0
    const pillarH = 1.7;
    const pillarY = pillarH / 2; // center of pillar so bottom is at y=0
    const lintelY = pillarH + 0.15; // lintel sits on top of pillars

    switch (biome) {
      case 'Temple': {
        // Stone lintel beam on 2 pillars rooted to the ground
        const lintel = new THREE.Mesh(this.obstLintelGeo, mat);
        lintel.position.set(0, lintelY, 0);
        lintel.castShadow = true;
        group.add(lintel);
        for (let side = -1; side <= 1; side += 2) {
          const pillar = new THREE.Mesh(this.obstPillarGeo, accentMat);
          pillar.position.set(side * 0.8, pillarY, 0);
          pillar.castShadow = true;
          group.add(pillar);
        }
        break;
      }
      case 'Jungle': {
        // Thick horizontal branch on 2 trunk supports from ground
        const branch = new THREE.Mesh(this.obstBranchGeo, mat);
        branch.rotation.z = Math.PI / 2;
        branch.position.set(0, lintelY, 0);
        branch.castShadow = true;
        group.add(branch);
        for (let side = -1; side <= 1; side += 2) {
          const trunk = new THREE.Mesh(this.obstTrunkGeo, accentMat);
          trunk.position.set(side * 0.8, pillarY, 0);
          trunk.castShadow = true;
          group.add(trunk);
        }
        break;
      }
      case 'Cave': {
        // Hanging rock shelf with stalactites underneath, on rock columns from ground
        const shelf = new THREE.Mesh(this.obstShelfGeo, mat);
        shelf.position.set(0, lintelY, 0);
        shelf.castShadow = true;
        group.add(shelf);
        // Stalactites underneath the shelf
        for (let i = -1; i <= 1; i++) {
          const stal = new THREE.Mesh(this.obstStalactiteGeo, accentMat);
          stal.rotation.x = Math.PI; // point downward
          stal.position.set(i * 0.5, lintelY - 0.35, 0);
          stal.castShadow = true;
          group.add(stal);
        }
        break;
      }
      case 'Ruins':
      default: {
        // Leaning broken arch with support column from ground
        const arch = new THREE.Mesh(this.obstArchGeo, mat);
        arch.position.set(0, lintelY, 0);
        arch.rotation.z = 0.1; // slight lean
        arch.castShadow = true;
        group.add(arch);
        const supportH = 1.5;
        const support = new THREE.Mesh(this.obstArchSupportGeo, accentMat);
        support.position.set(-0.7, supportH / 2, 0);
        support.rotation.z = -0.08;
        support.castShadow = true;
        group.add(support);
        break;
      }
    }
  }

  /** Set current distance for coin tier determination */
  setCurrentDistance(distance: number): void {
    this.currentDistance = distance;
  }

  /** Determine coin tier based on current distance */
  private determineCoinTier(): number {
    const d = this.currentDistance;
    if (d < 1000) return 0; // all gold
    if (d < 2000) {
      // 60% red, 40% gold
      return Math.random() < 0.6 ? 1 : 0;
    }
    // >2000m: 50% blue, 30% red, 20% gold
    const roll = Math.random();
    if (roll < 0.5) return 2;
    if (roll < 0.8) return 1;
    return 0;
  }

  // ---- Coins (pattern-based) ----

  private spawnCoins(segZ: number): void {
    const roll = Math.random();
    const tier = this.difficulty.tier;

    if (tier >= 1 && roll < 0.25) {
      this.spawnArcCoins(segZ);
    } else if (tier >= 1 && roll < 0.45) {
      this.spawnZigzagCoins(segZ);
    } else {
      this.spawnLineCoins(segZ);
    }
  }

  private spawnLineCoins(segZ: number): void {
    const lane = Math.floor(Math.random() * 3);
    const startZ = segZ + 2;
    const count = 5 + Math.floor(Math.random() * 4);
    const tier = this.determineCoinTier();

    for (let i = 0; i < count; i++) {
      if (this.coinCount >= this.maxCoins) break;
      const cz = startZ + i * COIN_SPACING;
      this.coins.push({
        z: cz, lane, y: COIN_HEIGHT,
        collected: false, instanceId: this.coinCount, tier,
      });
      this.coinCount++;
    }
  }

  private spawnArcCoins(segZ: number): void {
    const lane = Math.floor(Math.random() * 3);
    const startZ = segZ + 2;
    const count = 7;
    const peakHeight = 2.5;
    const tier = this.determineCoinTier();

    for (let i = 0; i < count; i++) {
      if (this.coinCount >= this.maxCoins) break;
      const cz = startZ + i * COIN_SPACING;
      const t = i / (count - 1);
      const arcY = COIN_HEIGHT + peakHeight * 4 * t * (1 - t);
      this.coins.push({
        z: cz, lane, y: arcY,
        collected: false, instanceId: this.coinCount, tier,
      });
      this.coinCount++;
    }
  }

  private spawnZigzagCoins(segZ: number): void {
    const baseLane = Math.floor(Math.random() * 2);
    const startZ = segZ + 2;
    const count = 6;
    const tier = this.determineCoinTier();

    for (let i = 0; i < count; i++) {
      if (this.coinCount >= this.maxCoins) break;
      const cz = startZ + i * COIN_SPACING;
      const lane = baseLane + (i % 2);
      this.coins.push({
        z: cz, lane, y: COIN_HEIGHT,
        collected: false, instanceId: this.coinCount, tier,
      });
      this.coinCount++;
    }
  }

  private spawnGuideCoins(obstacleZ: number, blockedLanes: number[]): void {
    const safeLanes = [0, 1, 2].filter(l => !blockedLanes.includes(l));
    if (safeLanes.length === 0) return;
    const lane = safeLanes[Math.floor(Math.random() * safeLanes.length)];
    const tier = this.determineCoinTier();

    for (let i = 1; i <= 3; i++) {
      if (this.coinCount >= this.maxCoins) break;
      const cz = obstacleZ - i * COIN_SPACING * 1.5;
      if (cz <= this.lastObstacleZ - 2) continue;
      this.coins.push({
        z: cz, lane, y: COIN_HEIGHT,
        collected: false, instanceId: this.coinCount, tier,
      });
      this.coinCount++;
    }
  }

  updateCoins(playerZ: number, dt: number): void {
    this.coinRotation += dt * 3;

    // Remove coins far behind and sync coinCount so new coins can spawn
    this.coins = this.coins.filter(c => c.z > playerZ - SEGMENT_LENGTH);
    this.coinCount = this.coins.length;

    // Rebuild instance matrices per tier
    const tierCounts = new Array(COIN_TIERS.length).fill(0);
    for (const coin of this.coins) {
      if (coin.collected) continue;
      this.coinDummy.position.set(
        LANE_POSITIONS[coin.lane],
        coin.y + Math.sin(this.coinRotation + coin.z * 0.5) * 0.15,
        coin.z,
      );
      this.coinDummy.rotation.set(Math.PI / 2, this.coinRotation, 0);
      this.coinDummy.updateMatrix();
      const tier = coin.tier;
      const idx = tierCounts[tier];
      this.coinInstances[tier].setMatrixAt(idx, this.coinDummy.matrix);
      coin.instanceId = idx;
      tierCounts[tier]++;
    }
    for (let t = 0; t < COIN_TIERS.length; t++) {
      this.coinInstances[t].count = tierCounts[t];
      this.coinInstances[t].instanceMatrix.needsUpdate = true;
    }
  }

  spawnFrenzyCoins(playerZ: number): void {
    const targetZ = playerZ + 15;
    if (targetZ - this.lastFrenzyZ < 2) return;
    this.lastFrenzyZ = targetZ;
    const tier = this.determineCoinTier();

    for (let lane = 0; lane < 3; lane++) {
      if (this.coinCount >= this.maxCoins) break;
      this.coins.push({
        z: targetZ, lane, y: COIN_HEIGHT,
        collected: false, instanceId: this.coinCount, tier,
      });
      this.coinCount++;
    }
  }

  /** Check if the segment at the given Z position has open edges (no walls) */
  isOpenEdgeAt(z: number): boolean {
    for (const seg of this.segments) {
      if (z >= seg.z && z < seg.z + SEGMENT_LENGTH) {
        return !seg.hasWalls;
      }
    }
    return false;
  }

  getActiveObstacles(): Obstacle[] {
    return this.obstacles;
  }

  getActiveCoins(): Coin[] {
    return this.coins;
  }

  reset(): void {
    // Release all pool entries
    for (const seg of this.segments) {
      const poolEntry = this.segmentToPool.get(seg.group);
      if (poolEntry) {
        this.releasePoolEntry(poolEntry);
      } else {
        this.scene.remove(seg.group);
      }
    }
    this.segments = [];
    this.segmentToPool.clear();

    // Clear obstacles
    for (const obs of this.obstacles) {
      this.scene.remove(obs.mesh);
    }
    this.obstacles = [];

    // Clear coins
    this.coins = [];
    this.coinCount = 0;
    for (const mesh of this.coinInstances) {
      mesh.count = 0;
      mesh.instanceMatrix.needsUpdate = true;
    }

    this.generationCursor = 0;
    this.lastObstacleZ = -Infinity;
    this.lastFrenzyZ = -Infinity;
    this.coinRotation = 0;
    this.segmentIndex = 0;
  }
}
