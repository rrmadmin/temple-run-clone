type Callback = (...args: never[]) => void;

export class EventBus {
  private listeners = new Map<string, Set<Callback>>();

  on(event: string, cb: Callback): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(cb);
  }

  off(event: string, cb: Callback): void {
    this.listeners.get(event)?.delete(cb);
  }

  emit(event: string, ...args: unknown[]): void {
    const cbs = this.listeners.get(event);
    if (cbs) {
      for (const cb of cbs) {
        (cb as (...a: unknown[]) => void)(...args);
      }
    }
  }
}
