import * as THREE from 'three';

const MAX_WEATHER_PARTICLES = 150;

type WeatherType = 'dust' | 'rain' | 'drip' | 'sandstorm';

interface WeatherParticle {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  life: number;
  maxLife: number;
  r: number; g: number; b: number;
}

// Spawn configs per weather type
const WEATHER_CONFIGS: Record<WeatherType, {
  spawnRate: number;       // particles per second
  life: [number, number];  // [min, max]
  velocity: (playerZ: number) => { x: number; y: number; z: number; px: number; py: number; pz: number };
  color: [number, number, number]; // r, g, b (0-1)
  size: number;
}> = {
  dust: {
    spawnRate: 8,
    life: [3, 5],
    velocity: (pz) => ({
      px: (Math.random() - 0.5) * 12,
      py: 1 + Math.random() * 4,
      pz: pz + (Math.random() - 0.5) * 20,
      x: (Math.random() - 0.5) * 0.3,
      y: 0.2 + Math.random() * 0.3,
      z: (Math.random() - 0.5) * 0.3,
    }),
    color: [0.85, 0.75, 0.45],
    size: 0.15,
  },
  rain: {
    spawnRate: 60,
    life: [0.4, 0.8],
    velocity: (pz) => ({
      px: (Math.random() - 0.5) * 14,
      py: 8 + Math.random() * 4,
      pz: pz + Math.random() * 20,
      x: (Math.random() - 0.5) * 0.5,
      y: -18 - Math.random() * 6,
      z: (Math.random() - 0.5) * 0.5,
    }),
    color: [0.7, 0.75, 0.9],
    size: 0.08,
  },
  drip: {
    spawnRate: 6,
    life: [1.5, 3],
    velocity: (pz) => ({
      px: (Math.random() - 0.5) * 10,
      py: 6 + Math.random() * 3,
      pz: pz + (Math.random() - 0.5) * 16,
      x: (Math.random() - 0.5) * 0.1,
      y: -2 - Math.random() * 1.5,
      z: (Math.random() - 0.5) * 0.1,
    }),
    color: [0.3, 0.5, 0.35],
    size: 0.12,
  },
  sandstorm: {
    spawnRate: 30,
    life: [1, 2.5],
    velocity: (pz) => ({
      px: (Math.random() - 0.5) * 14,
      py: 0.5 + Math.random() * 4,
      pz: pz + (Math.random() - 0.5) * 20,
      x: 3 + Math.random() * 2,
      y: (Math.random() - 0.5) * 0.5,
      z: (Math.random() - 0.5) * 1,
    }),
    color: [0.8, 0.7, 0.5],
    size: 0.12,
  },
};

export class WeatherSystem {
  private particles: WeatherParticle[] = [];
  private positions: Float32Array;
  private colors: Float32Array;
  private sizes: Float32Array;
  private geometry: THREE.BufferGeometry;
  private points: THREE.Points;
  private weatherType: WeatherType = 'dust';
  private spawnAccumulator = 0;

  constructor(private scene: THREE.Scene) {
    this.positions = new Float32Array(MAX_WEATHER_PARTICLES * 3);
    this.colors = new Float32Array(MAX_WEATHER_PARTICLES * 4);
    this.sizes = new Float32Array(MAX_WEATHER_PARTICLES);

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 4));
    this.geometry.setAttribute('size', new THREE.BufferAttribute(this.sizes, 1));

    const material = new THREE.PointsMaterial({
      size: 0.15,
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
  }

  setWeather(type: WeatherType): void {
    this.weatherType = type;
  }

  update(dt: number, playerZ: number): void {
    const config = WEATHER_CONFIGS[this.weatherType];

    // Spawn new particles
    this.spawnAccumulator += config.spawnRate * dt;
    while (this.spawnAccumulator >= 1 && this.particles.length < MAX_WEATHER_PARTICLES) {
      this.spawnAccumulator -= 1;
      const v = config.velocity(playerZ);
      const [minLife, maxLife] = config.life;
      const life = minLife + Math.random() * (maxLife - minLife);
      this.particles.push({
        x: v.px, y: v.py, z: v.pz,
        vx: v.x, vy: v.y, vz: v.z,
        life,
        maxLife: life,
        r: config.color[0], g: config.color[1], b: config.color[2],
      });
    }

    // Update existing particles
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
      this.colors[i4 + 3] = alpha * 0.6; // weather particles are subtler

      this.sizes[i] = config.size;
    }

    // Zero out unused slots
    for (let i = count; i < MAX_WEATHER_PARTICLES; i++) {
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
    this.geometry.setDrawRange(0, MAX_WEATHER_PARTICLES);
  }
}
