import * as THREE from 'three';
import { Player } from './Player.ts';
import type { WorldGenerator, Obstacle, Coin } from './WorldGenerator.ts';
import type { PowerUpManager } from './PowerUpManager.ts';
import { EventBus } from './EventBus.ts';
import { LANE_POSITIONS, COIN_RADIUS, MAGNET_COIN_RADIUS, SEGMENT_WIDTH } from './config.ts';

export class CollisionSystem {
  private powerUpManager: PowerUpManager | null = null;
  private passedObstacles = new Set<number>(); // track Z of obstacles already triggered for near-miss

  constructor(
    private player: Player,
    private world: WorldGenerator,
    private bus: EventBus,
  ) {}

  setPowerUpManager(pm: PowerUpManager): void {
    this.powerUpManager = pm;
  }

  update(): void {
    if (!this.player.isAlive) return;

    const playerBox = this.player.getBoundingBox();
    const playerZ = this.player.mesh.position.z;
    const magnetActive = this.powerUpManager?.isActive('magnet') ?? false;

    // Check obstacles
    for (const obs of this.world.getActiveObstacles()) {
      // Quick Z proximity check (wider for gaps since they're longer)
      const zProximity = Math.abs(obs.z - playerZ);
      if (zProximity > (obs.type === 'gap' ? 5 : 2)) continue;

      // Gaps span full path width — no lane check, must jump over
      if (obs.type === 'gap') {
        if (this.player.isJumping && this.player.mesh.position.y > 0.3) {
          continue; // Jumped over the gap
        }
        const dz = Math.abs(obs.z - playerZ);
        if (dz < 3.5) { // matches gap length (8 units, ~half = 4, with margin)
          this.bus.emit('collision:gap', obs);
          return;
        }
        continue;
      }

      // Lane check: obstacle now uses lanes[] array
      if (!obs.lanes.includes(this.player.lane)) continue;

      // Type-specific avoidance
      if (obs.type === 'low_hurdle' && this.player.isJumping && this.player.mesh.position.y > 0.7) {
        continue; // Jumped over it
      }
      if (obs.type === 'high_barrier' && this.player.isSliding) {
        continue; // Slid under it
      }

      // Low hurdle: stumble (slow down) instead of death
      if (obs.type === 'low_hurdle') {
        const obsBox = new THREE.Box3().setFromObject(obs.mesh);
        if (playerBox.intersectsBox(obsBox)) {
          this.bus.emit('collision:stumble', obs);
          return;
        }
        continue;
      }

      // AABB check for non-gap obstacles
      const obsBox = new THREE.Box3().setFromObject(obs.mesh);
      if (playerBox.intersectsBox(obsBox)) {
        this.bus.emit('collision:obstacle', obs);
        return;
      }
    }

    // Edge-fall check: player too close to edge on open segments
    const playerX = this.player.mesh.position.x;
    if (Math.abs(playerX) > SEGMENT_WIDTH / 2 - 0.3 && this.world.isOpenEdgeAt(playerZ)) {
      this.bus.emit('collision:edge', { side: playerX > 0 ? 1 : -1 });
      return;
    }

    // Near-miss detection: obstacles the player just passed within ~1.5 units Z
    for (const obs of this.world.getActiveObstacles()) {
      // Only consider obstacles the player has just passed (obstacle is behind player)
      const zDiff = playerZ - obs.z;
      if (zDiff > 0.5 && zDiff < 1.5 && !this.passedObstacles.has(obs.z)) {
        // Check if the obstacle was in an adjacent lane (close call)
        const playerLane = this.player.lane;
        const wasAdjacent = obs.lanes.some(
          (lane: number) => Math.abs(lane - playerLane) === 1
        ) || (
          // Also count same-lane obstacles the player jumped/slid over
          obs.lanes.includes(playerLane)
        );
        if (wasAdjacent) {
          this.passedObstacles.add(obs.z);
          this.bus.emit('nearmiss', obs);
        }
      }
    }

    // Clean up old entries from passedObstacles set
    for (const z of this.passedObstacles) {
      if (playerZ - z > 10) {
        this.passedObstacles.delete(z);
      }
    }

    // Check coins (magnet expands collection to all lanes)
    for (const coin of this.world.getActiveCoins()) {
      if (coin.collected) continue;
      if (Math.abs(coin.z - playerZ) > (magnetActive ? MAGNET_COIN_RADIUS : 1.5)) continue;
      if (!magnetActive && coin.lane !== this.player.lane) continue;

      // Simple distance check
      const dx = LANE_POSITIONS[coin.lane] - this.player.mesh.position.x;
      const dz = coin.z - playerZ;
      const dist = Math.sqrt(dx * dx + dz * dz);
      const collectRadius = magnetActive ? MAGNET_COIN_RADIUS : (COIN_RADIUS + 0.5);
      if (dist < collectRadius) {
        coin.collected = true;
        this.bus.emit('collision:coin', coin);
      }
    }

    // Check power-up pickups
    if (this.powerUpManager) {
      this.powerUpManager.checkCollisions(playerZ, this.player.lane, magnetActive);
    }
  }
}
