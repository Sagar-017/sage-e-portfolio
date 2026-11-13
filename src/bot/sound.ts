/**
 * SAGE-E's sound kit, synthesised live with Web Audio (no audio files).
 *
 *  - voice(): a "radio-chirp" robot voice — short gliding syllables through a narrow,
 *    slightly distorted radio band, with bursts of tuning static between them.
 *  - servo()/step()/whir(): motor whine, metal clanks and creaks for his moving parts.
 *
 * Sound is OFF until the visitor turns it on (and browsers need that click anyway).
 */

export type VoiceKind = 'chatter' | 'happy' | 'sad' | 'angry' | 'startled' | 'yawn' | 'question' | 'giggle';

type Listener = () => void;
const KEY = 'sage-e-sound';
const r = (a: number, b: number) => a + Math.random() * (b - a);

interface Syl { dur: number; gap: number; f0: number; f1: number; form0: number; form1: number; buzz?: boolean }

function plan(kind: VoiceKind): Syl[] {
  const out: Syl[] = [];
  const syl = (f0: number, f1: number, dur: number, gap = r(0.02, 0.06), buzz = false) =>
    out.push({ f0, f1, dur, gap, form0: r(900, 2000), form1: r(800, 2400), buzz });
  switch (kind) {
    case 'happy': {
      const n = Math.round(r(4, 6));
      for (let i = 0; i < n - 1; i++) { const f = 420 * (1 + i * 0.12) * r(0.9, 1.1); syl(f, f * r(1.1, 1.4), r(0.06, 0.11)); }
      syl(620, 1150, 0.22, 0);
      break;
    }
    case 'question': {
      for (let i = 0; i < 3; i++) { const f = r(340, 520); syl(f, f * r(0.8, 1.2), r(0.07, 0.12)); }
      syl(420, 820, 0.24, 0);
      break;
    }
    case 'sad':
      for (let i = 0; i < 3; i++) { const f = 520 - i * 70; syl(f, f * 0.6, r(0.18, 0.28), r(0.05, 0.09)); }
      break;
    case 'angry':
      for (let i = 0; i < Math.round(r(4, 5)); i++) { const f = r(150, 220); syl(f, f * r(0.8, 0.95), r(0.07, 0.12), r(0.02, 0.04), true); }
      break;
    case 'startled':
      syl(700, 1700, 0.18, 0.03);
      syl(1400, 1500, 0.05, 0.03);
      syl(1500, 1300, 0.06, 0);
      break;
    case 'yawn':
      out.push({ f0: 520, f1: 170, dur: 1.1, gap: 0.08, form0: 1900, form1: 450 });
      out.push({ f0: 200, f1: 180, dur: 0.22, gap: 0, form0: 600, form1: 500 });
      break;
    case 'giggle':
      for (let i = 0; i < 5; i++) { const f = 950 * (1 - i * 0.06); syl(f, f * 0.85, 0.055, 0.04); }
      break;
    default: {
      const n = Math.round(r(3, 6)), base = r(340, 520);
      for (let i = 0; i < n; i++) { const f = base * r(0.8, 1.4); syl(f, f * r(0.7, 1.4), r(0.07, 0.15)); }
    }
  }
  return out;
}

class Sfx {
  muted = true;
  private ctx: AudioContext | null = null;
  private out!: GainNode;
  private radio!: AudioNode;
  private noiseBuf: AudioBuffer | null = null;
  private listeners = new Set<Listener>();
  private voiceUntil = 0;
  private lastStep = 0;
  private servoGain: GainNode | null = null;
  private servoOsc: OscillatorNode | null = null;
  private whineOsc: OscillatorNode | null = null;

  constructor() {
    try { this.muted = localStorage.getItem(KEY) !== '0'; } catch { /* private mode */ }
    // An AudioContext can only start after a user gesture; resume on the first one.
    const unlock = () => { if (!this.muted) this.ac(); };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
  }

  subscribe = (l: Listener) => { this.listeners.add(l); return () => { this.listeners.delete(l); }; };
  getMuted = () => this.muted;

  setMuted(m: boolean) {
    this.muted = m;
    try { localStorage.setItem(KEY, m ? '1' : '0'); } catch { /* ignore */ }
    if (m) this.servo(false);
    else this.ac();
    this.listeners.forEach((l) => l());
  }

  private ac() {
    if (this.muted) return null;
    if (!this.ctx) {
      try {
        const C = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const c = new C();
        const comp = c.createDynamicsCompressor();
        this.out = c.createGain();
        this.out.gain.value = 0.55;
        this.out.connect(comp).connect(c.destination);
        // the "radio" band every voice syllable passes through
        const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 280;
        const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3600;
        const shaper = c.createWaveShaper();
        const curve = new Float32Array(256);
        for (let i = 0; i < 256; i++) { const x = (i / 128) - 1; curve[i] = Math.tanh(x * 2.4); }
        shaper.curve = curve;
        hp.connect(shaper).connect(lp).connect(this.out);
        this.radio = hp;
        this.ctx = c;
      } catch { return null; }
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  private noise(c: AudioContext) {
    if (!this.noiseBuf) {
      this.noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const n = c.createBufferSource();
    n.buffer = this.noiseBuf;
    return n;
  }

  /** A short burst of filtered noise (static, clanks, scuffs). */
  private burst(c: AudioContext, t: number, dur: number, freq: number, q: number, gain: number, dest: AudioNode = this.out) {
    const n = this.noise(c);
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(f).connect(g).connect(dest);
    n.start(t, Math.random() * 0.5, dur + 0.02);
  }

  private tone(c: AudioContext, t: number, type: OscillatorType, f0: number, f1: number, dur: number, gain: number, dest: AudioNode = this.out) {
    const o = c.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest);
    o.start(t); o.stop(t + dur + 0.02);
  }

  /** Robot "radio" voice. Skipped while another line is still playing unless forced. */
  voice(kind: VoiceKind = 'chatter', force = false) {
    const c = this.ac();
    if (!c) return;
    const now = c.currentTime;
    if (!force && now < this.voiceUntil - 0.05) return;
    let t = now + 0.02;
    if (Math.random() < 0.4) { // tuning-dial sweep before speaking
      this.tone(c, t, 'sine', r(1600, 2200), r(350, 500), 0.12, 0.05, this.radio);
      this.burst(c, t, 0.08, 2400, 1.2, 0.12, this.radio);
      t += 0.1;
    }
    for (const s of plan(kind)) {
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.5, t + 0.012);
      g.gain.setValueAtTime(0.5, t + s.dur * 0.7);
      g.gain.exponentialRampToValueAtTime(0.0001, t + s.dur);
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 4;
      bp.frequency.setValueAtTime(s.form0, t);
      bp.frequency.linearRampToValueAtTime(s.form1, t + s.dur);
      bp.connect(g).connect(this.radio);
      const lfo = c.createOscillator(); lfo.frequency.value = s.buzz ? 55 : 28;
      const lfoG = c.createGain(); lfoG.gain.value = s.f0 * (s.buzz ? 0.15 : 0.05);
      lfo.connect(lfoG);
      for (const [type, mul] of [['sawtooth', 1], [s.buzz ? 'square' : 'triangle', 2.01]] as const) {
        const o = c.createOscillator(); o.type = type;
        o.frequency.setValueAtTime(s.f0 * mul, t);
        o.frequency.exponentialRampToValueAtTime(s.f1 * mul, t + s.dur);
        lfoG.connect(o.frequency);
        o.connect(bp);
        o.start(t); o.stop(t + s.dur + 0.03);
      }
      lfo.start(t); lfo.stop(t + s.dur + 0.03);
      if (Math.random() < 0.3) this.burst(c, t + s.dur, 0.04, r(1800, 3000), 1.5, 0.1, this.radio);
      t += s.dur + s.gap;
    }
    this.voiceUntil = t;
  }

  /** Motor hum + whine while walking or climbing. */
  servo(on: boolean, rate = 1) {
    const c = on ? this.ac() : this.ctx;
    if (!c) return;
    if (!this.servoGain) {
      if (!on) return;
      this.servoGain = c.createGain(); this.servoGain.gain.value = 0;
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520;
      this.servoOsc = c.createOscillator(); this.servoOsc.type = 'sawtooth'; this.servoOsc.frequency.value = 70;
      this.servoOsc.connect(lp).connect(this.servoGain);
      this.whineOsc = c.createOscillator(); this.whineOsc.type = 'sine'; this.whineOsc.frequency.value = 1000;
      const wg = c.createGain(); wg.gain.value = 0.18;
      const trem = c.createOscillator(); trem.frequency.value = 9;
      const tg = c.createGain(); tg.gain.value = 0.12;
      trem.connect(tg).connect(wg.gain);
      this.whineOsc.connect(wg).connect(this.servoGain);
      this.servoGain.connect(this.out);
      this.servoOsc.start(); this.whineOsc.start(); trem.start();
    }
    const t = c.currentTime;
    this.servoGain.gain.setTargetAtTime(on && !this.muted ? 0.11 : 0, t, 0.06);
    if (on) {
      this.servoOsc!.frequency.setTargetAtTime(60 + 30 * rate, t, 0.1);
      this.whineOsc!.frequency.setTargetAtTime(850 + 350 * rate, t, 0.1);
    }
  }

  /** A footstep: clank of metal, little thump, the odd creak. */
  step() {
    const c = this.ac();
    if (!c) return;
    const now = c.currentTime;
    if (now - this.lastStep < 0.09) return;
    this.lastStep = now;
    const t = now + 0.005;
    this.burst(c, t, 0.05, r(2800, 3600), 6, 0.16);
    this.tone(c, t, 'sine', r(500, 560), 480, 0.1, 0.035);
    this.tone(c, t, 'sine', r(1250, 1350), 1200, 0.07, 0.02);
    this.tone(c, t, 'sine', 120, 55, 0.07, 0.18);
    if (Math.random() < 0.18) this.tone(c, t + 0.03, 'sawtooth', r(180, 240), r(260, 320), 0.14, 0.025); // creak
  }

  /** Servo sweep for arm/body motions. */
  whir(dur = 0.4) {
    const c = this.ac();
    if (!c) return;
    const t = c.currentTime + 0.01;
    const o = c.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(r(260, 320), t);
    o.frequency.linearRampToValueAtTime(r(800, 1000), t + dur * 0.5);
    o.frequency.linearRampToValueAtTime(r(450, 550), t + dur);
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 2.5;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.07, t + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f).connect(g).connect(this.out);
    o.start(t); o.stop(t + dur + 0.02);
  }

  boing() {
    const c = this.ac();
    if (!c) return;
    const t = c.currentTime + 0.01;
    const o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(260, t);
    o.frequency.exponentialRampToValueAtTime(720, t + 0.09);
    o.frequency.exponentialRampToValueAtTime(330, t + 0.28);
    const g = c.createGain();
    g.gain.setValueAtTime(0.25, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.connect(g).connect(this.out);
    o.start(t); o.stop(t + 0.32);
  }

  thud() {
    const c = this.ac();
    if (!c) return;
    const t = c.currentTime + 0.01;
    this.tone(c, t, 'sine', 140, 38, 0.35, 0.6);
    this.burst(c, t, 0.25, 400, 0.7, 0.4);
    this.burst(c, t + 0.02, 0.12, 3200, 5, 0.18);
    this.tone(c, t + 0.06, 'sine', 610, 590, 0.25, 0.03);
  }
}

export const sfx = new Sfx();
