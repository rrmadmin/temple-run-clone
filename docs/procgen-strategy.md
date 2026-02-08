# Procedural Generation Strategy

> Design document for the endless runner path generation, obstacle placement,
> coin patterns, difficulty progression, and memory management systems.

---

## Table of Contents

1. [Segment Data Structures](#1-segment-data-structures)
2. [Generation Algorithm](#2-generation-algorithm)
3. [Obstacle Placement Rules](#3-obstacle-placement-rules)
4. [Coin Pattern System](#4-coin-pattern-system)
5. [Difficulty Progression](#5-difficulty-progression)
6. [Object Pooling Strategy](#6-object-pooling-strategy)
7. [Memory Budget Estimates](#7-memory-budget-estimates)
8. [Diagrams](#8-diagrams)

---

## 1. Segment Data Structures

### Core Types

```typescript
/** Direction the player is heading after traversing a segment. */
type TurnDirection = 'straight' | 'left' | 'right';

/** Lane index: 0 = left, 1 = center, 2 = right */
type Lane = 0 | 1 | 2;

/** Obstacle varieties the player must react to differently. */
type ObstacleKind =
  | 'lane_barrier'   // blocks 1-2 lanes, player must switch lanes
  | 'low_hurdle'     // must jump over
  | 'high_barrier'   // must slide under
  | 'gap';           // gap in the path, must jump over

/** Coin layout shapes. */
type CoinPattern = 'line' | 'arc' | 'zigzag' | 'ring';

/** Power-up varieties. */
type PowerUpKind = 'magnet' | 'score_multiplier' | 'shield' | 'speed_boost';

// ─── Obstacle Slot ──────────────────────────────────────────────

interface ObstacleSlot {
  /** Normalized position along the segment length [0..1]. */
  t: number;
  /** Which lanes this obstacle occupies. */
  lanes: Lane[];
  /** The obstacle type. */
  kind: ObstacleKind;
}

// ─── Coin Slot ──────────────────────────────────────────────────

interface CoinSlot {
  /** Normalized start position along the segment [0..1]. */
  tStart: number;
  /** Normalized end position along the segment [0..1]. */
  tEnd: number;
  /** Which lane the coin trail occupies. */
  lane: Lane;
  /** The visual pattern. */
  pattern: CoinPattern;
  /** Number of coins in this cluster. */
  count: number;
}

// ─── Power-Up Slot ──────────────────────────────────────────────

interface PowerUpSlot {
  /** Normalized position along the segment [0..1]. */
  t: number;
  /** Lane. */
  lane: Lane;
  /** Kind of power-up. */
  kind: PowerUpKind;
}

// ─── Segment Template ──────────────────────────────────────────

interface SegmentTemplate {
  /** Unique id for the template (e.g. "straight_v1", "turn_left_v2"). */
  id: string;
  /** Direction change at the END of this segment. */
  exit: TurnDirection;
  /** World-unit length of the segment along its forward axis. */
  length: number;
  /** Width of the segment (constant across all segments). */
  width: number;
  /** Geometry asset key or mesh reference. */
  meshKey: string;
  /** Visual theme variant (swapped based on distance/biome). */
  themeVariant: number;
  /** Available obstacle slots (authored per template). */
  obstacleSlots: ObstacleSlot[];
  /** Available coin slots (authored per template). */
  coinSlots: CoinSlot[];
  /** Available power-up slots (authored per template). */
  powerUpSlots: PowerUpSlot[];
}

// ─── Live Segment (runtime instance) ───────────────────────────

interface LiveSegment {
  /** Reference to the template this was instantiated from. */
  templateId: string;
  /** World position of the segment origin (start center). */
  position: { x: number; y: number; z: number };
  /** Y-axis rotation in radians (0 = -Z forward, PI/2 = -X, etc.) */
  rotation: number;
  /** The 3D object / mesh group in the scene. */
  sceneObject: THREE.Group;
  /** Active obstacle instances in this segment. */
  obstacles: PooledObject[];
  /** Active coin instances in this segment. */
  coins: PooledObject[];
  /** Active power-up instances. */
  powerUps: PooledObject[];
  /** Distance from world origin along the path (cumulative). */
  cumulativeDistance: number;
}
```

### Segment Variants

Each segment type has multiple visual variants to prevent repetition:

| Type          | Variants | Description                                      |
|---------------|----------|--------------------------------------------------|
| `straight`    | 4-6      | Temple corridor, bridge, jungle path, ruins       |
| `turn_left`   | 3-4      | 90-degree left with varying wall/scenery          |
| `turn_right`  | 3-4      | 90-degree right with varying wall/scenery         |

Turns are always exact 90-degree rotations to keep the grid-aligned path
simple and predictable for players. Each variant shares the same collision
geometry but differs in decorative meshes.

---

## 2. Generation Algorithm

### Overview

The world is stationary; the player runs forward. Segments are spawned
ahead of the player and despawned behind. A generation cursor tracks the
furthest generated point, and new segments are appended when the player
approaches within a threshold distance.

### Constants

```typescript
const GENERATION_CONFIG = {
  /** Number of segments to keep ahead of the player. */
  LOOK_AHEAD: 8,
  /** Number of segments to keep behind the player before despawning. */
  TRAIL_BEHIND: 3,
  /** Distance (world units) at which the player triggers new generation. */
  SPAWN_TRIGGER_DISTANCE: 60, // ~2 segments ahead
  /** Segment standard length. */
  SEGMENT_LENGTH: 30,
  /** Path width (3 lanes). */
  PATH_WIDTH: 4.5, // 1.5 units per lane
  /** Lane width. */
  LANE_WIDTH: 1.5,
  /** Maximum consecutive straight segments before forcing a turn. */
  MAX_CONSECUTIVE_STRAIGHTS: 5,
  /** Minimum straight segments between turns. */
  MIN_STRAIGHTS_BETWEEN_TURNS: 2,
  /** Maximum consecutive same-direction turns. */
  MAX_SAME_DIRECTION_TURNS: 2,
};
```

### Pseudocode: Main Generation Loop

```
function updateGeneration(playerDistance):
    // 1. Despawn segments far behind player
    while activeSegments.length > 0:
        oldest = activeSegments[0]
        if playerDistance - oldest.cumulativeDistance > TRAIL_BEHIND * SEGMENT_LENGTH:
            despawnSegment(oldest)
            activeSegments.shift()
        else:
            break

    // 2. Spawn segments ahead if needed
    while generationCursor - playerDistance < LOOK_AHEAD * SEGMENT_LENGTH:
        template = selectNextTemplate()
        segment = spawnSegment(template, generationCursor, currentHeading)
        populateObstacles(segment, currentDifficulty)
        populateCoins(segment, currentDifficulty)
        maybeSpawnPowerUp(segment, currentDifficulty)
        activeSegments.push(segment)

        // Advance cursor and heading
        generationCursor += template.length
        if template.exit === 'left':
            currentHeading -= PI / 2
        else if template.exit === 'right':
            currentHeading += PI / 2
```

### Template Selection Algorithm

```
function selectNextTemplate():
    // Count recent straights and turns
    recentStraights = countTrailingStraights(activeSegments)
    recentTurns     = getRecentTurns(activeSegments, 3)
    lastTurnDir     = getLastTurnDirection(activeSegments)
    sameDirCount    = countConsecutiveSameDirection(activeSegments)

    // Build candidate list with weights
    candidates = []

    // Always allow straight unless we hit the max
    if recentStraights < MAX_CONSECUTIVE_STRAIGHTS:
        candidates.push({ type: 'straight', weight: 3 })

    // Force a turn if at max straights
    if recentStraights >= MAX_CONSECUTIVE_STRAIGHTS:
        candidates = []  // clear straights

    // Allow turns if enough straights since last turn
    if recentStraights >= MIN_STRAIGHTS_BETWEEN_TURNS:
        leftWeight  = (lastTurnDir === 'left'  && sameDirCount >= MAX_SAME_DIRECTION_TURNS) ? 0 : 2
        rightWeight = (lastTurnDir === 'right' && sameDirCount >= MAX_SAME_DIRECTION_TURNS) ? 0 : 2
        if leftWeight  > 0: candidates.push({ type: 'turn_left',  weight: leftWeight })
        if rightWeight > 0: candidates.push({ type: 'turn_right', weight: rightWeight })

    // Weighted random selection
    selected = weightedRandom(candidates)

    // Pick a random visual variant of the selected type
    return randomVariant(selected.type)
```

### Segment Connection / Alignment

When a segment is spawned, its position and rotation are derived from
the previous segment's endpoint:

```
function spawnSegment(template, cursorDistance, heading):
    if activeSegments.length === 0:
        position = { x: 0, y: 0, z: 0 }
    else:
        prev = activeSegments[activeSegments.length - 1]
        // Endpoint = prev.position + forward(prev.rotation) * prev.length
        dx = -sin(prev.rotation) * prev.template.length
        dz = -cos(prev.rotation) * prev.template.length
        position = {
            x: prev.position.x + dx,
            y: prev.position.y,
            z: prev.position.z + dz
        }

    segment = objectPool.segments.acquire()
    segment.init(template, position, heading, cursorDistance)
    scene.add(segment.sceneObject)
    return segment
```

---

## 3. Obstacle Placement Rules

### Obstacle Types and Player Reactions

| Obstacle        | Blocked Lanes | Player Action | Visual Cue        |
|-----------------|---------------|---------------|--------------------|
| `lane_barrier`  | 1-2 lanes     | Swipe L/R     | Wall / fallen tree |
| `low_hurdle`    | current lane  | Swipe Up      | Log / trip wire    |
| `high_barrier`  | current lane  | Swipe Down    | Overhanging branch |
| `gap`           | current lane  | Swipe Up      | Broken bridge      |

### Placement Constraints (Safety Rules)

These rules are **invariant** and never relaxed regardless of difficulty:

1. **At least one safe lane.** For any cross-section of the path at a
   given `t`, at most 2 of 3 lanes may be blocked. There must always be
   a navigable lane.

2. **Minimum spacing.** Consecutive obstacles must be separated by at
   least `MIN_OBSTACLE_GAP` normalized distance (0.15 at base difficulty,
   corresponding to ~4.5 world units at segment length 30).

3. **No impossible combos.** A `low_hurdle` and a `high_barrier` must
   NOT occupy the same lane at the same `t` (player cannot jump and slide
   simultaneously). If they appear at the same `t`, they must be in
   different lanes.

4. **Reaction time.** After a turn segment, the first obstacle in the
   next straight segment must have `t >= 0.25` to give the player time
   to reorient.

5. **Gap limits.** Gaps may span at most 1 lane. Full-width gaps are
   never generated.

### Placement Algorithm

```
function populateObstacles(segment, difficulty):
    // Determine how many obstacles to place
    maxSlots = segment.template.obstacleSlots.length
    fillRatio = clamp(difficulty.obstacleDensity, 0.2, 0.85)
    targetCount = floor(maxSlots * fillRatio)

    // Shuffle available slots and pick targetCount
    slots = shuffle(segment.template.obstacleSlots).slice(0, targetCount)

    // Sort by t so we can enforce spacing
    slots.sort((a, b) => a.t - b.t)

    placed = []
    for slot in slots:
        // Enforce minimum spacing
        if placed.length > 0 and slot.t - placed[last].t < difficulty.minGap:
            continue

        // Select obstacle kind based on difficulty weights
        kind = weightedRandom(difficulty.obstacleWeights)

        // Determine lane coverage
        lanes = selectLanes(kind, difficulty)

        // Safety check: ensure at least 1 lane free at this t
        occupiedAtT = getOccupiedLanes(placed, slot.t)
        allOccupied = union(occupiedAtT, lanes)
        if allOccupied.size >= 3:
            // Reduce lane coverage to keep one free
            lanes = reduceLanes(lanes, occupiedAtT)

        // No impossible combos check
        if hasConflict(placed, slot.t, lanes, kind):
            continue

        obstacle = objectPool.obstacles.acquire(kind)
        obstacle.place(segment, slot.t, lanes)
        placed.push({ t: slot.t, lanes, kind, object: obstacle })

    segment.obstacles = placed.map(p => p.object)
```

### Obstacle Weight Progression

| Difficulty Tier | `lane_barrier` | `low_hurdle` | `high_barrier` | `gap` |
|-----------------|----------------|--------------|----------------|-------|
| 0 (start)       | 60%            | 25%          | 10%            | 5%    |
| 1 (0-500m)      | 50%            | 25%          | 15%            | 10%   |
| 2 (500-1500m)   | 40%            | 25%          | 20%            | 15%   |
| 3 (1500m+)      | 30%            | 25%          | 25%            | 20%   |

At higher tiers, `lane_barrier` obstacles increasingly block 2 lanes
instead of 1 (probability: `0.1 + 0.15 * tier`).

---

## 4. Coin Pattern System

### Pattern Types

```typescript
interface CoinPatternDef {
  type: CoinPattern;
  /** Number of coins in the pattern. */
  count: number;
  /** Normalized length the pattern spans along the segment. */
  span: number;
  /** Function that yields individual coin positions. */
  generate(startT: number, lane: Lane, count: number): CoinPosition[];
}
```

| Pattern  | Count | Span  | Description                                           |
|----------|-------|-------|-------------------------------------------------------|
| `line`   | 5-8   | 0.15  | Straight line along a single lane                     |
| `arc`    | 7-10  | 0.20  | Parabolic arc (coins rise then fall, visual jump cue) |
| `zigzag` | 6-9   | 0.20  | Alternates between 2 adjacent lanes                   |
| `ring`   | 8-12  | 0.05  | Circle/cluster across all 3 lanes at one t            |

### Placement Relative to Obstacles

Coins serve two purposes:
1. **Guide the safe path:** Place coin lines in the lane(s) that are NOT
   blocked by the next obstacle, teaching the player where to go.
2. **Reward the risky path:** Occasionally place bonus coin clusters in
   positions that require last-second lane switches or well-timed jumps.

```
function populateCoins(segment, difficulty):
    // 1. Guide coins: for each obstacle, place a line in the safe lane
    for obstacle in segment.obstacles:
        safeLanes = [0, 1, 2].filter(l => !obstacle.lanes.includes(l))
        guideLane = randomChoice(safeLanes)
        guideT = max(0, obstacle.t - 0.15)
        placeCoinPattern('line', guideT, guideLane, 5)

    // 2. Fill remaining empty stretches with random patterns
    emptyRanges = findEmptyRanges(segment, minLength: 0.12)
    for range in emptyRanges:
        if random() < difficulty.coinFillChance:
            pattern = weightedRandom(coinPatternWeights)
            lane = randomChoice([0, 1, 2])
            placeCoinPattern(pattern, range.start, lane, pattern.count)

    // 3. Risky bonus coins (10-20% chance per obstacle)
    for obstacle in segment.obstacles:
        if random() < 0.15:
            // Place an arc in the obstacle's lane (jump over hurdle for coins)
            if obstacle.kind === 'low_hurdle':
                placeCoinPattern('arc', obstacle.t - 0.05, obstacle.lanes[0], 7)
```

### Coin Density by Difficulty

| Difficulty Tier | Coins per Segment | Guide Coin Chance | Bonus Coin Chance |
|-----------------|-------------------|-------------------|-------------------|
| 0 (start)       | 15-25             | 100%              | 20%               |
| 1 (0-500m)      | 12-20             | 80%               | 15%               |
| 2 (500-1500m)   | 10-18             | 60%               | 12%               |
| 3 (1500m+)      | 8-15              | 40%               | 10%               |

Guide coins become less frequent at higher difficulty to increase
challenge, but never drop below 40% to maintain learnability.

---

## 5. Difficulty Progression

### Difficulty Model

Difficulty is a composite value derived from distance traveled. It controls
speed, obstacle density, obstacle complexity, and coin generosity.

```typescript
interface DifficultyState {
  /** Current tier (0-3). */
  tier: number;
  /** Raw difficulty scalar [0..1], asymptotically approaching 1. */
  scalar: number;
  /** Current game speed (world units / second). */
  speed: number;
  /** Fraction of obstacle slots to fill [0.2..0.85]. */
  obstacleDensity: number;
  /** Minimum normalized gap between obstacles [0.08..0.20]. */
  minGap: number;
  /** Weight table for obstacle kinds. */
  obstacleWeights: Record<ObstacleKind, number>;
  /** Chance to fill empty ranges with coins. */
  coinFillChance: number;
  /** Power-up spawn chance per segment. */
  powerUpChance: number;
}
```

### Difficulty Curve Formula

The difficulty scalar uses a **logarithmic curve** that ramps quickly at
the start then flattens, ensuring new players see a manageable ramp while
experienced players still face increasing challenge:

```
scalar(distance) = min(1.0, log2(1 + distance / 200) / 4)
```

Plot (approximate):

```
scalar
1.0 |                                          ___________
    |                                    _____/
    |                              _____/
0.5 |                        ____/
    |                  _____/
    |            _____/
    |      ____/
0.0 |____/
    +--------+--------+--------+--------+--------+------> distance (m)
    0       500      1000     1500     2000     3000
```

### Speed Progression

```
BASE_SPEED     = 12    // world units/sec at start
MAX_SPEED      = 30    // cap
SPEED_RANGE    = MAX_SPEED - BASE_SPEED

speed(distance) = BASE_SPEED + SPEED_RANGE * scalar(distance)
```

| Distance | scalar | Speed (u/s) | Approx. Tier |
|----------|--------|-------------|--------------|
| 0m       | 0.00   | 12.0        | 0            |
| 100m     | 0.16   | 14.9        | 0            |
| 300m     | 0.25   | 16.5        | 1            |
| 500m     | 0.33   | 17.9        | 1            |
| 1000m    | 0.44   | 19.9        | 2            |
| 1500m    | 0.50   | 21.0        | 2            |
| 2000m    | 0.55   | 21.9        | 3            |
| 3000m    | 0.63   | 23.3        | 3            |

### Tier Thresholds

```
tier(distance):
    if distance < 200:  return 0   // Tutorial zone
    if distance < 800:  return 1   // Early game
    if distance < 1800: return 2   // Mid game
    return 3                       // Late game
```

### Per-Parameter Scaling

```
obstacleDensity(scalar) = 0.20 + 0.65 * scalar          // 0.20 -> 0.85
minGap(scalar)          = 0.20 - 0.12 * scalar           // 0.20 -> 0.08
coinFillChance(scalar)  = 0.80 - 0.45 * scalar           // 0.80 -> 0.35
powerUpChance(scalar)   = 0.15 + 0.10 * scalar           // 0.15 -> 0.25
twoLaneBarrierProb(scalar) = 0.10 + 0.35 * scalar        // 0.10 -> 0.45
```

Power-ups become slightly more frequent to compensate for higher
difficulty, giving the player more tools to survive.

---

## 6. Object Pooling Strategy

### Pool Architecture

Every recyclable game object is managed through typed pools. Objects
are never created or destroyed at runtime after initialization; they are
acquired from and released back to pools.

```typescript
class ObjectPool<T extends Poolable> {
  private available: T[] = [];
  private active: Set<T> = new Set();

  constructor(
    private factory: () => T,
    initialSize: number
  ) {
    for (let i = 0; i < initialSize; i++) {
      const obj = factory();
      obj.setActive(false);
      this.available.push(obj);
    }
  }

  acquire(): T | null {
    let obj = this.available.pop();
    if (!obj) {
      // Pool exhausted: grow by 25% up to hard cap
      if (this.active.size < this.hardCap) {
        obj = this.factory();
      } else {
        return null; // silently skip (non-critical objects)
      }
    }
    obj.reset();
    obj.setActive(true);
    this.active.add(obj);
    return obj;
  }

  release(obj: T): void {
    obj.setActive(false);
    obj.clearReferences(); // prevent GC leaks
    this.active.delete(obj);
    this.available.push(obj);
  }

  get activeCount(): number { return this.active.size; }
  get availableCount(): number { return this.available.length; }
}

interface Poolable {
  reset(): void;
  setActive(active: boolean): void;
  clearReferences(): void;
}
```

### Pool Sizing

| Object Type        | Initial Pool | Hard Cap | Rationale                                |
|--------------------|-------------|----------|------------------------------------------|
| Segment meshes     | 12          | 16       | LOOK_AHEAD(8) + TRAIL_BEHIND(3) + buffer |
| Lane barriers      | 20          | 30       | ~2-3 per segment, 8 active segments       |
| Low hurdles        | 15          | 24       | Less frequent than barriers               |
| High barriers      | 12          | 20       | Least common obstacle                     |
| Gaps               | 8           | 12       | Rare, especially early                    |
| Coins              | 200         | 300      | ~20 per segment, 8 active segments        |
| Power-ups          | 6           | 10       | ~0.5 per segment                          |

### Lifecycle

```
Segment spawned:
  1. Pool.acquire(segmentMesh) -> assign template, position, rotation
  2. Pool.acquire(obstacle) x N -> place in segment
  3. Pool.acquire(coin) x N -> place in segment
  4. Pool.acquire(powerUp) x 0-1 -> place in segment
  5. Add to scene

Segment despawned:
  1. For each coin in segment:     Pool.release(coin)
  2. For each obstacle in segment: Pool.release(obstacle)
  3. For each powerUp in segment:  Pool.release(powerUp)
  4. Pool.release(segmentMesh)
  5. Remove from scene
```

### Instanced Rendering for Coins

Since coins are numerous and identical, use `THREE.InstancedMesh`:

```typescript
const coinGeometry = new THREE.CylinderGeometry(0.3, 0.3, 0.05, 16);
const coinMaterial = new THREE.MeshStandardMaterial({ color: 0xffd700 });
const coinInstances = new THREE.InstancedMesh(coinGeometry, coinMaterial, 300);
```

Instead of pooling individual coin meshes, maintain a single
`InstancedMesh` and update per-instance matrices. This reduces draw
calls from ~200 to 1 for all active coins.

---

## 7. Memory Budget Estimates

### Per-Object Memory (Approximate)

| Object             | Geometry (KB) | Material (KB) | JS Overhead (KB) | Total (KB) |
|--------------------|---------------|---------------|-------------------|------------|
| Segment mesh       | 50-150        | 5-10          | 2                 | 57-162     |
| Obstacle (barrier) | 5-20          | 5             | 1                 | 11-26      |
| Obstacle (hurdle)  | 3-10          | 5             | 1                 | 9-16       |
| Coin (instanced)   | 0.5 (shared)  | 0.5 (shared)  | 0.1               | ~0.1 each  |
| Power-up           | 5-15          | 5             | 1                 | 11-21      |

### Total Budget (Worst Case)

| Category                    | Count | Per-Unit (KB) | Total (KB) | Total (MB) |
|-----------------------------|-------|---------------|------------|------------|
| Segment meshes (pooled)     | 16    | 162           | 2,592      | 2.5        |
| Obstacles (all types)       | 86    | 26            | 2,236      | 2.2        |
| Coins (instanced)           | 300   | 0.1           | 30         | 0.03       |
| Power-ups (pooled)          | 10    | 21            | 210        | 0.2        |
| Coin InstancedMesh (shared) | 1     | 200           | 200        | 0.2        |
| **Subtotal: Game Objects**  |       |               |            | **~5.1**   |
| Textures (estimated)        |       |               |            | ~10-20     |
| Audio buffers               |       |               |            | ~3-5       |
| Scene graph overhead        |       |               |            | ~2-3       |
| **Total Estimated**         |       |               |            | **~20-33** |

### Performance Targets

| Metric                    | Target       | Notes                        |
|---------------------------|-------------|------------------------------|
| Frame rate                | 60 FPS      | Drop to 30 FPS acceptable on low-end mobile |
| Draw calls per frame      | < 50        | Instancing keeps this low    |
| Active scene objects      | < 150       | Segments + obstacles + coins |
| GC pauses                 | < 2ms       | Object pooling prevents major GC |
| Memory ceiling            | < 50 MB     | Total JS heap                |
| Generation time per segment | < 2ms     | Must not cause frame drops   |

---

## 8. Diagrams

### Segment Connection Model

Segments connect end-to-end. Turns rotate the path 90 degrees.
The player always runs "forward" relative to the current heading.

```
 Top-down view of a generated path:

                    +=========+
                    |         |
                    | STRAIGHT|
                    |  seg 5  |
                    |         |
                    +====+====+
                         |
          +---------+====+
          |              |
          |  LEFT TURN   |
          |    seg 4     |
          |              |
          +====+---------+
               |
          +====+====+
          |         |
          | STRAIGHT|
          |  seg 3  |
          |         |
          +====+====+
               |
          +====+====+
          |         |
          | STRAIGHT|
          |  seg 2  |
          |         |
          +====+====+
               |
          +====+====+
          |         |
          | STRAIGHT|
          |  seg 1  |
          |         |
          +====+====+
               |
             START

  Player runs upward (seg 1 -> 2 -> 3), then left (seg 4),
  then upward again (seg 5) in the new heading direction.
```

### Turn Connection Detail

```
  BEFORE TURN (heading = -Z):

       -Z (forward)
        ^
        |
  +-----+-----+
  | L   | C   | R     <- lanes
  |     |     |
  |  STRAIGHT  |
  |  segment   |
  +-----+-----+
        |
        v
       +Z

  LEFT TURN SEGMENT:

        +-----+-----+
        |           /
        |  path    /   <- 90-degree curve
        |  curves /
        | left  /
  <-----+------+
   -X (new forward)

  AFTER TURN (heading = -X):

  -X (forward) <------+-----+-----+
                       | L   | C   | R
                       |     |     |
                       |  STRAIGHT  |
                       |  (next)    |
                       +-----+-----+
```

### Obstacle Layout: Cross-Section View

```
  SIDE VIEW (player approaches from left):

  Player ->  ___                     ___
            |   |   ___             |   |
            | P |  | H |   [gap]   | B |
            |___|  |___|           |___|
  ─────────────────────────────────────────── ground
                         \___/
                          gap

  P = Player
  H = Low Hurdle (jump over)
  B = Lane Barrier (switch lanes)

  TOP VIEW (3 lanes, obstacles at various t positions):

  Lane 0 (Left)  : .... [BARRIER] ............... [HURDLE] ....
  Lane 1 (Center): ............... [GAP] ...................[HIGH] ....
  Lane 2 (Right) : ..... coins ... coins .... [BARRIER] .... coins ....
                   t=0.0          t=0.3        t=0.5        t=0.8     t=1.0

  Safety check at t=0.3: Lane 0 blocked, Lane 1 has gap -> Lane 2 is free. OK.
  Safety check at t=0.5: Lane 2 blocked -> Lanes 0 and 1 free. OK.
  Safety check at t=0.8: Lane 1 blocked -> Lanes 0 and 2 free. OK.
```

### Multi-Lane Barrier Examples

```
  EASY (Tier 0): Single lane blocked

  Lane 0: ............
  Lane 1: [BARRIER]...
  Lane 2: ............

  Player can go left or right.

  MEDIUM (Tier 2): Two lanes blocked

  Lane 0: [BARRIER]...
  Lane 1: [BARRIER]...
  Lane 2: ............    <- only escape

  Player MUST be in lane 2.

  HARD (Tier 3): Staggered multi-obstacle

  Lane 0: ..[BARRIER].........[HIGH]....
  Lane 1: .........[HURDLE].............
  Lane 2: [BARRIER]...........[BARRIER].

  t=0.0: Lanes 0,2 blocked -> must be in lane 1
  t=0.3: Lane 1 has hurdle -> must jump (or switch to 0)
  t=0.7: Lane 0 has high -> must slide; Lane 2 blocked -> stay in 0 and slide
```

### Coin Pattern Visualizations

```
  LINE (5 coins, single lane):

  Lane 1: . o . o . o . o . o .

  ARC (7 coins, single lane, varying Y height):

  Lane 1: .  o     o           Y
              o   o            ^  o   o
           o         o         | o       o
          .           .        +-----------> t

  ZIGZAG (6 coins, two lanes):

  Lane 0: . o . . . o . . . o .
  Lane 1: . . . o . . . o . . .

  RING (8 coins, all lanes at one t):

  Lane 0: . . . o o . . .
  Lane 1: . . . o o . . .
  Lane 2: . . . o o . . .
           (clustered at one t value)
```

### Full Segment Example

```
  Complete segment with obstacles, coins, and power-up:

  Segment Length: 30 units
  Template: straight_v2
  Difficulty: Tier 1

  Lane 0: cccc.....[BARRIER]..........cccc.........
  Lane 1: .........[BARRIER]...cccc...........[MAG]
  Lane 2: ..cccc.................cccc.[HURDLE].cccc.
          t=0.0    t=0.25       t=0.5  t=0.65  t=0.9

  c = coin
  [MAG] = magnet power-up

  Analysis:
  - t=0.25: Lanes 0,1 blocked -> guide coins in Lane 2 before (t=0.1)
  - t=0.65: Lane 2 hurdle -> player can jump or switch
  - Coins after hurdle in Lane 2 reward jumping over
  - Power-up in Lane 1 at t=0.9 (safe, no obstacles nearby)
```

---

## Design Decisions Summary

1. **Grid-aligned 90-degree turns** keep path math simple and predictable
   for both the generator and the player. No arbitrary angles.

2. **Template-based segments with authored slots** give designers control
   over obstacle positions while the generator selects which slots to
   fill. This avoids fully random placement that can create unfair
   situations.

3. **Logarithmic difficulty curve** provides a steep early ramp (exciting
   for new players) that flattens at high distances (prevents impossibility).

4. **Safety-first obstacle placement** with invariant rules ensures the
   game is always fair. Difficulty increases density and complexity, never
   removes the escape path.

5. **Instanced rendering for coins** is the single biggest performance
   win, reducing draw calls from hundreds to one.

6. **Object pooling with dynamic growth** avoids both memory waste (too
   large initial pools) and runtime allocation (pool exhaustion). The hard
   cap prevents runaway memory use.

7. **Guide coins as implicit tutorials** teach players the safe path
   without explicit UI instructions, matching Temple Run and Subway
   Surfers' design philosophy.
