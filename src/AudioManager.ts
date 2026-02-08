import { EventBus } from './EventBus.ts';

export class AudioManager {
  private ctx: AudioContext | null = null;
  private muted = false;
  private initialized = false;

  constructor(private bus: EventBus) {
    // AudioContext must be created on first user gesture
    const initOnGesture = () => {
      if (this.initialized) return;
      this.initialized = true;
      this.ctx = new AudioContext();
      window.removeEventListener('click', initOnGesture);
      window.removeEventListener('keydown', initOnGesture);
    };
    window.addEventListener('click', initOnGesture);
    window.addEventListener('keydown', initOnGesture);

    // Subscribe to events
    this.bus.on('collision:coin', () => this.coinCollect());
    this.bus.on('player:jumped', () => this.jump());
    this.bus.on('player:slid', () => this.slide());
    this.bus.on('collision:obstacle', () => this.crash());
    this.bus.on('powerup:collected', () => this.powerUpCollect());
  }

  private coinCollect(): void {
    if (this.muted || !this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, t);
    osc.frequency.exponentialRampToValueAtTime(1200, t + 0.05);
    gain.gain.setValueAtTime(0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    osc.connect(gain).connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.1);
  }

  private jump(): void {
    if (this.muted || !this.ctx) return;
    const t = this.ctx.currentTime;
    const bufferSize = this.ctx.sampleRate * 0.12;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1);
    }
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    const bandpass = this.ctx.createBiquadFilter();
    bandpass.type = 'bandpass';
    bandpass.frequency.setValueAtTime(2000, t);
    bandpass.Q.setValueAtTime(2, t);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    source.connect(bandpass).connect(gain).connect(this.ctx.destination);
    source.start(t);
    source.stop(t + 0.12);
  }

  private slide(): void {
    if (this.muted || !this.ctx) return;
    const t = this.ctx.currentTime;
    const bufferSize = this.ctx.sampleRate * 0.15;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1);
    }
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    const bandpass = this.ctx.createBiquadFilter();
    bandpass.type = 'bandpass';
    bandpass.frequency.setValueAtTime(500, t);
    bandpass.Q.setValueAtTime(1.5, t);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.15, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    source.connect(bandpass).connect(gain).connect(this.ctx.destination);
    source.start(t);
    source.stop(t + 0.15);
  }

  private crash(): void {
    if (this.muted || !this.ctx) return;
    const t = this.ctx.currentTime;

    // Low sine
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(60, t + 0.3);
    const oscGain = this.ctx.createGain();
    oscGain.gain.setValueAtTime(0.3, t);
    oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    osc.connect(oscGain).connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.3);

    // Noise layer
    const bufferSize = this.ctx.sampleRate * 0.3;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1);
    }
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.15, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    source.connect(noiseGain).connect(this.ctx.destination);
    source.start(t);
    source.stop(t + 0.3);
  }

  private powerUpCollect(): void {
    if (this.muted || !this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(400, t);
    osc.frequency.exponentialRampToValueAtTime(1200, t + 0.25);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.25, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    osc.connect(gain).connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.25);
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    return this.muted;
  }

  get isMuted(): boolean {
    return this.muted;
  }
}
