import { EventBus } from './EventBus.ts';
import {
  BASE_SPEED, MAX_SPEED,
  DIFFICULTY_TIERS, DIFFICULTY_LOG_DIVISOR, DIFFICULTY_LOG_CAP,
} from './config.ts';

export interface DifficultyInfo {
  scalar: number;       // 0..1 overall difficulty
  tier: number;         // current tier index (0-3)
  speed: number;        // current speed
  density: number;      // obstacle density 0..1
  minGap: number;       // minimum gap between obstacles
}

export class DifficultyManager {
  private _tier = 0;
  private _scalar = 0;
  private _speed = BASE_SPEED;
  private _density = DIFFICULTY_TIERS[0].density;
  private _minGap = DIFFICULTY_TIERS[0].minGap;
  private _distance = 0;

  constructor(private bus: EventBus) {}

  get currentSpeed(): number { return this._speed; }
  get tier(): number { return this._tier; }
  get scalar(): number { return this._scalar; }
  get density(): number { return this._density; }
  get minGap(): number { return this._minGap; }

  getInfo(): DifficultyInfo {
    return {
      scalar: this._scalar,
      tier: this._tier,
      speed: this._speed,
      density: this._density,
      minGap: this._minGap,
    };
  }

  update(dt: number, distance: number): void {
    this._distance = distance;

    // Logarithmic difficulty scalar: min(1.0, log2(1 + distance/200) / 4)
    this._scalar = Math.min(
      1.0,
      Math.log2(1 + distance / DIFFICULTY_LOG_DIVISOR) / DIFFICULTY_LOG_CAP,
    );

    // Determine tier
    let newTier = 0;
    for (let i = DIFFICULTY_TIERS.length - 1; i >= 0; i--) {
      if (distance >= DIFFICULTY_TIERS[i].distance) {
        newTier = i;
        break;
      }
    }

    if (newTier !== this._tier) {
      const oldTier = this._tier;
      this._tier = newTier;
      this.bus.emit('difficulty:increased', newTier, oldTier);
    }

    // Interpolate speed, density, minGap based on scalar
    this._speed = Math.min(BASE_SPEED + (MAX_SPEED - BASE_SPEED) * this._scalar, MAX_SPEED);

    // Interpolate density and minGap between current tier and next
    const currentTier = DIFFICULTY_TIERS[this._tier];
    const nextTier = DIFFICULTY_TIERS[Math.min(this._tier + 1, DIFFICULTY_TIERS.length - 1)];

    if (this._tier < DIFFICULTY_TIERS.length - 1) {
      const tierStart = currentTier.distance;
      const tierEnd = nextTier.distance;
      const progress = Math.min(1, (distance - tierStart) / (tierEnd - tierStart));
      this._density = currentTier.density + (nextTier.density - currentTier.density) * progress;
      this._minGap = currentTier.minGap + (nextTier.minGap - currentTier.minGap) * progress;
    } else {
      this._density = currentTier.density;
      this._minGap = currentTier.minGap;
    }
  }

  reset(): void {
    this._tier = 0;
    this._scalar = 0;
    this._speed = BASE_SPEED;
    this._density = DIFFICULTY_TIERS[0].density;
    this._minGap = DIFFICULTY_TIERS[0].minGap;
    this._distance = 0;
  }
}
