import * as THREE from 'three';
import { EventBus } from './EventBus.ts';
import { InputManager } from './InputManager.ts';
import { Player } from './Player.ts';
import { WorldGenerator } from './WorldGenerator.ts';
import { CollisionSystem } from './CollisionSystem.ts';
import { ScoreManager } from './ScoreManager.ts';
import { PowerUpManager } from './PowerUpManager.ts';
import { ParticleSystem } from './ParticleSystem.ts';
import { AudioManager } from './AudioManager.ts';
import { DifficultyManager } from './DifficultyManager.ts';
import { BiomeManager } from './BiomeManager.ts';
import { WeatherSystem } from './WeatherSystem.ts';
import { ChaserSystem } from './ChaserSystem.ts';
import {
  SKY_COLOR, FOG_NEAR, FOG_FAR,
  CAMERA_OFFSET_Y, CAMERA_OFFSET_Z, CAMERA_LOOK_AHEAD, CAMERA_LERP_SPEED,
  BASE_SPEED, MAX_SPEED, MULTIPLIER_VALUE, LANE_POSITIONS, COIN_TIERS,
  PALETTE, BIOMES,
  type BiomeConfig,
} from './config.ts';
import type { Coin } from './WorldGenerator.ts';

type GameState = 'menu' | 'playing' | 'dying' | 'paused' | 'gameover';

const MILESTONE_THRESHOLDS = [500, 1000, 1500, 2000];

export class Game {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private clock = new THREE.Clock(false);
  private bus: EventBus;
  private input: InputManager;
  private player: Player;
  private world: WorldGenerator;
  private collision: CollisionSystem;
  private scoreManager: ScoreManager;
  private powerUpManager: PowerUpManager;
  private particleSystem: ParticleSystem;
  private audioManager: AudioManager;
  private difficultyManager: DifficultyManager;
  private biomeManager: BiomeManager;
  private weatherSystem: WeatherSystem;
  private chaserSystem: ChaserSystem;
  private state: GameState = 'menu';
  private speed = BASE_SPEED;
  private animFrameId = 0;
  private menuAnimFrameId = 0;
  private lastMilestone = 0;
  private milestoneTimer = 0;

  // Screen shake
  private shakeAmplitude = 0;
  private shakeDuration = 0;
  private shakeTimer = 0;

  // Near-miss flash
  private nearmissTimer = 0;

  // Chaser death flag
  private chaserDeathTriggered = false;
  private deathType: 'obstacle' | 'gap' | 'caught' | 'edge' = 'obstacle';
  private edgeFallSide = 0; // -1 = left, 1 = right

  // Stumble mechanic
  private stumbleTimer = 0;
  private stumbleCount = 0;
  private readonly STUMBLE_DURATION = 1.5;
  private readonly STUMBLE_SPEED_MULT = 0.5;

  // New power-up flags
  private speedBoostActive = false;
  private slowMoActive = false;
  private coinFrenzyActive = false;

  // Biome transition lerp colors
  private biomeTargetSky = new THREE.Color(SKY_COLOR);
  private biomeTargetFogNear = FOG_NEAR;
  private biomeTargetFogFar = FOG_FAR;
  private biomeTargetLightColor = new THREE.Color(BIOMES[0].lightColor);
  private biomeTargetLightIntensity = 0.65;

  // DOM
  private hud: HTMLElement;
  private scoreEl: HTMLElement;
  private distEl: HTMLElement;
  private coinsEl: HTMLElement;
  private coinsNumEl: HTMLElement;
  private menuScreen: HTMLElement;
  private gameoverScreen: HTMLElement;
  private pauseScreen: HTMLElement;
  private milestoneEl: HTMLElement;
  private nearmissEl: HTMLElement;
  private muteBtn: HTMLElement;

  constructor(container: HTMLElement) {
    // Three.js setup
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(SKY_COLOR);
    this.scene.fog = new THREE.Fog(SKY_COLOR, FOG_NEAR, FOG_FAR);

    this.camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      200,
    );

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    // Lighting
    const ambient = new THREE.AmbientLight(PALETTE.lighting.ambient, 0.6);
    this.scene.add(ambient);

    const dirLight = new THREE.DirectionalLight(PALETTE.lighting.directional, 0.8);
    dirLight.position.set(5, 15, -10);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.set(1024, 1024);
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 50;
    dirLight.shadow.camera.left = -15;
    dirLight.shadow.camera.right = 15;
    dirLight.shadow.camera.top = 15;
    dirLight.shadow.camera.bottom = -15;
    this.scene.add(dirLight);

    // Event bus
    this.bus = new EventBus();

    // Systems
    this.input = new InputManager(this.bus);
    this.player = new Player(this.scene, this.bus);
    this.world = new WorldGenerator(this.scene, this.bus);
    this.collision = new CollisionSystem(this.player, this.world, this.bus);
    this.scoreManager = new ScoreManager(this.bus);
    this.powerUpManager = new PowerUpManager(this.scene, this.bus);
    this.collision.setPowerUpManager(this.powerUpManager);
    this.world.setPowerUpManager(this.powerUpManager);
    this.particleSystem = new ParticleSystem(this.scene, this.bus);
    this.audioManager = new AudioManager(this.bus);
    this.difficultyManager = new DifficultyManager(this.bus);
    this.biomeManager = new BiomeManager(this.bus);
    this.weatherSystem = new WeatherSystem(this.scene);
    this.chaserSystem = new ChaserSystem(this.scene);

    // Biome transition event
    this.bus.on('biome:changed', (biome: BiomeConfig) => {
      this.biomeTargetSky.setHex(biome.skyColor);
      this.biomeTargetFogNear = biome.fogNear;
      this.biomeTargetFogFar = biome.fogFar;
      this.biomeTargetLightColor.setHex(biome.lightColor);
      this.biomeTargetLightIntensity = biome.lightIntensity;
      this.world.setBiome(biome);
      this.weatherSystem.setWeather(biome.name === 'Jungle' ? 'rain' : biome.name === 'Cave' ? 'drip' : biome.name === 'Ruins' ? 'sandstorm' : 'dust');
    });

    // DOM refs
    this.hud = document.getElementById('hud')!;
    this.scoreEl = document.getElementById('score-val')!;
    this.distEl = document.getElementById('dist-val')!;
    this.coinsEl = document.getElementById('coins-val')!;
    this.menuScreen = document.getElementById('menu-screen')!;
    this.gameoverScreen = document.getElementById('gameover-screen')!;
    this.pauseScreen = document.getElementById('pause-screen')!;
    this.milestoneEl = document.getElementById('milestone')!;
    this.nearmissEl = document.getElementById('nearmiss')!;
    this.muteBtn = document.getElementById('mute-btn')!;
    this.coinsNumEl = document.getElementById('coins-num')!;

    // Wire events
    // +Z forward with camera behind means X axis is screen-mirrored, so swap directions
    this.bus.on('input:left', () => { if (this.state === 'playing') this.player.switchLane(1); });
    this.bus.on('input:right', () => { if (this.state === 'playing') this.player.switchLane(-1); });
    this.bus.on('input:jump', () => { if (this.state === 'playing') this.player.jump(); });
    this.bus.on('input:slide', () => { if (this.state === 'playing') this.player.slide(); });
    this.bus.on('input:pause', () => this.togglePause());

    this.bus.on('collision:obstacle', () => {
      if (this.powerUpManager.isActive('shield')) {
        this.powerUpManager.consumeShield();
      } else {
        this.deathType = 'obstacle';
        this.triggerShake(0.5, 0.3); // strong shake on death
        this.gameOver();
      }
    });

    this.bus.on('collision:gap', (obs: { z: number }) => {
      if (this.powerUpManager.isActive('shield')) {
        this.powerUpManager.consumeShield();
      } else {
        this.deathType = 'gap';
        // Far edge of pit = gap center + half the gap length (8/2 = 4)
        this.player.setFallEdge(obs.z + 4);
        this.gameOver();
      }
    });

    this.bus.on('collision:stumble', () => {
      this.stumbleCount++;
      if (this.stumbleCount >= 2) {
        // Second hit — Endermen rush in to catch you
        this.stumbleTimer = this.STUMBLE_DURATION;
        this.speed *= 0.1; // near-stop
        this.chaserSystem.closeToCatch();
        this.triggerShake(0.5, 0.4);
      } else {
        // First hit — slow down, Endermen close in
        this.stumbleTimer = this.STUMBLE_DURATION;
        this.chaserSystem.onPlayerStumble();
        this.triggerShake(0.25, 0.2);
      }
    });

    this.bus.on('collision:edge', (data: { side: number }) => {
      this.deathType = 'edge';
      this.edgeFallSide = data.side;
      this.player.setEdgeFallSide(data.side);
      this.gameOver();
    });

    this.bus.on('shield:used', () => {
      this.triggerShake(0.3, 0.2); // medium shake on shield hit
    });

    this.bus.on('nearmiss', () => {
      this.triggerShake(0.1, 0.1); // tiny camera bump
      this.scoreManager.addBonus(25);
      this.nearmissEl.style.opacity = '1';
      this.nearmissTimer = 1.0;
    });

    this.bus.on('score:updated', () => this.updateHUD());

    // Coin fly animation on collection
    this.bus.on('collision:coin', (coin: Coin) => {
      this.spawnCoinFly(coin);
    });

    // Power-up multiplier events
    this.bus.on('powerup:multiplier-start', () => {
      this.scoreManager.multiplier = MULTIPLIER_VALUE;
    });
    this.bus.on('powerup:multiplier-end', () => {
      this.scoreManager.multiplier = 1;
    });

    // Speed boost events
    this.bus.on('powerup:speedboost-start', () => { this.speedBoostActive = true; });
    this.bus.on('powerup:speedboost-end', () => { this.speedBoostActive = false; });

    // Slow-mo events
    this.bus.on('powerup:slowmo-start', () => { this.slowMoActive = true; });
    this.bus.on('powerup:slowmo-end', () => { this.slowMoActive = false; });

    // Coin frenzy events
    this.bus.on('powerup:coinfrenzy-start', () => { this.coinFrenzyActive = true; });
    this.bus.on('powerup:coinfrenzy-end', () => { this.coinFrenzyActive = false; });

    // UI buttons
    document.getElementById('play-btn')!.addEventListener('click', () => this.startGame());
    document.getElementById('restart-btn')!.addEventListener('click', () => this.startGame());
    document.getElementById('resume-btn')!.addEventListener('click', () => this.togglePause());

    // Mute button
    this.muteBtn.addEventListener('click', () => {
      const muted = this.audioManager.toggleMute();
      this.muteBtn.textContent = muted ? 'Sound: OFF' : 'Sound: ON';
    });

    // Resize
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // Initial render of menu scene
    this.player.reset();
    this.world.generate(0);
    this.updateCamera(0);
    this.renderer.render(this.scene, this.camera);

    // Populate menu stats from localStorage
    const bestScore = localStorage.getItem('temple-run-highscore') || '0';
    const gamesPlayed = localStorage.getItem('temple-run-games-played') || '0';
    const bestDist = localStorage.getItem('temple-run-best-distance') || '0';
    document.getElementById('stat-best')!.textContent = `Best: ${bestScore}`;
    document.getElementById('stat-games')!.textContent = `Games Played: ${gamesPlayed}`;
    document.getElementById('stat-dist')!.textContent = `Best Distance: ${bestDist}m`;

    // Start animated menu background
    this.menuAnimLoop();
  }

  private startGame(): void {
    // Stop menu animation
    cancelAnimationFrame(this.menuAnimFrameId);

    this.state = 'playing';
    this.speed = BASE_SPEED;
    this.lastMilestone = 0;
    this.milestoneTimer = 0;

    // Reset systems
    this.world.reset();
    this.player.reset();
    this.scoreManager.reset();
    this.powerUpManager.reset();
    this.difficultyManager.reset();
    this.biomeManager.reset();
    this.chaserSystem.reset();
    this.chaserDeathTriggered = false;
    this.deathType = 'obstacle';
    this.stumbleTimer = 0;
    this.stumbleCount = 0;
    this.edgeFallSide = 0;
    this.biomeTargetSky.setHex(SKY_COLOR);
    this.biomeTargetFogNear = FOG_NEAR;
    this.biomeTargetFogFar = FOG_FAR;
    this.biomeTargetLightColor.setHex(BIOMES[0].lightColor);
    this.biomeTargetLightIntensity = 0.65;

    // Generate initial world
    this.world.generate(0);

    // UI
    this.menuScreen.classList.add('hidden');
    this.gameoverScreen.classList.add('hidden');
    this.gameoverScreen.classList.remove('fade-in');
    this.pauseScreen.classList.add('hidden');
    this.hud.classList.remove('hidden');
    this.milestoneEl.style.opacity = '0';
    this.nearmissEl.style.opacity = '0';

    // Reset shake state
    this.shakeAmplitude = 0;
    this.shakeDuration = 0;
    this.shakeTimer = 0;
    this.nearmissTimer = 0;

    // Reset power-up flags
    this.speedBoostActive = false;
    this.slowMoActive = false;
    this.coinFrenzyActive = false;

    // Start loop
    this.clock.start();
    cancelAnimationFrame(this.animFrameId);
    this.loop();
  }

  private menuAnimLoop = (): void => {
    if (this.state !== 'menu' && this.state !== 'gameover') return;
    this.camera.position.z += 3 * (1 / 60);
    this.camera.lookAt(0, 2, this.camera.position.z + 10);
    this.world.generate(this.camera.position.z + 50);
    this.renderer.render(this.scene, this.camera);
    this.menuAnimFrameId = requestAnimationFrame(this.menuAnimLoop);
  };

  private loop = (): void => {
    if (this.state !== 'playing' && this.state !== 'dying') return;

    const dt = Math.min(this.clock.getDelta(), 0.1);

    // === DYING STATE: play death animation, skip gameplay updates ===
    if (this.state === 'dying') {
      const stillAnimating = this.deathType === 'gap'
        ? this.player.playFallAnimation(dt)
        : this.deathType === 'caught'
        ? this.player.playCaughtAnimation(dt)
        : this.deathType === 'edge'
        ? this.player.playEdgeFallAnimation(dt)
        : this.player.playDeathAnimation(dt);
      if (!this.chaserDeathTriggered) {
        this.chaserDeathTriggered = true;
        this.chaserSystem.setDeathTarget(this.player.mesh.position.z);
        this.chaserSystem.onPlayerDeath();
      }
      this.chaserSystem.update(dt, this.player.mesh.position.z, this.speed, this.scoreManager.distance);
      this.particleSystem.update(dt);
      this.weatherSystem.update(dt, this.player.mesh.position.z);
      this.updateCamera(dt);
      this.renderer.render(this.scene, this.camera);
      if (stillAnimating) {
        this.animFrameId = requestAnimationFrame(this.loop);
      } else {
        this.finishGameOver();
      }
      return;
    }

    // Update difficulty based on distance
    const distance = this.scoreManager.distance;
    this.difficultyManager.update(dt, distance);
    this.speed = this.difficultyManager.currentSpeed;
    if (this.speedBoostActive) this.speed *= 1.5;
    if (this.slowMoActive) this.speed *= 0.6;
    if (this.stumbleTimer > 0) {
      this.stumbleTimer -= dt;
      if (this.stumbleCount >= 2) {
        this.speed *= 0.1; // near-stop on second stumble
      } else {
        this.speed *= this.STUMBLE_SPEED_MULT;
      }
      if (this.stumbleTimer <= 0) {
        this.stumbleCount = 0; // recovered — reset strike count
      }
    }
    this.player.setSpeed(this.speed);

    // Pass difficulty info to world generator
    this.world.setDifficulty(this.difficultyManager.getInfo());
    this.world.setCurrentDistance(distance);

    // Update biome system and apply smooth transitions
    this.biomeManager.update(dt, distance);
    this.applyBiomeTransition(dt);

    // Move player forward
    this.player.mesh.position.z += this.speed * dt;

    // Update systems
    this.player.update(dt);
    this.world.generate(this.player.mesh.position.z);
    this.world.updateCoins(this.player.mesh.position.z, dt);
    this.powerUpManager.update(dt, this.player.mesh.position.z);
    this.collision.update();
    this.scoreManager.update(dt, this.speed);
    this.particleSystem.update(dt);
    this.weatherSystem.update(dt, this.player.mesh.position.z);
    this.chaserSystem.update(dt, this.player.mesh.position.z, this.speed, this.scoreManager.distance);

    // Check if Endermen caught the player
    if (this.chaserSystem.caught) {
      this.deathType = 'caught';
      this.gameOver();
    }

    // Coin frenzy: spawn extra coins ahead each frame
    if (this.coinFrenzyActive) {
      this.world.spawnFrenzyCoins(this.player.mesh.position.z);
    }

    // Running dust trail when player is on the ground
    if (!this.player.isJumping) {
      this.particleSystem.spawnTrail(this.player.mesh.position);
    }

    // Distance milestones
    this.checkMilestones(dt);

    // Near-miss flash timer
    if (this.nearmissTimer > 0) {
      this.nearmissTimer -= dt;
      if (this.nearmissTimer <= 0) {
        this.nearmissEl.style.opacity = '0';
      }
    }

    // Camera
    this.updateCamera(dt);

    // Move directional light to follow player
    const dirLight = this.scene.children.find(
      c => c instanceof THREE.DirectionalLight
    ) as THREE.DirectionalLight | undefined;
    if (dirLight) {
      dirLight.position.set(5, 15, this.player.mesh.position.z - 10);
      dirLight.target.position.set(0, 0, this.player.mesh.position.z);
      dirLight.target.updateMatrixWorld();
    }

    // Render
    this.renderer.render(this.scene, this.camera);

    this.animFrameId = requestAnimationFrame(this.loop);
  };

  private applyBiomeTransition(dt: number): void {
    const lerpSpeed = 1.5; // controls how fast the color transitions (~3s total)
    const t = 1 - Math.exp(-lerpSpeed * dt);

    // Lerp sky color
    const bg = this.scene.background as THREE.Color;
    bg.lerp(this.biomeTargetSky, t);

    // Lerp fog
    const fog = this.scene.fog as THREE.Fog;
    fog.color.lerp(this.biomeTargetSky, t);
    fog.near += (this.biomeTargetFogNear - fog.near) * t;
    fog.far += (this.biomeTargetFogFar - fog.far) * t;

    // Lerp directional light color and intensity
    const dirLight = this.scene.children.find(
      c => c instanceof THREE.DirectionalLight
    ) as THREE.DirectionalLight | undefined;
    if (dirLight) {
      dirLight.color.lerp(this.biomeTargetLightColor, t);
      dirLight.intensity += (this.biomeTargetLightIntensity - dirLight.intensity) * t;
    }
  }

  private checkMilestones(dt: number): void {
    const dist = Math.floor(this.scoreManager.distance);
    for (const threshold of MILESTONE_THRESHOLDS) {
      if (dist >= threshold && this.lastMilestone < threshold) {
        this.lastMilestone = threshold;
        this.milestoneEl.textContent = `${threshold}m!`;
        this.milestoneEl.style.opacity = '1';
        this.milestoneTimer = 1.5;
      }
    }
    if (this.milestoneTimer > 0) {
      this.milestoneTimer -= dt;
      if (this.milestoneTimer <= 0) {
        this.milestoneEl.style.opacity = '0';
      }
    }
  }

  private triggerShake(amplitude: number, duration: number): void {
    this.shakeAmplitude = amplitude;
    this.shakeDuration = duration;
    this.shakeTimer = duration;
  }

  private updateCamera(dt: number): void {
    const pz = this.player.mesh.position.z;
    const px = this.player.mesh.position.x;

    const targetX = px;
    const targetY = CAMERA_OFFSET_Y;
    const targetZ = pz + CAMERA_OFFSET_Z;

    if (dt > 0) {
      const t = 1 - Math.exp(-CAMERA_LERP_SPEED * dt);
      this.camera.position.x += (targetX - this.camera.position.x) * t;
      this.camera.position.y += (targetY - this.camera.position.y) * t;
      this.camera.position.z += (targetZ - this.camera.position.z) * t;
    } else {
      this.camera.position.set(targetX, targetY, targetZ);
    }

    // Apply screen shake as decaying sine wave offset AFTER the normal lerp
    if (this.shakeTimer > 0) {
      this.shakeTimer -= dt;
      const decay = Math.max(0, this.shakeTimer / this.shakeDuration);
      const offset = this.shakeAmplitude * Math.sin(this.shakeTimer * 30) * decay;
      this.camera.position.x += offset;
      this.camera.position.y += offset * 0.7;
    }

    this.camera.lookAt(px, 2, pz + CAMERA_LOOK_AHEAD);
  }

  private updateHUD(): void {
    this.scoreEl.textContent = String(this.scoreManager.score);
    this.distEl.textContent = `${Math.floor(this.scoreManager.distance)}m`;
    this.coinsNumEl.textContent = String(this.scoreManager.coins);
  }

  private spawnCoinFly(coin: Coin): void {
    // Project 3D coin position to 2D screen coordinates
    const coinPos = new THREE.Vector3(
      LANE_POSITIONS[coin.lane],
      coin.y,
      coin.z,
    );
    coinPos.project(this.camera);

    // Convert NDC (-1..1) to screen pixels
    const screenX = (coinPos.x * 0.5 + 0.5) * window.innerWidth;
    const screenY = (-coinPos.y * 0.5 + 0.5) * window.innerHeight;

    // Don't animate coins behind camera
    if (coinPos.z > 1) return;

    // Get target position (the coin counter in HUD)
    const counterRect = this.coinsEl.getBoundingClientRect();
    const targetX = counterRect.left + counterRect.width / 2;
    const targetY = counterRect.top + counterRect.height / 2;

    // Create flying coin DOM element with tier-matched color
    const tierColor = '#' + COIN_TIERS[coin.tier].color.toString(16).padStart(6, '0');
    const el = document.createElement('div');
    el.className = 'coin-fly';
    el.style.background = tierColor;
    el.style.left = `${screenX - 15}px`;
    el.style.top = `${screenY - 15}px`;
    document.body.appendChild(el);

    // Trigger fly animation on next frame
    requestAnimationFrame(() => {
      el.classList.add('animate');
      el.style.left = `${targetX - 15}px`;
      el.style.top = `${targetY - 15}px`;
      el.style.opacity = '0.3';
      el.style.transform = 'scale(0.7)';
    });

    // Pop the counter and clean up
    el.addEventListener('transitionend', () => {
      el.remove();
      this.coinsEl.classList.remove('pop');
      void this.coinsEl.offsetWidth; // force reflow
      this.coinsEl.classList.add('pop');
    }, { once: true });

    // Fallback cleanup
    setTimeout(() => el.remove(), 950);
  }

  private togglePause(): void {
    if (this.state === 'playing') {
      this.state = 'paused';
      this.clock.stop();
      document.getElementById('pause-score')!.textContent = `Score: ${this.scoreManager.score}`;
      document.getElementById('pause-dist')!.textContent = `Distance: ${Math.floor(this.scoreManager.distance)}m`;
      this.pauseScreen.classList.remove('hidden');
    } else if (this.state === 'paused') {
      this.state = 'playing';
      this.clock.start();
      this.pauseScreen.classList.add('hidden');
      this.loop();
    }
  }

  private gameOver(): void {
    this.state = 'dying';
    this.player.isAlive = false;
    // Clock keeps running so death animation gets dt updates
  }

  private finishGameOver(): void {
    this.state = 'gameover';
    this.clock.stop();

    // High score
    const currentScore = this.scoreManager.score;
    const currentDist = Math.floor(this.scoreManager.distance);
    const storedHigh = parseInt(localStorage.getItem('temple-run-highscore') || '0', 10);
    const isNewHigh = currentScore > storedHigh;
    if (isNewHigh) {
      localStorage.setItem('temple-run-highscore', String(currentScore));
    }
    const highScore = Math.max(currentScore, storedHigh);

    // Increment games played
    const gamesPlayed = parseInt(localStorage.getItem('temple-run-games-played') || '0', 10) + 1;
    localStorage.setItem('temple-run-games-played', String(gamesPlayed));

    // Track best distance
    const storedBestDist = parseInt(localStorage.getItem('temple-run-best-distance') || '0', 10);
    if (currentDist > storedBestDist) {
      localStorage.setItem('temple-run-best-distance', String(currentDist));
    }

    // Death biome
    const biomeName = this.biomeManager.getCurrentBiome().name;
    document.getElementById('death-biome')!.textContent = `Fell in the ${biomeName}`;

    // UI
    this.hud.classList.add('hidden');
    this.gameoverScreen.classList.remove('hidden');
    this.gameoverScreen.classList.add('fade-in');
    document.getElementById('final-score')!.textContent = String(currentScore);
    document.getElementById('final-dist')!.textContent = `${currentDist}m`;
    document.getElementById('final-coins')!.textContent = `${this.scoreManager.coins} coins`;
    const highScoreEl = document.getElementById('high-score')!;
    highScoreEl.textContent = isNewHigh
      ? `NEW HIGH SCORE: ${highScore}`
      : `High Score: ${highScore}`;

    // Restart menu animation behind gameover overlay
    this.menuAnimLoop();
  }
}
