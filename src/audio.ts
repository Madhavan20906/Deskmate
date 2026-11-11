/**
 * Deskmate — Web Audio Procedural Sound Synthesizer
 *
 * 100% self-contained, offline-first spatial and tactile audio.
 * Generates warm, calming sound effects using the Web Audio API without
 * external audio files, eliminating network latency and CORS issues.
 */

class SoundSynthesizer {
  private ctx: AudioContext | null = null;
  private isMuted = false;
  private masterVolume = 0.7;

  private getAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (this.ctx === null) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public setMuted(muted: boolean): void {
    this.isMuted = muted;
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  public setVolume(volume: number): void {
    this.masterVolume = Math.max(0, Math.min(1, volume));
  }

  public getVolume(): number {
    return this.masterVolume;
  }

  /**
   * Subtle tactile paper/card pickup flutter
   */
  public playCardPickup(): void {
    if (this.isMuted) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.exponentialRampToValueAtTime(540, now + 0.08);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.18 * this.masterVolume, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.1);
  }

  /**
   * Satisfying soft wooden/felt placement snap
   */
  public playCardDrop(): void {
    if (this.isMuted) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(420, now);
    osc.frequency.exponentialRampToValueAtTime(140, now + 0.09);

    gain.gain.setValueAtTime(0.25 * this.masterVolume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.11);
  }

  /**
   * Crystal glass resonance when a completed task marble enters the Evening Jar
   */
  public playJarDrop(): void {
    if (this.isMuted) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const freqs = [1760, 2640, 3520]; // A6 harmonics
    freqs.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.02);

      const amp = (0.22 / (idx + 1)) * this.masterVolume;
      gain.gain.setValueAtTime(0.001, now + idx * 0.02);
      gain.gain.linearRampToValueAtTime(amp, now + idx * 0.02 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5 + idx * 0.05);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + idx * 0.02);
      osc.stop(now + 0.6);
    });
  }

  /**
   * Warm Tibetan singing bowl chime / focus completion bell
   */
  public playChime(): void {
    if (this.isMuted) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const partials = [
      { freq: 528, amp: 0.35, decay: 1.8 },   // 528Hz "Transformation" tone
      { freq: 1056, amp: 0.18, decay: 1.4 },
      { freq: 1584, amp: 0.08, decay: 1.0 },
    ];

    partials.forEach(({ freq, amp, decay }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(amp * this.masterVolume, now + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + decay);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + decay + 0.1);
    });
  }

  /**
   * Cheerful rising major arpeggio for plant bloom and streak milestones
   */
  public playBloom(): void {
    if (this.isMuted) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const startTime = now + idx * 0.08;

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, startTime);

      gain.gain.setValueAtTime(0.001, startTime);
      gain.gain.linearRampToValueAtTime(0.2 * this.masterVolume, startTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.35);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(startTime);
      osc.stop(startTime + 0.4);
    });
  }

  /**
   * Gentle ambient amber warning chime for slot overload
   */
  public playOverloadAlert(): void {
    if (this.isMuted) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const notes = [440, 415.3]; // A4 down to G#4
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const startTime = now + idx * 0.12;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);

      gain.gain.setValueAtTime(0.001, startTime);
      gain.gain.linearRampToValueAtTime(0.18 * this.masterVolume, startTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.28);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(startTime);
      osc.stop(startTime + 0.32);
    });
  }
}

export const soundManager = new SoundSynthesizer();
