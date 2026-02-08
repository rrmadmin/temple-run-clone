import { EventBus } from './EventBus.ts';
import { COIN_VALUE, COIN_TIERS } from './config.ts';
import type { Coin } from './WorldGenerator.ts';

export class ScoreManager {
  score = 0;
  distance = 0;
  coins = 0;
  coinScore = 0; // accumulated coin score (tier-aware)
  multiplier = 1;

  constructor(private bus: EventBus) {
    this.bus.on('collision:coin', (coin: Coin) => {
      this.coins++;
      const value = COIN_TIERS[coin.tier]?.value ?? COIN_VALUE;
      this.coinScore += value * this.multiplier;
      this.bus.emit('score:updated');
    });
  }

  update(dt: number, speed: number): void {
    this.distance += speed * dt;
    this.score = Math.floor(this.distance) + this.coinScore;
    this.bus.emit('score:updated');
  }

  addBonus(amount: number): void {
    this.score += amount;
    this.bus.emit('score:updated');
  }

  reset(): void {
    this.score = 0;
    this.distance = 0;
    this.coins = 0;
    this.coinScore = 0;
    this.multiplier = 1;
  }
}
