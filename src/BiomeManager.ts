import { EventBus } from './EventBus.ts';
import { BIOMES, BIOME_DISTANCE, type BiomeConfig } from './config.ts';

export class BiomeManager {
  private currentIndex = 0;
  private transitioning = false;
  private transitionProgress = 0;
  private transitionDuration = 3; // seconds
  private previousBiome: BiomeConfig;

  constructor(private bus: EventBus) {
    this.previousBiome = BIOMES[0];
  }

  getCurrentBiome(): BiomeConfig {
    return BIOMES[this.currentIndex];
  }

  getTransitionState(): { active: boolean; progress: number; from: BiomeConfig; to: BiomeConfig } {
    return {
      active: this.transitioning,
      progress: this.transitionProgress,
      from: this.previousBiome,
      to: BIOMES[this.currentIndex],
    };
  }

  update(dt: number, distance: number): void {
    const newIndex = Math.floor(distance / BIOME_DISTANCE) % BIOMES.length;

    if (newIndex !== this.currentIndex) {
      this.previousBiome = BIOMES[this.currentIndex];
      this.currentIndex = newIndex;
      this.transitioning = true;
      this.transitionProgress = 0;
      this.bus.emit('biome:changed', BIOMES[this.currentIndex]);
    }

    if (this.transitioning) {
      this.transitionProgress += dt / this.transitionDuration;
      if (this.transitionProgress >= 1) {
        this.transitionProgress = 1;
        this.transitioning = false;
      }
    }
  }

  reset(): void {
    this.currentIndex = 0;
    this.transitioning = false;
    this.transitionProgress = 0;
    this.previousBiome = BIOMES[0];
  }
}
