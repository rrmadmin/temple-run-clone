# Temple Run Clone - Game Architecture

## 1. Recommended Architecture Pattern

### Decision: Lightweight OOP with Event-Driven Communication

**Pattern:** Class-based OOP with a central event bus for decoupled communication between systems.

**Rationale:**

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| Pure ECS | Maximum flexibility, cache-friendly data layout, great for thousands of entities | Steep learning curve, over-engineered for <100 entities, requires ECS framework | Overkill |
| Deep OOP Inheritance | Familiar to most devs, maps naturally to game objects | Fragile base class problem, rigid hierarchies, hard to compose behaviors | Too rigid |
| **Lightweight OOP + Events** | Simple mental model, easy to debug, good encapsulation per system, loose coupling via events | Slightly less flexible than ECS for very dynamic entity composition | Best fit |

**Why not ECS?** An endless runner has a small, fixed set of entity types (player, obstacles, collectibles, path segments, particles). We never need to dynamically compose behaviors at runtime. ECS shines when you have hundreds of entity types with mix-and-match components -- that is not our case. The overhead of setting up an ECS framework would add complexity without proportional benefit.

**Why events?** Systems like scoring, audio, UI, and effects need to react to game events (collision, coin pickup, speed change) without tight coupling. A simple pub/sub event bus gives us this cleanly.

---

## 2. File/Folder Structure

```
temple-run-clone/
├── docs/
│   ├── game-architecture.md        # This file
│   └── procedural-generation.md    # Path generation strategy
├── public/
│   ├── index.html                  # Entry HTML
│   ├── assets/
│   │   ├── models/                 # GLB/GLTF 3D models
│   │   ├── textures/               # Image textures
│   │   ├── audio/                  # Sound effects and music
│   │   └── fonts/                  # Web fonts for UI
│   └── favicon.ico
├── src/
│   ├── main.ts                     # Entry point: bootstrap game
│   ├── Game.ts                     # Top-level Game class (owns loop, state machine)
│   │
│   ├── core/
│   │   ├── EventBus.ts             # Pub/sub event system
│   │   ├── GameLoop.ts             # Fixed-timestep game loop
│   │   ├── StateMachine.ts         # Generic finite state machine
│   │   ├── InputManager.ts         # Keyboard/touch/swipe input
│   │   ├── AssetLoader.ts          # Centralized asset loading with progress
│   │   └── AudioManager.ts         # Sound effects and music playback
│   │
│   ├── scene/
│   │   ├── SceneManager.ts         # Three.js scene, camera, renderer setup
│   │   ├── CameraController.ts     # Third-person chase camera
│   │   └── LightingSetup.ts        # Scene lighting configuration
│   │
│   ├── entities/
│   │   ├── Player.ts               # Player character (movement, animation)
│   │   ├── Obstacle.ts             # Obstacle base class
│   │   ├── Collectible.ts          # Coins, powerups
│   │   └── PathSegment.ts          # Single segment of the running path
│   │
│   ├── systems/
│   │   ├── PlayerController.ts     # Translates input to player actions
│   │   ├── WorldGenerator.ts       # Procedural path/obstacle generation
│   │   ├── CollisionSystem.ts      # AABB collision detection
│   │   ├── ScoreManager.ts         # Score tracking, multipliers, high score
│   │   ├── DifficultyManager.ts    # Progressive difficulty scaling
│   │   └── ObjectPool.ts           # Generic object pool for recycling
│   │
│   ├── ui/
│   │   ├── UIManager.ts            # Top-level UI controller
│   │   ├── HUD.ts                  # In-game HUD (score, distance, coins)
│   │   ├── MenuScreen.ts           # Main menu
│   │   ├── PauseScreen.ts          # Pause overlay
│   │   └── GameOverScreen.ts       # Game over with score display
│   │
│   ├── config/
│   │   ├── constants.ts            # Game-wide constants
│   │   ├── difficulty.ts           # Difficulty curve parameters
│   │   └── lanes.ts                # Lane positions, widths, mapping
│   │
│   └── utils/
│       ├── math.ts                 # Lerp, clamp, random range helpers
│       └── debug.ts                # Debug overlays, FPS counter
│
├── package.json
├── tsconfig.json
├── vite.config.ts                  # Vite build configuration
└── README.md
```

---

## 3. Module Responsibility Matrix

| Module | Responsibility | Depends On | Communicates Via |
|--------|---------------|------------|------------------|
| **Game** | Owns game loop, state machine, bootstraps all systems | All systems | Direct calls to init/update/destroy |
| **GameLoop** | Fixed-timestep update loop, calls update/render | requestAnimationFrame | Callbacks |
| **EventBus** | Pub/sub message passing between systems | None (standalone) | subscribe/emit API |
| **StateMachine** | Manages game state transitions | EventBus | State change events |
| **InputManager** | Captures keyboard, touch, swipe; normalizes to actions | EventBus | Emits input events |
| **AssetLoader** | Loads models, textures, audio; tracks progress | Three.js loaders | Promises, progress events |
| **AudioManager** | Plays SFX and background music | EventBus, AssetLoader | Listens to game events |
| **SceneManager** | Creates/manages Three.js scene, renderer, resize handling | Three.js | Direct API |
| **CameraController** | Follows player with smooth interpolation | SceneManager, Player | Reads player position |
| **Player** | Player mesh, position, lane, animation state | Three.js, config | Exposes state, emits events |
| **PlayerController** | Translates input events into player movement | InputManager, Player, EventBus | Listens to input events |
| **WorldGenerator** | Spawns/recycles path segments, obstacles, collectibles | ObjectPool, PathSegment, EventBus | Direct spawning |
| **CollisionSystem** | Tests player AABB against obstacles/collectibles | Player, WorldGenerator | Emits collision events |
| **ScoreManager** | Tracks score, distance, coins, multiplier | EventBus | Listens to events, emits score updates |
| **DifficultyManager** | Scales speed, obstacle density, gap frequency over time | EventBus, ScoreManager | Emits difficulty change events |
| **ObjectPool** | Recycles Three.js objects to avoid GC | Three.js | Pool get/release API |
| **UIManager** | Switches between UI screens based on game state | EventBus, StateMachine | DOM manipulation |

### Module Dependency Graph

```
                    ┌──────────┐
                    │   Game   │
                    └────┬─────┘
            ┌────────────┼────────────────┐
            v            v                v
     ┌──────────┐  ┌───────────┐   ┌───────────┐
     │ GameLoop │  │StateMachine│   │ UIManager │
     └──────────┘  └─────┬─────┘   └───────────┘
                         │
         ┌───────────────┼───────────────┐
         v               v               v
  ┌─────────────┐  ┌───────────┐  ┌──────────────┐
  │InputManager │  │ EventBus  │  │SceneManager  │
  └──────┬──────┘  └─────┬─────┘  └──────┬───────┘
         │               │               │
         v               v               v
  ┌──────────────┐ ┌────────────┐ ┌──────────────┐
  │PlayerControl.│ │ScoreManager│ │CameraControl.│
  └──────┬───────┘ └────────────┘ └──────────────┘
         │
         v
  ┌──────────┐    ┌────────────────┐    ┌───────────────┐
  │  Player  │◄───│CollisionSystem │◄───│WorldGenerator  │
  └──────────┘    └────────────────┘    └───────┬───────┘
                                                │
                                         ┌──────┴──────┐
                                         │ ObjectPool  │
                                         └─────────────┘
```

---

## 4. Game Loop Design

### Decision: Semi-Fixed Timestep with Interpolation

We use a **fixed timestep for game logic** (physics, collision, movement) and **variable rendering** tied to `requestAnimationFrame`. This gives us:
- Deterministic, reproducible game logic (same result regardless of frame rate)
- Smooth visual output by interpolating between physics states
- No spiral of death from trying to catch up on slow machines (capped accumulator)

### Game Loop Pseudocode

```typescript
const FIXED_TIMESTEP = 1 / 60;  // 60 Hz game logic
const MAX_FRAME_TIME = 0.25;     // Cap to prevent spiral of death

class GameLoop {
  private accumulator: number = 0;
  private previousTime: number = 0;
  private running: boolean = false;
  private updateFn: (dt: number) => void;
  private renderFn: (alpha: number) => void;

  start(): void {
    this.running = true;
    this.previousTime = performance.now() / 1000;
    requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;
  }

  private tick = (): void => {
    if (!this.running) return;

    const currentTime = performance.now() / 1000;
    let frameTime = currentTime - this.previousTime;
    this.previousTime = currentTime;

    // Clamp to prevent spiral of death on slow machines
    if (frameTime > MAX_FRAME_TIME) {
      frameTime = MAX_FRAME_TIME;
    }

    this.accumulator += frameTime;

    // Fixed-step updates (deterministic)
    while (this.accumulator >= FIXED_TIMESTEP) {
      this.updateFn(FIXED_TIMESTEP);
      this.accumulator -= FIXED_TIMESTEP;
    }

    // Render with interpolation factor
    const alpha = this.accumulator / FIXED_TIMESTEP;
    this.renderFn(alpha);

    requestAnimationFrame(this.tick);
  };
}
```

### Update Order (per fixed step)

```
1. InputManager.update()        // Poll and process input
2. PlayerController.update(dt)  // Apply input to player movement
3. Player.update(dt)            // Update player position, animation
4. WorldGenerator.update(dt)    // Spawn/recycle segments and obstacles
5. CollisionSystem.update()     // Test all collisions, emit events
6. ScoreManager.update(dt)      // Update distance score
7. DifficultyManager.update(dt) // Check for difficulty increases
8. CameraController.update(dt)  // Follow player smoothly
```

### Render Step

```
1. SceneManager.render(alpha)   // Render Three.js scene (interpolated positions)
2. UIManager.render()           // Update HUD elements
```

---

## 5. Game State Machine

### States and Transitions

```
                    ┌─────────────┐
                    │   LOADING   │
                    └──────┬──────┘
                           │ assets loaded
                           v
                    ┌─────────────┐
              ┌────►│    MENU     │◄────────────┐
              │     └──────┬──────┘             │
              │            │ play pressed        │
              │            v                     │
              │     ┌─────────────┐             │
              │     │   PLAYING   │◄──┐         │
              │     └──┬───┬──────┘   │         │
              │        │   │          │         │
              │  pause │   │ resume   │         │
              │        v   │          │         │
              │     ┌──────┴──────┐   │         │
              │     │   PAUSED    │───┘         │
              │     └─────────────┘             │
              │        │                        │
              │  collision detected             │
              │        │                        │
              │        v                        │
              │     ┌─────────────┐             │
              │     │  GAME_OVER  │─────────────┘
              │     └──────┬──────┘  restart
              │            │
              └────────────┘
                  to menu
```

### State Machine Implementation

```typescript
enum GameState {
  LOADING = 'loading',
  MENU = 'menu',
  PLAYING = 'playing',
  PAUSED = 'paused',
  GAME_OVER = 'gameOver',
}

interface StateConfig {
  enter?: () => void;    // Called when entering this state
  exit?: () => void;     // Called when leaving this state
  update?: (dt: number) => void;  // Called each frame in this state
  transitions: Record<string, GameState>;  // event -> target state
}

class StateMachine {
  private currentState: GameState;
  private states: Map<GameState, StateConfig>;

  transition(event: string): void {
    const config = this.states.get(this.currentState);
    const nextState = config?.transitions[event];
    if (nextState) {
      config?.exit?.();
      this.currentState = nextState;
      this.states.get(nextState)?.enter?.();
    }
  }

  update(dt: number): void {
    this.states.get(this.currentState)?.update?.(dt);
  }
}
```

### State Behaviors

| State | Loop Active | Input | World Updates | UI Shown |
|-------|-------------|-------|---------------|----------|
| LOADING | No | Disabled | No | Loading bar |
| MENU | No | Menu navigation | No | Main menu |
| PLAYING | Yes | Game controls | Yes | HUD |
| PAUSED | No | Resume/quit only | No | Pause overlay + dimmed game |
| GAME_OVER | No | Restart/menu | No | Score summary |

---

## 6. Core Class/Interface Definitions

### EventBus

```typescript
type EventCallback = (...args: any[]) => void;

class EventBus {
  private listeners: Map<string, Set<EventCallback>> = new Map();

  on(event: string, callback: EventCallback): void;
  off(event: string, callback: EventCallback): void;
  emit(event: string, ...args: any[]): void;
  once(event: string, callback: EventCallback): void;
}

// Event catalog (strongly typed in full implementation)
// 'input:swipe-left'      -> {}
// 'input:swipe-right'     -> {}
// 'input:swipe-up'        -> {}
// 'input:swipe-down'      -> {}
// 'player:lane-changed'   -> { from: number, to: number }
// 'player:jumped'         -> {}
// 'player:slid'           -> {}
// 'player:died'           -> { cause: string }
// 'collision:obstacle'    -> { obstacle: Obstacle }
// 'collision:collectible' -> { collectible: Collectible, type: string }
// 'score:updated'         -> { score: number, distance: number }
// 'score:coin-collected'  -> { value: number }
// 'difficulty:increased'  -> { level: number, speed: number }
// 'game:state-changed'    -> { from: GameState, to: GameState }
// 'world:segment-spawned' -> { segment: PathSegment }
// 'world:segment-removed' -> { segment: PathSegment }
```

### Player

```typescript
interface PlayerState {
  lane: number;            // -1 (left), 0 (center), 1 (right)
  position: Vector3;       // World position
  velocity: Vector3;       // Current velocity
  isJumping: boolean;
  isSliding: boolean;
  isAlive: boolean;
}

class Player {
  readonly mesh: Group;    // Three.js group containing player model
  state: PlayerState;

  constructor(scene: Scene, eventBus: EventBus);

  // Movement
  moveTo(lane: number): void;      // Animate lane switch
  jump(): void;                     // Trigger jump
  slide(): void;                    // Trigger slide

  // Lifecycle
  update(dt: number): void;         // Update position, animations
  reset(): void;                    // Reset to initial state
  getBoundingBox(): Box3;           // Current AABB for collision

  // Internal
  private animateLaneSwitch(targetX: number): void;
  private applyGravity(dt: number): void;
}
```

### PlayerController

```typescript
class PlayerController {
  constructor(
    private player: Player,
    private eventBus: EventBus
  );

  init(): void {
    // Subscribe to input events
    this.eventBus.on('input:swipe-left', () => this.handleLaneChange(-1));
    this.eventBus.on('input:swipe-right', () => this.handleLaneChange(1));
    this.eventBus.on('input:swipe-up', () => this.player.jump());
    this.eventBus.on('input:swipe-down', () => this.player.slide());
  }

  private handleLaneChange(direction: number): void {
    const newLane = clamp(this.player.state.lane + direction, -1, 1);
    if (newLane !== this.player.state.lane) {
      this.player.moveTo(newLane);
    }
  }
}
```

### InputManager

```typescript
enum InputAction {
  SWIPE_LEFT = 'swipe-left',
  SWIPE_RIGHT = 'swipe-right',
  SWIPE_UP = 'swipe-up',
  SWIPE_DOWN = 'swipe-down',
  PAUSE = 'pause',
}

class InputManager {
  constructor(private eventBus: EventBus);

  init(): void;           // Attach keyboard and touch listeners
  destroy(): void;        // Remove all listeners

  // Keyboard: A/Left=left, D/Right=right, W/Up/Space=jump, S/Down=slide
  // Touch: Swipe detection with minimum distance threshold
  // Emits: 'input:<action>' events via EventBus
}
```

### WorldGenerator

```typescript
interface SegmentConfig {
  length: number;
  obstacles: ObstacleConfig[];
  collectibles: CollectibleConfig[];
}

class WorldGenerator {
  private segments: PathSegment[] = [];
  private segmentPool: ObjectPool<PathSegment>;
  private obstaclePool: ObjectPool<Obstacle>;
  private collectiblePool: ObjectPool<Collectible>;

  constructor(
    private scene: Scene,
    private eventBus: EventBus,
    private difficultyManager: DifficultyManager
  );

  update(dt: number, playerZ: number): void {
    // Remove segments that are behind the player
    this.recyclePassedSegments(playerZ);
    // Ensure enough segments ahead of the player
    this.ensureSegmentsAhead(playerZ);
  }

  private spawnSegment(zPosition: number): PathSegment;
  private recyclePassedSegments(playerZ: number): void;
  private ensureSegmentsAhead(playerZ: number): void;

  // Returns all active obstacles and collectibles for collision testing
  getActiveObstacles(): Obstacle[];
  getActiveCollectibles(): Collectible[];
}
```

### CollisionSystem

```typescript
class CollisionSystem {
  constructor(
    private player: Player,
    private worldGenerator: WorldGenerator,
    private eventBus: EventBus
  );

  update(): void {
    if (!this.player.state.isAlive) return;

    const playerBox = this.player.getBoundingBox();

    // Test against obstacles
    for (const obstacle of this.worldGenerator.getActiveObstacles()) {
      if (playerBox.intersectsBox(obstacle.getBoundingBox())) {
        if (!this.canAvoid(obstacle)) {
          this.eventBus.emit('collision:obstacle', { obstacle });
          return;
        }
      }
    }

    // Test against collectibles
    for (const collectible of this.worldGenerator.getActiveCollectibles()) {
      if (!collectible.collected && playerBox.intersectsBox(collectible.getBoundingBox())) {
        collectible.collect();
        this.eventBus.emit('collision:collectible', {
          collectible,
          type: collectible.type,
        });
      }
    }
  }

  private canAvoid(obstacle: Obstacle): boolean {
    // Check if player is jumping over a low obstacle
    // or sliding under a high obstacle
  }
}
```

### ObjectPool

```typescript
class ObjectPool<T extends { mesh: Object3D }> {
  private available: T[] = [];
  private active: Set<T> = new Set();
  private factory: () => T;

  constructor(factory: () => T, initialSize: number);

  get(): T {
    const obj = this.available.pop() ?? this.factory();
    this.active.add(obj);
    return obj;
  }

  release(obj: T): void {
    this.active.delete(obj);
    obj.mesh.visible = false;
    this.available.push(obj);
  }

  getActive(): T[] {
    return [...this.active];
  }
}
```

### ScoreManager

```typescript
class ScoreManager {
  score: number = 0;
  distance: number = 0;
  coins: number = 0;
  multiplier: number = 1;

  constructor(private eventBus: EventBus);

  init(): void {
    this.eventBus.on('collision:collectible', (e) => this.onCollectible(e));
    this.eventBus.on('difficulty:increased', (e) => this.onDifficultyIncrease(e));
  }

  update(dt: number, speed: number): void {
    this.distance += speed * dt;
    this.score = Math.floor(this.distance * this.multiplier) + (this.coins * 10);
    this.eventBus.emit('score:updated', {
      score: this.score,
      distance: this.distance,
    });
  }

  reset(): void;
}
```

### DifficultyManager

```typescript
interface DifficultyConfig {
  baseSpeed: number;           // Starting run speed
  maxSpeed: number;            // Cap speed
  speedIncreaseRate: number;   // Speed increase per second
  obstacleFrequency: number;   // Base obstacles per segment
  maxObstacleFrequency: number;
}

class DifficultyManager {
  level: number = 1;
  currentSpeed: number;
  obstacleFrequency: number;

  constructor(
    private config: DifficultyConfig,
    private eventBus: EventBus
  );

  update(dt: number): void {
    // Gradually increase speed
    this.currentSpeed = Math.min(
      this.currentSpeed + this.config.speedIncreaseRate * dt,
      this.config.maxSpeed
    );

    // Step up difficulty level at distance thresholds
    const newLevel = this.calculateLevel();
    if (newLevel > this.level) {
      this.level = newLevel;
      this.eventBus.emit('difficulty:increased', {
        level: this.level,
        speed: this.currentSpeed,
      });
    }
  }
}
```

---

## 7. Event System Design

### Architecture

The EventBus is the central nervous system of the game. It follows a synchronous pub/sub pattern (no async -- game events must be immediate within a frame).

### Event Flow Diagram

```
  InputManager                    AudioManager
      │                                ▲
      │ input:swipe-*                  │ collision:*, score:*
      v                                │
  PlayerController ──► Player ────► EventBus ◄──── DifficultyManager
                                       │
                    ┌──────────────┬────┴─────────────┐
                    v              v                   v
              CollisionSystem  ScoreManager       UIManager
                    │              │                   │
                    v              v                   v
              EventBus          EventBus          DOM Updates
          (collision events)  (score events)
```

### Event Catalog

| Event | Payload | Emitted By | Consumed By |
|-------|---------|------------|-------------|
| `input:swipe-left` | `{}` | InputManager | PlayerController |
| `input:swipe-right` | `{}` | InputManager | PlayerController |
| `input:swipe-up` | `{}` | InputManager | PlayerController |
| `input:swipe-down` | `{}` | InputManager | PlayerController |
| `input:pause` | `{}` | InputManager | Game (StateMachine) |
| `player:lane-changed` | `{ from, to }` | Player | AudioManager, CameraController |
| `player:jumped` | `{}` | Player | AudioManager |
| `player:slid` | `{}` | Player | AudioManager |
| `player:died` | `{ cause }` | Game | AudioManager, UIManager |
| `collision:obstacle` | `{ obstacle }` | CollisionSystem | Game, AudioManager |
| `collision:collectible` | `{ collectible, type }` | CollisionSystem | ScoreManager, AudioManager |
| `score:updated` | `{ score, distance }` | ScoreManager | UIManager (HUD) |
| `difficulty:increased` | `{ level, speed }` | DifficultyManager | WorldGenerator, AudioManager |
| `game:state-changed` | `{ from, to }` | StateMachine | UIManager, AudioManager, all systems |

### Typed Event Bus (recommended implementation)

```typescript
// Define event map for type safety
interface GameEvents {
  'input:swipe-left': undefined;
  'input:swipe-right': undefined;
  'input:swipe-up': undefined;
  'input:swipe-down': undefined;
  'input:pause': undefined;
  'player:lane-changed': { from: number; to: number };
  'player:jumped': undefined;
  'player:slid': undefined;
  'player:died': { cause: string };
  'collision:obstacle': { obstacle: Obstacle };
  'collision:collectible': { collectible: Collectible; type: string };
  'score:updated': { score: number; distance: number };
  'difficulty:increased': { level: number; speed: number };
  'game:state-changed': { from: GameState; to: GameState };
}

class TypedEventBus {
  private listeners = new Map<string, Set<Function>>();

  on<K extends keyof GameEvents>(
    event: K,
    callback: (payload: GameEvents[K]) => void
  ): void { /* ... */ }

  emit<K extends keyof GameEvents>(
    event: K,
    ...args: GameEvents[K] extends undefined ? [] : [GameEvents[K]]
  ): void { /* ... */ }

  off<K extends keyof GameEvents>(
    event: K,
    callback: (payload: GameEvents[K]) => void
  ): void { /* ... */ }
}
```

---

## 8. Collision Detection Strategy

### Decision: Simplified AABB with Lane Awareness

For a lane-based endless runner, we do **not** need a full physics engine. The game world is highly constrained: movement is along a single axis (forward), lane switching is lateral, and jumps/slides are vertical. This reduces collision to a simple problem.

### Why AABB?

| Approach | Pros | Cons | Verdict |
|----------|------|------|---------|
| Full physics engine (Cannon.js, Ammo.js) | Realistic physics, handles complex shapes | Massive overkill, large bundle, CPU overhead | No |
| Raycasting | Good for precise hit detection | Requires many rays for broad collision, more complex | Overkill |
| **AABB (Axis-Aligned Bounding Box)** | Simple, fast, perfect for box-like obstacles | Imprecise for curved shapes | Best fit |
| Lane-only check (no AABB) | Simplest possible | Can't distinguish jump/slide avoidance | Too simple |

### Collision Zones

Instead of checking every obstacle against the player, we use lane filtering to minimize checks:

```
Top View of Lanes:

     Lane -1      Lane 0      Lane 1
  ┌──────────┐ ┌──────────┐ ┌──────────┐
  │          │ │          │ │          │
  │  x=-2.5  │ │  x=0     │ │  x=2.5   │
  │          │ │          │ │          │
  └──────────┘ └──────────┘ └──────────┘
       2.5m         2.5m         2.5m

Side View (obstacle types):

  HIGH_BARRIER:     ████████  <- Must slide under
                    ████████     height: 1.0 - 2.0

  LOW_BARRIER:      ████████  <- Must jump over
                               height: 0.0 - 0.6

  FULL_BARRIER:     ████████  <- Must be in different lane
                    ████████     height: 0.0 - 2.0
```

### Collision Algorithm

```typescript
function checkCollision(player: Player, obstacle: Obstacle): boolean {
  // Step 1: Quick lane check (most obstacles are single-lane)
  if (obstacle.lane !== undefined && obstacle.lane !== player.state.lane) {
    return false;  // Different lane, no collision possible
  }

  // Step 2: Z-axis proximity check (is obstacle near player?)
  const distZ = Math.abs(player.state.position.z - obstacle.position.z);
  if (distZ > COLLISION_THRESHOLD_Z) {
    return false;  // Too far away on running axis
  }

  // Step 3: AABB intersection (handles jump/slide avoidance)
  const playerBox = player.getBoundingBox();  // Shrinks when sliding
  const obstacleBox = obstacle.getBoundingBox();
  return playerBox.intersectsBox(obstacleBox);
}
```

### Player Bounding Box States

The player's AABB changes based on action:

```
Standing:        Jumping:         Sliding:
  ┌──┐            ┌──┐
  │  │ h=1.8      │  │ h=1.8       ┌────┐
  │  │            │  │ y+=1.2      │    │ h=0.6
  │  │            │  │             └────┘
  └──┘            └──┘
  y=0             y=1.2            y=0
```

### Optimization: Spatial Partitioning

Since all entities move along the Z axis, we only need to check obstacles within a narrow Z window around the player. The WorldGenerator already tracks segments in order, so we check only the nearest 2-3 segments.

```typescript
// In CollisionSystem.update():
const nearbyObstacles = this.worldGenerator
  .getActiveObstacles()
  .filter(obs => {
    const dz = obs.position.z - this.player.state.position.z;
    return dz > -2 && dz < 5;  // Only check nearby obstacles
  });
```

---

## 9. Coordinate System

### World Space Convention

```
         +Y (up)
          │
          │
          │
          └──────── +X (right)
         /
        /
       +Z (toward camera / behind player)

Player runs in the -Z direction (into the screen).
Camera is positioned at +Z offset from player, looking at player.
```

### Lane Mapping

```typescript
// config/lanes.ts
export const LANE_WIDTH = 2.5;  // meters between lane centers
export const LANE_POSITIONS: Record<number, number> = {
  [-1]: -LANE_WIDTH,  // Left lane:  x = -2.5
  [0]:  0,            // Center lane: x = 0
  [1]:  LANE_WIDTH,   // Right lane:  x = 2.5
};
export const LANE_COUNT = 3;
```

### Camera Setup

```typescript
// Third-person chase camera
class CameraController {
  private offset = new Vector3(0, 5, 10);  // Behind and above player
  private lookAheadDistance = 10;            // Look ahead of player

  update(dt: number): void {
    // Target position: player position + offset
    const targetPos = this.player.state.position.clone().add(this.offset);

    // Smooth follow with lerp
    this.camera.position.lerp(targetPos, 5 * dt);

    // Look ahead of the player
    const lookTarget = this.player.state.position.clone();
    lookTarget.z -= this.lookAheadDistance;
    this.camera.lookAt(lookTarget);
  }
}
```

---

## 10. Top-Level Game Class

```typescript
class Game {
  private loop: GameLoop;
  private stateMachine: StateMachine;
  private eventBus: TypedEventBus;

  // Core systems
  private sceneManager: SceneManager;
  private inputManager: InputManager;
  private assetLoader: AssetLoader;
  private audioManager: AudioManager;

  // Gameplay systems
  private player: Player;
  private playerController: PlayerController;
  private worldGenerator: WorldGenerator;
  private collisionSystem: CollisionSystem;
  private scoreManager: ScoreManager;
  private difficultyManager: DifficultyManager;
  private cameraController: CameraController;

  // UI
  private uiManager: UIManager;

  constructor(container: HTMLElement) {
    this.eventBus = new TypedEventBus();
    this.loop = new GameLoop();
    this.stateMachine = new StateMachine();
    this.sceneManager = new SceneManager(container);

    // Wire up systems (order matters for dependencies)
    this.inputManager = new InputManager(this.eventBus);
    this.assetLoader = new AssetLoader();
    this.audioManager = new AudioManager(this.eventBus);
    this.difficultyManager = new DifficultyManager(DIFFICULTY_CONFIG, this.eventBus);
    this.player = new Player(this.sceneManager.scene, this.eventBus);
    this.playerController = new PlayerController(this.player, this.eventBus);
    this.worldGenerator = new WorldGenerator(this.sceneManager.scene, this.eventBus, this.difficultyManager);
    this.collisionSystem = new CollisionSystem(this.player, this.worldGenerator, this.eventBus);
    this.scoreManager = new ScoreManager(this.eventBus);
    this.cameraController = new CameraController(this.sceneManager.camera, this.player);
    this.uiManager = new UIManager(this.eventBus, this.stateMachine);

    this.setupStateMachine();
    this.setupGameLoop();
    this.setupEventHandlers();
  }

  async start(): Promise<void> {
    this.stateMachine.transition('start');
    await this.assetLoader.loadAll();
    this.stateMachine.transition('loaded');
  }

  private setupGameLoop(): void {
    this.loop.onUpdate = (dt: number) => {
      this.stateMachine.update(dt);
    };
    this.loop.onRender = (alpha: number) => {
      this.sceneManager.render();
      this.uiManager.render();
    };
  }

  private setupStateMachine(): void {
    this.stateMachine.addState(GameState.LOADING, {
      transitions: { loaded: GameState.MENU },
    });

    this.stateMachine.addState(GameState.MENU, {
      enter: () => this.uiManager.showMenu(),
      transitions: { play: GameState.PLAYING },
    });

    this.stateMachine.addState(GameState.PLAYING, {
      enter: () => {
        this.resetGameplay();
        this.loop.start();
      },
      update: (dt) => {
        this.inputManager.update();
        this.playerController.update(dt);
        this.player.update(dt);
        this.worldGenerator.update(dt, this.player.state.position.z);
        this.collisionSystem.update();
        this.scoreManager.update(dt, this.difficultyManager.currentSpeed);
        this.difficultyManager.update(dt);
        this.cameraController.update(dt);
      },
      transitions: { pause: GameState.PAUSED, die: GameState.GAME_OVER },
    });

    this.stateMachine.addState(GameState.PAUSED, {
      enter: () => this.uiManager.showPause(),
      transitions: { resume: GameState.PLAYING, quit: GameState.MENU },
    });

    this.stateMachine.addState(GameState.GAME_OVER, {
      enter: () => {
        this.loop.stop();
        this.uiManager.showGameOver(this.scoreManager.score);
      },
      transitions: { restart: GameState.PLAYING, menu: GameState.MENU },
    });
  }

  private setupEventHandlers(): void {
    this.eventBus.on('collision:obstacle', () => {
      this.player.state.isAlive = false;
      this.eventBus.emit('player:died', { cause: 'obstacle' });
      this.stateMachine.transition('die');
    });

    this.eventBus.on('input:pause', () => {
      if (this.stateMachine.currentState === GameState.PLAYING) {
        this.stateMachine.transition('pause');
      } else if (this.stateMachine.currentState === GameState.PAUSED) {
        this.stateMachine.transition('resume');
      }
    });
  }

  private resetGameplay(): void {
    this.player.reset();
    this.worldGenerator.reset();
    this.scoreManager.reset();
    this.difficultyManager.reset();
  }
}
```

---

## 11. Entry Point

```typescript
// main.ts
import { Game } from './Game';

const container = document.getElementById('game-container')!;
const game = new Game(container);
game.start();
```

```html
<!-- index.html -->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Temple Run Clone</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { overflow: hidden; background: #000; }
    #game-container { width: 100vw; height: 100vh; }
  </style>
</head>
<body>
  <div id="game-container"></div>
  <script type="module" src="/src/main.ts"></script>
</body>
</html>
```

---

## 12. Key Design Decisions Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Architecture | OOP + Event Bus | Simple, debuggable, right-sized for ~10 entity types |
| Game Loop | Fixed timestep (60Hz) + variable render | Deterministic physics, smooth visuals |
| Communication | Typed EventBus | Decoupled systems, type-safe, easy to debug |
| State Management | Finite State Machine | Clear game flow, prevents invalid states |
| Collision | AABB with lane filtering | Fast, simple, perfect for box-like obstacles |
| Object Lifecycle | Object pooling | Avoids GC pauses from constant allocation |
| Forward Axis | -Z (into screen) | Three.js convention, camera at +Z offset |
| Lane System | 3 lanes at x = {-2.5, 0, 2.5} | Standard temple run layout |
| Build Tool | Vite | Fast dev server, HMR, TypeScript support |
| Language | TypeScript | Type safety catches bugs early, better IDE support |
