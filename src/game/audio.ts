import type { ReloadCueKind } from './reloads';

class SoundEngine {
  private ctx: AudioContext | null = null;
  private comp: DynamicsCompressorNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private masterVolume = 0.75;

  setVolume(vol: number): void {
    this.masterVolume = Math.max(0, Math.min(1, vol));
  }

  unlock(): AudioContext | null {
    if (!this.ctx && typeof window !== 'undefined') {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctor) {
        try {
          this.ctx = new Ctor();
        } catch {
          return null;
        }
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    if (this.ctx && !this.comp) {
      try {
        const comp = this.ctx.createDynamicsCompressor();
        comp.threshold.value = -14;
        comp.knee.value = 12;
        comp.ratio.value = 6;
        comp.attack.value = 0.002;
        comp.release.value = 0.14;
        comp.connect(this.ctx.destination);
        this.comp = comp;
      } catch {
        this.comp = null;
      }
    }
    return this.ctx;
  }

  private getDest(a: AudioContext): AudioNode {
    return this.comp ?? a.destination;
  }

  private getNoiseBuffer(a: AudioContext): AudioBuffer {
    if (this.noiseBuf && this.noiseBuf.sampleRate === a.sampleRate) {
      return this.noiseBuf;
    }
    const len = Math.floor(a.sampleRate * 1.5);
    const buf = a.createBuffer(1, len, a.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    this.noiseBuf = buf;
    return buf;
  }

  private layerNoise(
    a: AudioContext,
    dur: number,
    cutoffHz: number,
    vol: number,
    filterType: BiquadFilterType = 'lowpass',
    q = 0.9,
    delaySec = 0,
  ): void {
    const v = vol * this.masterVolume;
    if (v < 0.003) return;
    const t0 = a.currentTime + delaySec;
    const src = a.createBufferSource();
    src.buffer = this.getNoiseBuffer(a);
    src.loop = true;
    const offset = Math.random() * 0.9;

    const flt = a.createBiquadFilter();
    flt.type = filterType;
    flt.frequency.setValueAtTime(cutoffHz, t0);
    flt.Q.setValueAtTime(q, t0);

    const gain = a.createGain();
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(v, t0 + Math.min(0.004, dur * 0.2));
    gain.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);

    src.connect(flt);
    flt.connect(gain);
    gain.connect(this.getDest(a));
    src.start(t0, offset, dur + 0.02);
  }

  private layerTone(
    a: AudioContext,
    freqStart: number,
    freqEnd: number,
    dur: number,
    vol: number,
    type: OscillatorType = 'sine',
    delaySec = 0,
  ): void {
    const v = vol * this.masterVolume;
    if (v < 0.003) return;
    const t0 = a.currentTime + delaySec;
    const osc = a.createOscillator();
    const gain = a.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t0 + dur);
    gain.gain.setValueAtTime(v, t0);
    gain.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
    osc.connect(gain);
    gain.connect(this.getDest(a));
    osc.start(t0);
    osc.stop(t0 + dur + 0.01);
  }

  noise(
    dur: number,
    cutoffHz: number,
    vol: number,
    filterType: BiquadFilterType = 'lowpass',
    q = 0.9,
    delaySec = 0,
  ): void {
    const a = this.unlock();
    if (!a) return;
    this.layerNoise(a, dur, cutoffHz, vol, filterType, q, delaySec);
  }

  tone(
    freqStart: number,
    freqEnd: number,
    dur: number,
    vol: number,
    type: OscillatorType = 'sine',
    delaySec = 0,
  ): void {
    const a = this.unlock();
    if (!a) return;
    this.layerTone(a, freqStart, freqEnd, dur, vol, type, delaySec);
  }

  private playShellClink(pitchScale = 1): void {
    const a = this.unlock();
    if (!a || this.masterVolume < 0.05) return;
    const d = 0.16 + Math.random() * 0.09;
    const f = (4100 + Math.random() * 900) * pitchScale;
    this.layerTone(a, f, f * 0.88, 0.032, 0.04, 'sine', d);
    this.layerTone(a, f * 1.18, f * 0.96, 0.025, 0.028, 'sine', d + 0.048);
  }

  shot(weaponOrType: 0 | 1 | 2 | string, distanceGain = 1, isLocal = false): void {
    const a = this.unlock();
    if (!a) return;
    const g = Math.max(0.06, Math.min(1, distanceGain));
    const tailScale = 0.65 + 0.35 * g;

    switch (weaponOrType) {
      case 'AK47': {
        // Heavy 7.62x39 bark: deep chest punch + gritty midrange crack + steel bolt clack + desert tail
        this.layerTone(a, 148, 36, 0.13, 0.56 * g, 'sawtooth');
        this.layerTone(a, 240, 62, 0.055, 0.32 * g, 'triangle');
        this.layerNoise(a, 0.075, 2450, 0.48 * g, 'bandpass', 1.1);
        this.layerNoise(a, 0.028, 4600, 0.28 * g, 'highpass', 0.8);
        this.layerNoise(a, 0.26 * tailScale, 1100, 0.34 * g, 'lowpass', 0.7, 0.015);
        if (isLocal) this.playShellClink(0.92);
        return;
      }

      case 'DesertEagle': {
        // .50 AE Hand Cannon: massive concussion thump + crisp steel slide slap + long echo tail
        this.layerTone(a, 168, 30, 0.19, 0.68 * g, 'triangle');
        this.layerTone(a, 290, 48, 0.11, 0.36 * g, 'sawtooth');
        this.layerNoise(a, 0.09, 3100, 0.56 * g, 'bandpass', 1.0);
        this.layerNoise(a, 0.035, 5200, 0.34 * g, 'highpass', 0.9);
        this.layerNoise(a, 0.38 * tailScale, 920, 0.42 * g, 'lowpass', 0.65, 0.02);
        if (isLocal) this.playShellClink(0.84);
        return;
      }

      case 'G36C': {
        // 5.56mm NATO: fast supersonic whip-crack + controlled polymer pulse + crisp cycling click
        this.layerTone(a, 192, 54, 0.095, 0.44 * g, 'triangle');
        this.layerNoise(a, 0.06, 2850, 0.46 * g, 'bandpass', 1.35);
        this.layerNoise(a, 0.024, 4900, 0.26 * g, 'highpass', 0.8);
        this.layerNoise(a, 0.19 * tailScale, 1380, 0.27 * g, 'lowpass', 0.8, 0.01);
        if (isLocal) this.playShellClink(1.06);
        return;
      }

      case 'M1911': {
        // .45 ACP Classic: warm low punch + crisp dry slide snap
        this.layerTone(a, 178, 48, 0.11, 0.52 * g, 'triangle');
        this.layerTone(a, 340, 110, 0.038, 0.24 * g, 'square');
        this.layerNoise(a, 0.065, 2250, 0.42 * g, 'bandpass', 1.15);
        this.layerNoise(a, 0.17 * tailScale, 1250, 0.26 * g, 'lowpass', 0.75, 0.012);
        if (isLocal) this.playShellClink(0.95);
        return;
      }

      case 'MP5': {
        // 9mm Roller-Delayed Subgun: punchy, tight rhythmic bark optimized for 800 RPM sprays
        this.layerTone(a, 215, 68, 0.075, 0.4 * g, 'triangle');
        this.layerNoise(a, 0.052, 1950, 0.38 * g, 'bandpass', 1.45);
        this.layerNoise(a, 0.022, 3800, 0.2 * g, 'bandpass', 1.2);
        this.layerNoise(a, 0.13 * tailScale, 1100, 0.2 * g, 'lowpass', 0.8, 0.008);
        if (isLocal) this.playShellClink(1.16);
        return;
      }

      case 'P90': {
        // 5.7x28mm Bullpup: razor-sharp high-velocity crack + rapid polymer snap
        this.layerTone(a, 240, 82, 0.065, 0.36 * g, 'triangle');
        this.layerNoise(a, 0.048, 3400, 0.42 * g, 'bandpass', 1.2);
        this.layerNoise(a, 0.02, 5400, 0.24 * g, 'highpass', 0.85);
        this.layerNoise(a, 0.14 * tailScale, 1650, 0.2 * g, 'lowpass', 0.8, 0.008);
        if (isLocal) this.playShellClink(1.25);
        return;
      }

      case 'SCAR-H': {
        // 7.62x51mm Battle Rifle: thunderous chest kick + aggressive mid roar + heavy bolt cycle + long echo
        this.layerTone(a, 124, 29, 0.17, 0.65 * g, 'sawtooth');
        this.layerTone(a, 210, 44, 0.09, 0.34 * g, 'triangle');
        this.layerNoise(a, 0.088, 1750, 0.52 * g, 'bandpass', 1.0);
        this.layerNoise(a, 0.032, 4200, 0.29 * g, 'highpass', 0.85);
        this.layerNoise(a, 0.34 * tailScale, 860, 0.4 * g, 'lowpass', 0.65, 0.018);
        if (isLocal) this.playShellClink(0.86);
        return;
      }

      default: {
        const idx = typeof weaponOrType === 'number' ? weaponOrType : 0;
        const cutoff = [2350, 3200, 1950][idx] ?? 2350;
        const f0 = [145, 175, 125][idx] ?? 145;
        this.layerNoise(a, 0.18, cutoff, 0.45 * g, 'lowpass');
        this.layerTone(a, f0, 42, 0.14, 0.45 * g, 'triangle');
      }
    }
  }

  dryFire(): void {
    this.noise(0.025, 3800, 0.14, 'bandpass', 2.2);
    this.tone(1450, 820, 0.024, 0.11, 'square');
  }

  swap(): void {
    this.noise(0.075, 2900, 0.14, 'bandpass', 1.2);
    this.tone(420, 610, 0.045, 0.08, 'triangle');
  }

  reloadCue(stage: ReloadCueKind): void {
    switch (stage) {
      case 'none':
        return;
      case 'ak_out':
        this.noise(0.07, 2200, 0.2, 'bandpass', 1.3);
        this.tone(410, 210, 0.06, 0.13, 'triangle');
        return;
      case 'ak_rock_in':
        this.noise(0.09, 1450, 0.28, 'bandpass', 1.1);
        this.tone(240, 480, 0.075, 0.18, 'triangle');
        this.tone(680, 920, 0.04, 0.1, 'square', 0.04);
        return;
      case 'ak_rack':
        this.noise(0.085, 3100, 0.24, 'bandpass', 1.2);
        this.tone(540, 790, 0.055, 0.14, 'square');
        this.noise(0.07, 3600, 0.26, 'bandpass', 1.4, 0.1);
        this.tone(760, 480, 0.055, 0.16, 'triangle', 0.1);
        return;
      case 'pistol_drop':
        this.noise(0.05, 3100, 0.17, 'bandpass', 1.5);
        this.tone(720, 360, 0.048, 0.11, 'triangle');
        return;
      case 'deagle_slam':
        this.noise(0.095, 1450, 0.3, 'lowpass', 0.9);
        this.tone(195, 390, 0.08, 0.2, 'triangle');
        this.tone(620, 880, 0.04, 0.11, 'square', 0.035);
        return;
      case 'deagle_slide':
        this.noise(0.09, 3700, 0.28, 'bandpass', 1.3);
        this.tone(820, 1240, 0.065, 0.17, 'square');
        this.tone(290, 140, 0.06, 0.14, 'triangle', 0.025);
        return;
      case 'paddle_drop':
        this.noise(0.055, 2550, 0.16, 'bandpass', 1.4);
        this.tone(510, 300, 0.048, 0.1, 'triangle');
        return;
      case 'mag_click':
        this.noise(0.075, 2050, 0.23, 'bandpass', 1.3);
        this.tone(390, 620, 0.055, 0.15, 'triangle');
        return;
      case 'mag_tap':
        this.noise(0.06, 950, 0.24, 'lowpass', 0.9);
        this.tone(190, 105, 0.055, 0.17, 'sine');
        return;
      case 'g36_bolt':
        this.noise(0.08, 3450, 0.23, 'bandpass', 1.3);
        this.tone(660, 990, 0.055, 0.14, 'square');
        this.noise(0.05, 3900, 0.19, 'bandpass', 1.5, 0.075);
        return;
      case 'pistol_seat':
        this.noise(0.055, 2300, 0.21, 'bandpass', 1.3);
        this.tone(460, 720, 0.048, 0.14, 'triangle');
        return;
      case 'slide_stop':
        this.noise(0.065, 3900, 0.22, 'bandpass', 1.4);
        this.tone(880, 1340, 0.045, 0.13, 'triangle');
        return;
      case 'smg_out':
        this.noise(0.055, 2750, 0.16, 'bandpass', 1.4);
        this.tone(540, 320, 0.048, 0.11, 'triangle');
        return;
      case 'smg_in':
        this.noise(0.07, 2150, 0.22, 'bandpass', 1.3);
        this.tone(410, 660, 0.052, 0.14, 'triangle');
        return;
      case 'hk_lock':
        this.noise(0.065, 3150, 0.2, 'bandpass', 1.4);
        this.tone(690, 910, 0.05, 0.13, 'square');
        return;
      case 'hk_slap':
        this.noise(0.11, 1850, 0.34, 'lowpass', 0.9);
        this.tone(460, 165, 0.09, 0.22, 'sawtooth');
        this.noise(0.055, 3800, 0.2, 'bandpass', 1.5, 0.025);
        return;
      case 'p90_out':
        this.noise(0.075, 1950, 0.19, 'bandpass', 1.2);
        this.tone(480, 290, 0.065, 0.12, 'triangle');
        return;
      case 'p90_seat':
        this.noise(0.08, 1550, 0.22, 'bandpass', 1.2);
        this.tone(330, 510, 0.06, 0.14, 'triangle');
        return;
      case 'p90_smack':
        this.noise(0.09, 1150, 0.3, 'lowpass', 0.9);
        this.tone(270, 125, 0.075, 0.2, 'triangle');
        return;
      case 'smg_rack':
        this.noise(0.075, 3350, 0.23, 'bandpass', 1.3);
        this.tone(740, 1020, 0.055, 0.13, 'square');
        return;
      case 'heavy_out':
        this.noise(0.075, 1900, 0.21, 'bandpass', 1.2);
        this.tone(320, 180, 0.065, 0.14, 'triangle');
        return;
      case 'heavy_in':
        this.noise(0.095, 1300, 0.29, 'bandpass', 1.0);
        this.tone(220, 410, 0.085, 0.19, 'triangle');
        return;
      case 'bolt_catch':
        this.noise(0.07, 3600, 0.27, 'bandpass', 1.3);
        this.tone(960, 1380, 0.05, 0.16, 'square');
        this.tone(240, 110, 0.05, 0.12, 'triangle', 0.02);
        return;
    }
  }

  hitmarker(headshot: boolean): void {
    if (headshot) {
      this.tone(1680, 1180, 0.075, 0.25, 'triangle');
      this.tone(2350, 1900, 0.05, 0.15, 'sine', 0.02);
    } else {
      this.tone(1160, 760, 0.055, 0.19, 'square');
    }
  }

  footstep(): void {
    this.noise(0.05, 510, 0.085, 'lowpass');
  }

  slide(): void {
    this.noise(0.45, 740, 0.24, 'bandpass');
  }

  death(): void {
    this.tone(210, 52, 0.38, 0.42, 'sawtooth');
  }

  grenadeThrow(): void {
    this.noise(0.05, 3400, 0.16, 'bandpass');
    this.tone(520, 260, 0.09, 0.14, 'triangle');
  }

  explosion(distanceGain = 1): void {
    const g = Math.max(0.12, Math.min(1, distanceGain));
    this.noise(0.68, 620, 0.78 * g, 'lowpass');
    this.noise(0.34, 1850, 0.38 * g, 'bandpass');
    this.tone(115, 26, 0.5, 0.62 * g, 'sawtooth');
  }

  private lastRemoteStepMs = 0;

  remoteFootstep(distanceGain: number): void {
    const g = Math.max(0, Math.min(0.85, distanceGain));
    if (g < 0.05) return;
    const now = performance.now();
    if (now - this.lastRemoteStepMs < 210) return;
    this.lastRemoteStepMs = now;
    this.noise(0.045, 540, 0.09 * g, 'lowpass');
  }

  killCallout(headshot: boolean): void {
    if (headshot) {
      this.tone(920, 1380, 0.11, 0.18, 'triangle');
    } else {
      this.tone(660, 880, 0.08, 0.12, 'triangle');
    }
  }

  wallImpact(distanceGain = 1): void {
    const g = Math.max(0.06, Math.min(1, distanceGain));
    this.noise(0.06, 1750, 0.16 * g, 'bandpass');
    this.tone(1850, 740, 0.045, 0.06 * g, 'triangle');
  }

  magClatter(): void {
    this.noise(0.06, 2250, 0.14, 'bandpass', 1.4);
    this.tone(540, 280, 0.06, 0.095, 'triangle');
    this.tone(640, 390, 0.035, 0.05, 'triangle', 0.075);
  }

  grenadeBounce(distanceGain = 1): void {
    const g = Math.max(0.08, Math.min(1, distanceGain));
    this.noise(0.045, 780, 0.15 * g, 'lowpass');
    this.tone(175, 92, 0.05, 0.11 * g, 'triangle');
  }

  reloadComplete(): void {
    this.tone(980, 1280, 0.045, 0.08, 'triangle');
  }
}

export const soundEngine = new SoundEngine();
