import * as THREE from 'three';
import { EventBus } from './EventBus.ts';
import { PALETTE } from './config.ts';

const MAX_PARTICLES = 200;

interface Particle {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  life: number;
  maxLife: number;
  r: number; g: number; b: number;
}

export class ParticleSystem {
  private particles: Particle[] = [];
  private positions: Float32Array;
  private colors: Float32Array;
  private sizes: Float32Array;
  private points: THREE.Points;
  private geometry: THREE.BufferGeometry;

  constructor(private scene: THREE.Scene, private bus: EventBus) {
    this.positions = new Float32Array(MAX_PARTICLES * 3);
    this.colors = new Float32Array(MAX_PARTICLES * 4); // rgba
    this.sizes = new Float32Array(MAX_PARTICLES);

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 4));
    this.geometry.setAttribute('size', new THREE.BufferAttribute(this.sizes, 1));

    const material = new THREE.PointsMaterial({
      size: 0.25,
      vertexColors: true,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });

    this.points = new THREE.Points(this.geometry, material);
    this.points.frustumCulled = false;
    this.scene.add(this.points);

    // Subscribe to events
    this.bus.on('collision:coin', (...args: unknown[]) => {
      const coin = args[0] as { z: number; lane: number } | undefined;
      if (coin) {
        const lanePositions = [-2.5, 0, 2.5];
        const pos = new THREE.Vector3(lanePositions[coin.lane], 1.2, coin.z);
        this.spawnBurst(pos, 8, new THREE.Color(PALETTE.particles.coinBurst), 3);
      }
    });

    this.bus.on('collision:obstacle', (...args: unknown[]) => {
      const obs = args[0] as { z: number; lanes: number[] } | undefined;
      if (obs) {
        const lanePositions = [-2.5, 0, 2.5];
        const laneX = lanePositions[obs.lanes[0]] ?? 0;
        const pos = new THREE.Vector3(laneX, 1.0, obs.z);
        this.spawnBurst(pos, 20, new THREE.Color(PALETTE.particles.obstacleBurst), 5);
      }
    });
  }

  spawnBurst(position: THREE.Vector3, count: number, color: THREE.Color, speed: number): void {
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= MAX_PARTICLES) break;

      // Random direction on a sphere
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const s = speed * (0.5 + Math.random() * 0.5);

      this.particles.push({
        x: position.x, y: position.y, z: position.z,
        vx: Math.sin(phi) * Math.cos(theta) * s,
        vy: Math.sin(phi) * Math.sin(theta) * s * 0.5 + 2, // bias upward
        vz: Math.cos(phi) * s,
        life: 0.6 + Math.random() * 0.4,
        maxLife: 0.6 + Math.random() * 0.4,
        r: color.r, g: color.g, b: color.b,
      });
    }
  }

  spawnTrail(position: THREE.Vector3, color?: THREE.Color): void {
    const c = color ?? new THREE.Color(PALETTE.particles.trail);
    const count = 1 + (Math.random() < 0.3 ? 1 : 0);
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= MAX_PARTICLES) break;
      this.particles.push({
        x: position.x + (Math.random() - 0.5) * 0.4,
        y: position.y + 0.05,
        z: position.z - 0.3,
        vx: (Math.random() - 0.5) * 0.5,
        vy: 0.5 + Math.random() * 0.5,
        vz: -0.5 - Math.random() * 0.5,
        life: 0.3 + Math.random() * 0.2,
        maxLife: 0.3 + Math.random() * 0.2,
        r: c.r, g: c.g, b: c.b,
      });
    }
  }

  update(dt: number): void {
    // Update particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      // Gravity
      p.vy -= 5 * dt;
    }

    // Write to buffers
    const count = this.particles.length;
    for (let i = 0; i < count; i++) {
      const p = this.particles[i];
      const i3 = i * 3;
      const i4 = i * 4;
      this.positions[i3] = p.x;
      this.positions[i3 + 1] = p.y;
      this.positions[i3 + 2] = p.z;

      const alpha = p.life / p.maxLife;
      this.colors[i4] = p.r;
      this.colors[i4 + 1] = p.g;
      this.colors[i4 + 2] = p.b;
      this.colors[i4 + 3] = alpha;

      this.sizes[i] = 0.15 + alpha * 0.15;
    }

    // Zero out unused slots so they don't render visibly
    for (let i = count; i < MAX_PARTICLES; i++) {
      const i3 = i * 3;
      const i4 = i * 4;
      this.positions[i3] = 0;
      this.positions[i3 + 1] = -1000;
      this.positions[i3 + 2] = 0;
      this.colors[i4 + 3] = 0;
      this.sizes[i] = 0;
    }

    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
    this.geometry.attributes.size.needsUpdate = true;
    this.geometry.setDrawRange(0, MAX_PARTICLES);
  }
}
