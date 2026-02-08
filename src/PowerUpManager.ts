import * as THREE from 'three';
import { EventBus } from './EventBus.ts';
import {
  LANE_POSITIONS, SEGMENT_LENGTH,
  POWERUP_FLOAT_HEIGHT, POWERUP_BOB_AMPLITUDE, POWERUP_BOB_SPEED, POWERUP_ROTATE_SPEED,
  POWERUP_COLLECTION_RADIUS, POWERUP_SPAWN_CHANCE,
  MAGNET_DURATION, MAGNET_COIN_RADIUS,
  MULTIPLIER_DURATION, MULTIPLIER_VALUE,
  SPEEDBOOST_DURATION, SLOWMO_DURATION, COINFRENZY_DURATION,
} from './config.ts';

export type PowerUpType = 'magnet' | 'shield' | 'multiplier' | 'speedboost' | 'slowmo' | 'coinfrenzy';

export interface PowerUp {
  type: PowerUpType;
  mesh: THREE.Mesh;
  z: number;
  lane: number;
  collected: boolean;
}

interface ActivePowerUp {
  type: PowerUpType;
  remainingTime: number; // -1 for shield (hit-based, not timed)
}

// Shared geometries and materials (created once)
const geometries: Record<PowerUpType, THREE.BufferGeometry> = {
  magnet: new THREE.TorusGeometry(0.4, 0.15, 8, 16),
  shield: new THREE.IcosahedronGeometry(0.45, 0),
  multiplier: new THREE.OctahedronGeometry(0.45, 0),
  speedboost: new THREE.DodecahedronGeometry(0.4),
  slowmo: new THREE.TorusKnotGeometry(0.3, 0.1, 32, 8),
  coinfrenzy: new THREE.OctahedronGeometry(0.4, 1),
};

const materials: Record<PowerUpType, THREE.MeshStandardMaterial> = {
  magnet: new THREE.MeshStandardMaterial({ color: 0x4488ff, emissive: 0x1144aa, emissiveIntensity: 0.4 }),
  shield: new THREE.MeshStandardMaterial({ color: 0x44ff66, emissive: 0x11aa33, emissiveIntensity: 0.4 }),
  multiplier: new THREE.MeshStandardMaterial({ color: 0xffcc00, emissive: 0xaa8800, emissiveIntensity: 0.4 }),
  speedboost: new THREE.MeshStandardMaterial({ color: 0xff6600, emissive: 0xaa3300, emissiveIntensity: 0.4 }),
  slowmo: new THREE.MeshStandardMaterial({ color: 0x6644ff, emissive: 0x3322aa, emissiveIntensity: 0.4 }),
  coinfrenzy: new THREE.MeshStandardMaterial({ color: 0xffdd00, emissive: 0xbbaa00, emissiveIntensity: 0.4 }),
};

const typeWeights: PowerUpType[] = ['magnet', 'magnet', 'shield', 'shield', 'multiplier', 'multiplier', 'speedboost', 'slowmo', 'coinfrenzy'];

export class PowerUpManager {
  private powerUps: PowerUp[] = [];
  private activePowerUps: ActivePowerUp[] = [];
  private displayEl: HTMLElement | null;

  constructor(private scene: THREE.Scene, private bus: EventBus) {
    this.displayEl = document.getElementById('powerup-display');
  }

  spawnPowerUp(z: number, lane: number, type: PowerUpType): void {
    const mesh = new THREE.Mesh(geometries[type], materials[type]);
    mesh.position.set(LANE_POSITIONS[lane], POWERUP_FLOAT_HEIGHT, z);
    mesh.castShadow = true;
    mesh.frustumCulled = false;
    this.scene.add(mesh);

    this.powerUps.push({ type, mesh, z, lane, collected: false });
  }

  /** Called from WorldGenerator or Game during segment generation */
  trySpawnForSegment(segZ: number): void {
    if (segZ < 60) return; // no power-ups too early
    if (Math.random() > POWERUP_SPAWN_CHANCE) return;

    const lane = Math.floor(Math.random() * 3);
    const type = typeWeights[Math.floor(Math.random() * typeWeights.length)];
    const z = segZ + 4 + Math.random() * (SEGMENT_LENGTH - 8);
    this.spawnPowerUp(z, lane, type);
  }

  update(dt: number, playerZ: number): void {
    // Animate floating power-ups
    const time = performance.now() * 0.001;
    for (const pu of this.powerUps) {
      if (pu.collected) continue;
      pu.mesh.position.y = POWERUP_FLOAT_HEIGHT + Math.sin(time * POWERUP_BOB_SPEED + pu.z) * POWERUP_BOB_AMPLITUDE;
      pu.mesh.rotation.y += POWERUP_ROTATE_SPEED * dt;
    }

    // Remove power-ups far behind player
    this.powerUps = this.powerUps.filter(pu => {
      if (pu.z < playerZ - SEGMENT_LENGTH || pu.collected) {
        this.scene.remove(pu.mesh);
        return false;
      }
      return true;
    });

    // Tick active power-up timers
    for (let i = this.activePowerUps.length - 1; i >= 0; i--) {
      const ap = this.activePowerUps[i];
      if (ap.remainingTime < 0) continue; // shield is hit-based
      ap.remainingTime -= dt;
      if (ap.remainingTime <= 0) {
        this.expire(ap.type);
        this.activePowerUps.splice(i, 1);
      }
    }

    this.updateDisplay();
  }

  /** Check collision between player and power-ups */
  checkCollisions(playerZ: number, playerLane: number, magnetActive: boolean): void {
    for (const pu of this.powerUps) {
      if (pu.collected) continue;
      if (Math.abs(pu.z - playerZ) > POWERUP_COLLECTION_RADIUS) continue;
      if (pu.lane !== playerLane) continue;

      pu.collected = true;
      this.scene.remove(pu.mesh);
      this.activate(pu.type);
      this.bus.emit('powerup:collected', pu);
    }
  }

  activate(type: PowerUpType): void {
    // Remove existing of same type
    this.activePowerUps = this.activePowerUps.filter(ap => {
      if (ap.type === type) {
        this.expire(type); // clean up old one first
        return false;
      }
      return true;
    });

    switch (type) {
      case 'magnet':
        this.activePowerUps.push({ type: 'magnet', remainingTime: MAGNET_DURATION });
        break;
      case 'shield':
        this.activePowerUps.push({ type: 'shield', remainingTime: -1 });
        break;
      case 'multiplier':
        this.activePowerUps.push({ type: 'multiplier', remainingTime: MULTIPLIER_DURATION });
        this.bus.emit('powerup:multiplier-start', MULTIPLIER_VALUE);
        break;
      case 'speedboost':
        this.activePowerUps.push({ type: 'speedboost', remainingTime: SPEEDBOOST_DURATION });
        this.bus.emit('powerup:speedboost-start');
        break;
      case 'slowmo':
        this.activePowerUps.push({ type: 'slowmo', remainingTime: SLOWMO_DURATION });
        this.bus.emit('powerup:slowmo-start');
        break;
      case 'coinfrenzy':
        this.activePowerUps.push({ type: 'coinfrenzy', remainingTime: COINFRENZY_DURATION });
        this.bus.emit('powerup:coinfrenzy-start');
        break;
    }
  }

  private expire(type: PowerUpType): void {
    this.bus.emit('powerup:expired', type);
    if (type === 'multiplier') {
      this.bus.emit('powerup:multiplier-end');
    } else if (type === 'speedboost') {
      this.bus.emit('powerup:speedboost-end');
    } else if (type === 'slowmo') {
      this.bus.emit('powerup:slowmo-end');
    } else if (type === 'coinfrenzy') {
      this.bus.emit('powerup:coinfrenzy-end');
    }
  }

  isActive(type: PowerUpType): boolean {
    return this.activePowerUps.some(ap => ap.type === type);
  }

  /** Consume the shield (called when obstacle collision is intercepted) */
  consumeShield(): void {
    const idx = this.activePowerUps.findIndex(ap => ap.type === 'shield');
    if (idx !== -1) {
      this.activePowerUps.splice(idx, 1);
      this.bus.emit('shield:used');
    }
  }

  getMagnetCoinRadius(): number {
    return this.isActive('magnet') ? MAGNET_COIN_RADIUS : -1;
  }

  getActivePowerUps(): PowerUp[] {
    return this.powerUps.filter(pu => !pu.collected);
  }

  private updateDisplay(): void {
    if (!this.displayEl) return;
    if (this.activePowerUps.length === 0) {
      this.displayEl.textContent = '';
      return;
    }

    const lines: string[] = [];
    for (const ap of this.activePowerUps) {
      let label: string;
      let timeStr: string;
      switch (ap.type) {
        case 'magnet':
          label = 'MAGNET';
          timeStr = `${Math.ceil(ap.remainingTime)}s`;
          break;
        case 'shield':
          label = 'SHIELD';
          timeStr = 'ACTIVE';
          break;
        case 'multiplier':
          label = '2x SCORE';
          timeStr = `${Math.ceil(ap.remainingTime)}s`;
          break;
        case 'speedboost':
          label = 'SPEED BOOST';
          timeStr = `${Math.ceil(ap.remainingTime)}s`;
          break;
        case 'slowmo':
          label = 'SLOW-MO';
          timeStr = `${Math.ceil(ap.remainingTime)}s`;
          break;
        case 'coinfrenzy':
          label = 'COIN FRENZY';
          timeStr = `${Math.ceil(ap.remainingTime)}s`;
          break;
      }
      lines.push(`${label} ${timeStr}`);
    }
    this.displayEl.innerHTML = lines.map(l => `<div>${l}</div>`).join('');
  }

  reset(): void {
    for (const pu of this.powerUps) {
      this.scene.remove(pu.mesh);
    }
    this.powerUps = [];
    this.activePowerUps = [];
    if (this.displayEl) this.displayEl.textContent = '';
  }
}
