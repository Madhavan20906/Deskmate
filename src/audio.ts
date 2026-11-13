/**
 * Spatial ambient audio for the Ghost Deskmate.
 * Generates faint procedural keyboard typing and page turns
 * spatially positioned on the companion side of the desk.
 * Dynamically lowers volume during active focus sessions.
 */

export class GhostDeskmateAudio {
  private ctx: AudioContext | null = null;
  private panner: PannerNode | null = null;
  private gainNode: GainNode | null = null;
  private timer: number | null = null;
  private enabled = true;
  private isFocusing = false;
  private baseVolume = 0.10;
  private focusVolume = 0.025;

  public init(): void {
    if (this.ctx !== null) return;
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
      this.gainNode = this.ctx.createGain();
      this.gainNode.gain.setValueAtTime(this.baseVolume, this.ctx.currentTime);

      // Create spatial panner positioned on the side of the desk (+0.7m right, -0.6m forward)
      if (typeof this.ctx.createPanner === 'function') {
        this.panner = this.ctx.createPanner();
        this.panner.panningModel = 'HRTF';
        this.panner.distanceModel = 'inverse';
        this.panner.refDistance = 0.5;
        this.panner.maxDistance = 5;
        this.panner.rolloffFactor = 1;
        if (this.panner.positionX) {
          this.panner.positionX.setValueAtTime(0.7, this.ctx.currentTime);
          this.panner.positionY.setValueAtTime(0.0, this.ctx.currentTime);
          this.panner.positionZ.setValueAtTime(-0.6, this.ctx.currentTime);
        } else {
          this.panner.setPosition(0.7, 0.0, -0.6);
        }
        this.gainNode.connect(this.panner);
        this.panner.connect(this.ctx.destination);
      } else {
        this.gainNode.connect(this.ctx.destination);
      }

      this.scheduleNextAmbientSound();
    } catch {
      // AudioContext unavailable or blocked by policy
    }
  }

  public ensureRunning(): void {
    if (this.ctx === null) {
      this.init();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
  }

  public setFocusing(focusing: boolean): void {
    this.isFocusing = focusing;
    if (this.gainNode && this.ctx) {
      const targetVol = this.enabled ? (this.isFocusing ? this.focusVolume : this.baseVolume) : 0;
      this.gainNode.gain.linearRampToValueAtTime(targetVol, this.ctx.currentTime + 1.0);
    }
  }

  public toggle(): boolean {
    this.enabled = !this.enabled;
    if (this.gainNode && this.ctx) {
      const targetVol = this.enabled ? (this.isFocusing ? this.focusVolume : this.baseVolume) : 0;
      this.gainNode.gain.setValueAtTime(targetVol, this.ctx.currentTime);
    }
    return this.enabled;
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  private scheduleNextAmbientSound(): void {
    if (this.timer !== null) {
      window.clearTimeout(this.timer);
    }
    // Random delay between 4 and 10 seconds
    const delay = Math.floor(Math.random() * 6000) + 4000;
    this.timer = window.setTimeout(() => {
      this.playRandomAmbientSound();
      this.scheduleNextAmbientSound();
    }, delay);
  }

  private playRandomAmbientSound(): void {
    if (!this.enabled || !this.ctx || this.ctx.state !== 'running') return;
    // 70% chance typing cluster, 30% chance page turn
    if (Math.random() < 0.7) {
      this.playKeyboardBurst();
    } else {
      this.playPageTurn();
    }
  }

  private playKeyboardBurst(): void {
    if (!this.ctx || !this.gainNode) return;
    const keyCount = Math.floor(Math.random() * 4) + 2; // 2 to 5 keystrokes
    let offset = 0;
    for (let i = 0; i < keyCount; i++) {
      window.setTimeout(() => this.playSingleKeystroke(), offset);
      offset += Math.floor(Math.random() * 120) + 70; // 70-190ms interval between keys
    }
  }

  private playSingleKeystroke(): void {
    if (!this.ctx || !this.gainNode || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();

    // Subtle wooden/plastic mechanical click frequency
    const freq = 1400 + Math.random() * 600;
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(300, now + 0.025);

    oscGain.gain.setValueAtTime(0.08, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.028);

    osc.connect(oscGain);
    oscGain.connect(this.gainNode);

    osc.start(now);
    osc.stop(now + 0.03);
  }

  private playPageTurn(): void {
    if (!this.ctx || !this.gainNode || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const bufferSize = Math.floor(this.ctx.sampleRate * 0.2); // 200ms noise
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(800, now);
    filter.frequency.linearRampToValueAtTime(1600, now + 0.15);
    filter.Q.value = 1.8;

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.001, now);
    noiseGain.gain.linearRampToValueAtTime(0.07, now + 0.05);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.gainNode);

    noise.start(now);
  }

  public playJarFillSound(): void {
    if (!this.ctx || !this.gainNode) return;
    this.ensureRunning();
    const now = this.ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6 chime
    notes.forEach((freq, idx) => {
      if (!this.ctx || !this.gainNode) return;
      const osc = this.ctx.createOscillator();
      const noteGain = this.ctx.createGain();
      const startTime = now + idx * 0.08;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);

      noteGain.gain.setValueAtTime(0.12, startTime);
      noteGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.5);

      osc.connect(noteGain);
      noteGain.connect(this.gainNode);

      osc.start(startTime);
      osc.stop(startTime + 0.52);
    });
  }

  public playPinchTick(): void {
    if (!this.ctx || !this.gainNode || !this.enabled) return;
    this.ensureRunning();
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const tickGain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(2400, now);
    osc.frequency.exponentialRampToValueAtTime(500, now + 0.015);

    tickGain.gain.setValueAtTime(0.15, now);
    tickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.018);

    osc.connect(tickGain);
    tickGain.connect(this.gainNode);

    osc.start(now);
    osc.stop(now + 0.02);
  }

  public playHoverHum(): void {
    if (!this.ctx || !this.gainNode || !this.enabled) return;
    this.ensureRunning();
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const humGain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(520, now);

    humGain.gain.setValueAtTime(0.04, now);
    humGain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

    osc.connect(humGain);
    humGain.connect(this.gainNode);

    osc.start(now);
    osc.stop(now + 0.045);
  }

  public playSnapSound(): void {
    if (!this.ctx || !this.gainNode || !this.enabled) return;
    this.ensureRunning();
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const snapGain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(220, now + 0.04);

    snapGain.gain.setValueAtTime(0.14, now);
    snapGain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

    osc.connect(snapGain);
    snapGain.connect(this.gainNode);

    osc.start(now);
    osc.stop(now + 0.055);
  }

  public playPipChirp(): void {
    if (!this.ctx || !this.gainNode || !this.enabled) return;
    this.ensureRunning();
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const chirpGain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(659.25, now);
    osc.frequency.exponentialRampToValueAtTime(1046.5, now + 0.07);

    chirpGain.gain.setValueAtTime(0.12, now);
    chirpGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

    osc.connect(chirpGain);
    chirpGain.connect(this.gainNode);

    osc.start(now);
    osc.stop(now + 0.11);
  }

  public playPlantRustle(): void {
    if (!this.ctx || !this.gainNode || !this.enabled) return;
    this.ensureRunning();
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const rustleGain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.exponentialRampToValueAtTime(580, now + 0.08);

    rustleGain.gain.setValueAtTime(0.08, now);
    rustleGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    osc.connect(rustleGain);
    rustleGain.connect(this.gainNode);

    osc.start(now);
    osc.stop(now + 0.13);
  }

  public playLampToggle(): void {
    if (!this.ctx || !this.gainNode || !this.enabled) return;
    this.ensureRunning();
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const clickGain = this.ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(400, now);
    osc.frequency.exponentialRampToValueAtTime(120, now + 0.025);

    clickGain.gain.setValueAtTime(0.15, now);
    clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);

    osc.connect(clickGain);
    clickGain.connect(this.gainNode);

    osc.start(now);
    osc.stop(now + 0.04);
  }

  public playMarbleClink(): void {
    if (!this.ctx || !this.gainNode || !this.enabled) return;
    this.ensureRunning();
    const now = this.ctx.currentTime;
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const clinkGain = this.ctx.createGain();

    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(1760, now); // A6
    osc1.frequency.exponentialRampToValueAtTime(1500, now + 0.12);

    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(2637, now); // E7 harmonic
    osc2.frequency.exponentialRampToValueAtTime(2200, now + 0.08);

    clinkGain.gain.setValueAtTime(0.16, now);
    clinkGain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    osc1.connect(clinkGain);
    osc2.connect(clinkGain);
    clinkGain.connect(this.gainNode);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.16);
    osc2.stop(now + 0.16);
  }

  public playJarJiggle(): void {
    if (!this.ctx || !this.gainNode || !this.enabled) return;
    this.ensureRunning();
    const now = this.ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      const delay = i * 0.035;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1400 + i * 200, now + delay);
      gain.gain.setValueAtTime(0.09 - i * 0.02, now + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.06);
      osc.connect(gain);
      gain.connect(this.gainNode);
      osc.start(now + delay);
      osc.stop(now + delay + 0.07);
    }
  }

  public playHighFiveChime(): void {
    if (!this.ctx || !this.gainNode || !this.enabled) return;
    this.ensureRunning();
    const now = this.ctx.currentTime;
    const freqs = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6 arpeggio
    freqs.forEach((freq, idx) => {
      if (!this.ctx || !this.gainNode) return;
      const delay = idx * 0.045;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + delay);
      gain.gain.setValueAtTime(0.14, now + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.22);
      osc.connect(gain);
      gain.connect(this.gainNode);
      osc.start(now + delay);
      osc.stop(now + delay + 0.24);
    });
  }

  public dispose(): void {
    if (this.timer !== null) {
      window.clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.ctx !== null) {
      void this.ctx.close();
      this.ctx = null;
    }
  }
}
