// Lane configuration
export const LANE_WIDTH = 2.5;
export const LANE_POSITIONS = [-LANE_WIDTH, 0, LANE_WIDTH] as const;
export const LANE_COUNT = 3;

// Path segments
export const SEGMENT_LENGTH = 20;
export const SEGMENT_WIDTH = 8;
export const SEGMENTS_AHEAD = 10;
export const SEGMENTS_BEHIND = 3;

// Player
export const PLAYER_START_Z = 0;
export const PLAYER_Y = 1;
export const JUMP_FORCE = 12;
export const GRAVITY = -30;
export const SLIDE_DURATION = 0.6;
export const LANE_SWITCH_SPEED = 10;

// Difficulty
export const BASE_SPEED = 22;
export const MAX_SPEED = 38;
export const SPEED_INCREASE_RATE = 0.15; // per second (legacy, kept for compat)

// Difficulty tiers: [distance threshold, speed, obstacle density, min gap]
export const DIFFICULTY_TIERS = [
  { distance: 0,    speed: 22, density: 0.2,  minGap: 24 }, // Tier 0: already moving, learn the moves
  { distance: 150,  speed: 26, density: 0.3,  minGap: 20 }, // Tier 1: gaps start testing you
  { distance: 600,  speed: 30, density: 0.4,  minGap: 16 }, // Tier 2: speed is the real threat
  { distance: 1400, speed: 36, density: 0.5,  minGap: 12 }, // Tier 3: fast with tighter spacing
] as const;
export const DIFFICULTY_LOG_DIVISOR = 200; // distance divisor for log curve
export const DIFFICULTY_LOG_CAP = 4;       // log2 denominator cap

// === CENTRALIZED COLOR PALETTE ===
export const PALETTE = {
  // Player (Minecraft Steve)
  player: {
    skin: 0xc89b7b,
    shirt: 0x00aaaa,
    pants: 0x2b2b8f,
    shoes: 0x3a3a3a,
    hair: 0x4a3728,
    eyes: 0x3b2213,
    mouth: 0x694b3a,
    eyeWhite: 0xffffff,
  },

  // Enemies (Enderman)
  enderman: {
    body: 0x0a0a0a,
    bodyEmissive: 0x1a0030,
    eyes: 0xcc55ff,
    particles: 0x6622aa,
    aura: 0x8844cc,
  },

  // Obstacles (by type)
  obstacles: {
    barrier: 0xcc3333,
    lowHurdle: 0xcc8833,
    highBarrier: 0x8833cc,
    twoLane: 0x881111,
    gap: 0x111111,
  },

  // Decorations
  decor: {
    torchStick: 0x4a3520,
    torchFlame: 0xffaa00,
    torchEmissive: 0xff6600,
    torchLight: 0xff8833,
    pillar: 0x7a6a50,
    archway: 0x6a5a40,
    edgeMarker: 0x8b3a3a,
  },

  // Power-ups
  powerups: {
    magnet:     { main: 0x4488ff, emissive: 0x1144aa },
    shield:     { main: 0x44ff66, emissive: 0x11aa33 },
    multiplier: { main: 0xffcc00, emissive: 0xaa8800 },
    speedBoost: { main: 0xff6600, emissive: 0xaa3300 },
    slowMo:     { main: 0x6644ff, emissive: 0x3322aa },
    coinFrenzy: { main: 0xffdd00, emissive: 0xbbaa00 },
  },

  // Particles
  particles: {
    coinBurst: 0xffd700,
    obstacleBurst: 0xff3333,
    trail: 0x886644,
  },

  // Scene lighting
  lighting: {
    ambient: 0xffffff,
    directional: 0xffffff,
  },

  // Biome decorations
  biomeDecor: {
    // Temple
    relief: 0x6a5a40,
    tileLine: 0x5a4a30,
    // Jungle
    vine: 0x2a5a1a,
    moss: 0x3a6a2a,
    mossEmissive: 0x1a3a0a,
    root: 0x3a2a1a,
    // Cave
    stalactite: 0x4a4540,
    crystal: 0x6a6aff,
    crystalEmissive: 0x4444aa,
    caveFloorOverlay: 0x2a2520,
    // Ruins
    crumbled: 0xa08848,
    sandDrift: 0xc4a868,
    crack: 0x3a3020,
  },
} as const;

// Obstacles
export const OBSTACLE_MIN_SPACING = 12; // world units between obstacles (base, overridden by difficulty)
export const OBSTACLE_START_DISTANCE = 40; // no obstacles for first N units

// Obstacle colors per type (derived from PALETTE)
export const OBSTACLE_COLORS = {
  barrier:      PALETTE.obstacles.barrier,
  low_hurdle:   PALETTE.obstacles.lowHurdle,
  high_barrier: PALETTE.obstacles.highBarrier,
  two_lane:     PALETTE.obstacles.twoLane,
  gap:          PALETTE.obstacles.gap,
} as const;

// Coins
export const COIN_RADIUS = 0.3;
export const COIN_SPACING = 2.0;
export const COIN_HEIGHT = 1.2;
export const COIN_VALUE = 10;

// Coin tiers (color, value, min distance to start appearing)
export const COIN_TIERS = [
  { color: 0xffd700, value: 10, minDistance: 0 },    // gold
  { color: 0xff3333, value: 20, minDistance: 1000 },  // red
  { color: 0x3388ff, value: 30, minDistance: 2000 },  // blue
] as const;

// Camera
export const CAMERA_OFFSET_Y = 6;
export const CAMERA_OFFSET_Z = -10;
export const CAMERA_LOOK_AHEAD = 10;
export const CAMERA_LERP_SPEED = 5;

// Colors — Jungle defaults (starting biome)
export const SKY_COLOR = 0x4a8a4a;
export const FOG_NEAR = 25;
export const FOG_FAR = 90;

// Segment themes: jungle trail with mossy earth borders
export const SEGMENT_THEMES = [
  { name: 'mud',     floor: 0x5a4a2a, wall: 0x3a4a20, accent: 0x4a5a28 },
  { name: 'loam',    floor: 0x6a5a38, wall: 0x4a5a2a, accent: 0x3a4a1a },
  { name: 'fern',    floor: 0x4a5a30, wall: 0x3a5a28, accent: 0x2a4a18 },
] as const;

// Biome system
type SegmentTheme = { name: string; floor: number; wall: number; accent: number };

export interface BiomeConfig {
  name: string;
  skyColor: number;
  fogNear: number;
  fogFar: number;
  lightColor: number;
  lightIntensity: number;
  themes: readonly SegmentTheme[];
  obstacleColor: number;
  obstacleAccent: number;
  torchTint: number;
  stripes: number[];
  decorMaterials: {
    primary: number;
    secondary: number;
    emissive?: number;
  };
}

export const BIOME_DISTANCE = 500;

export const BIOMES: BiomeConfig[] = [
  {
    name: 'Jungle',
    skyColor: 0x4a8a4a,
    fogNear: 25,
    fogFar: 90,
    lightColor: 0xbbffbb,
    lightIntensity: 0.65,
    themes: [
      { name: 'mud',     floor: 0x5a4a2a, wall: 0x3a4a20, accent: 0x4a5a28 },
      { name: 'loam',    floor: 0x6a5a38, wall: 0x4a5a2a, accent: 0x3a4a1a },
      { name: 'fern',    floor: 0x4a5a30, wall: 0x3a5a28, accent: 0x2a4a18 },
    ],
    obstacleColor: 0x6a4a2a,
    obstacleAccent: 0x3a6a2a,
    torchTint: 0x66aa44,
    stripes: [0x5a4a2a, 0x6a5a38, 0x4a5a30],
    decorMaterials: { primary: PALETTE.biomeDecor.vine, secondary: PALETTE.biomeDecor.moss, emissive: PALETTE.biomeDecor.mossEmissive },
  },
  {
    name: 'Temple',
    skyColor: 0x87ceeb,
    fogNear: 40,
    fogFar: 140,
    lightColor: 0xfff8e8,
    lightIntensity: 0.85,
    themes: [
      { name: 'dirt',    floor: 0x8b7355, wall: 0x6a5a3a, accent: 0x7a6a4a },
      { name: 'packed',  floor: 0x9a8060, wall: 0x7a6a48, accent: 0x6a5a38 },
      { name: 'clay',    floor: 0x7a6048, wall: 0x5a4a30, accent: 0x6a5a40 },
    ],
    obstacleColor: 0x7a7a6a,
    obstacleAccent: 0x6a6a5a,
    torchTint: PALETTE.decor.torchLight,
    stripes: [0x8b7355, 0x9a8060, 0x7a6048],
    decorMaterials: { primary: PALETTE.biomeDecor.relief, secondary: PALETTE.biomeDecor.tileLine },
  },
  {
    name: 'Cave',
    skyColor: 0x0a0a1a,
    fogNear: 15,
    fogFar: 70,
    lightColor: 0x6688aa,
    lightIntensity: 0.4,
    themes: [
      { name: 'rock',    floor: 0x3a3530, wall: 0x2a2520, accent: 0x1a1510 },
      { name: 'slate',   floor: 0x35302a, wall: 0x252018, accent: 0x2a2520 },
      { name: 'damp',    floor: 0x2a2a25, wall: 0x1a1a18, accent: 0x252520 },
    ],
    obstacleColor: 0x4a4a5a,
    obstacleAccent: 0x3a3a4a,
    torchTint: 0x4466cc,
    stripes: [0x3a3530, 0x35302a, 0x2a2a25],
    decorMaterials: { primary: PALETTE.biomeDecor.stalactite, secondary: PALETTE.biomeDecor.crystal, emissive: PALETTE.biomeDecor.crystalEmissive },
  },
  {
    name: 'Ruins',
    skyColor: 0xd4864e,
    fogNear: 45,
    fogFar: 150,
    lightColor: 0xffcc88,
    lightIntensity: 0.9,
    themes: [
      { name: 'sand',    floor: 0xc4a868, wall: 0xa08848, accent: 0x907838 },
      { name: 'dust',    floor: 0xb09058, wall: 0x907040, accent: 0x806030 },
      { name: 'desert',  floor: 0xbaa060, wall: 0x9a8040, accent: 0x8a7030 },
    ],
    obstacleColor: 0xb49858,
    obstacleAccent: 0x9a8048,
    torchTint: PALETTE.decor.torchLight,
    stripes: [0xc4a868, 0xb09058, 0xbaa060],
    decorMaterials: { primary: PALETTE.biomeDecor.crumbled, secondary: PALETTE.biomeDecor.sandDrift },
  },
];

// Decorative elements (derived from PALETTE)
export const TORCH_LIGHT_COLOR = PALETTE.decor.torchLight;
export const TORCH_LIGHT_INTENSITY = 0.8;
export const TORCH_LIGHT_DISTANCE = 12;
export const PILLAR_COLOR = PALETTE.decor.pillar;
export const ARCHWAY_COLOR = PALETTE.decor.archway;

// Wall dimensions (enhanced)
export const WALL_WIDTH = 0.8;
export const WALL_HEIGHT = 1.5;
export const WALL_INSET_DEPTH = 0.15;

// Segment pool
export const SEGMENT_POOL_SIZE = 20;

// Power-ups
export const POWERUP_SPAWN_CHANCE = 0.15; // chance per segment
export const POWERUP_FLOAT_HEIGHT = 1.5;
export const POWERUP_BOB_AMPLITUDE = 0.2;
export const POWERUP_BOB_SPEED = 3;
export const POWERUP_ROTATE_SPEED = 2;
export const POWERUP_COLLECTION_RADIUS = 1.2;
export const MAGNET_DURATION = 8;
export const MAGNET_COIN_RADIUS = 3.0;
export const SHIELD_HITS = 1;
export const MULTIPLIER_DURATION = 10;
export const MULTIPLIER_VALUE = 2;
export const SPEEDBOOST_DURATION = 5;
export const SLOWMO_DURATION = 4;
export const COINFRENZY_DURATION = 6;
