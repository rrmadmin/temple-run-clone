import { EventBus } from './EventBus.ts';

export class InputManager {
  private keys = new Set<string>();

  constructor(private bus: EventBus) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (this.keys.has(e.code)) return;
    this.keys.add(e.code);

    switch (e.code) {
      case 'KeyA':
      case 'ArrowLeft':
        this.bus.emit('input:left');
        break;
      case 'KeyD':
      case 'ArrowRight':
        this.bus.emit('input:right');
        break;
      case 'KeyW':
      case 'ArrowUp':
      case 'Space':
        this.bus.emit('input:jump');
        e.preventDefault();
        break;
      case 'KeyS':
      case 'ArrowDown':
        this.bus.emit('input:slide');
        break;
      case 'KeyP':
      case 'Escape':
        this.bus.emit('input:pause');
        break;
    }
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
  };

  destroy(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
  }
}
