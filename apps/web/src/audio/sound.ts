import { gainFor, isSoundId, type SoundId } from './cues';
import { soundStore } from './settings';

// Every sound is synthesised here with the Web Audio API — no audio files, nothing to
// license (docs/ART_DIRECTION.md › เสียง). Short, soft and cute: taps are ~50 ms, the
// longest effect (the end-of-game fanfare) is under a second.

let ctx: AudioContext | null = null;
let noise: AudioBuffer | null = null;

/**
 * Browsers only allow audio after the player touches the page, so the context is made
 * on the first tap / key press, never before.
 */
function unlock(): void {
  if (typeof AudioContext === 'undefined') return;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    ctx = null; // no audio on this device: the game plays silently
  }
}

/** Plays a sound if the settings allow it. `value` tunes a few sounds (meow card 1–5). */
export function playSound(id: SoundId, value = 3): void {
  const level = gainFor(id, soundStore.get());
  if (level <= 0 || !ctx || ctx.state !== 'running') return;
  try {
    const out = ctx.createGain();
    // Perceived loudness is roughly logarithmic: square the slider so 40% sounds "quiet".
    out.gain.value = level * level * 0.9;
    out.connect(ctx.destination);
    RECIPES[id](new Voice(ctx, out), value);
  } catch {
    // A failed sound must never break the game.
  }
}

/**
 * One listener for every tap in the app: buttons, cards, radios and links click softly;
 * a disabled button (aria-disabled) answers with a gentle "nope". An element can pick
 * its own sound with `data-sound="card"` (or `none`) and `data-sound-value`.
 */
export function installTapSounds(doc: Document = document): () => void {
  const onGesture = () => unlock();
  const onClick = (event: MouseEvent) => {
    const target = event.target instanceof Element ? event.target : null;
    const el = target?.closest<HTMLElement>(
      'button, a[href], [role="button"], [role="radio"], [role="switch"], input[type="range"]',
    );
    if (!el) return;
    const wanted = el.closest<HTMLElement>('[data-sound]')?.dataset;
    if (wanted?.sound === 'none') return;
    if (el.getAttribute('aria-disabled') === 'true') return playSound('nope');
    const id = wanted?.sound && isSoundId(wanted.sound) ? wanted.sound : 'click';
    playSound(id, Number(wanted?.soundValue ?? 3));
  };
  doc.addEventListener('pointerdown', onGesture, true);
  doc.addEventListener('keydown', onGesture, true);
  doc.addEventListener('click', onClick, true);
  return () => {
    doc.removeEventListener('pointerdown', onGesture, true);
    doc.removeEventListener('keydown', onGesture, true);
    doc.removeEventListener('click', onClick, true);
  };
}

// ------------------------------------------------------------------ building blocks

type Wave = OscillatorType;

/** Schedules tones and noise bursts on one output, relative to "now". */
class Voice {
  readonly ctx: AudioContext;
  private readonly out: AudioNode;
  private readonly t0: number;

  constructor(context: AudioContext, out: AudioNode) {
    this.ctx = context;
    this.out = out;
    this.t0 = context.currentTime + 0.005;
  }

  /** A tone gliding from `from` to `to` Hz, with a quick attack and smooth decay. */
  tone(opts: {
    at?: number;
    dur: number;
    from: number;
    to?: number;
    wave?: Wave;
    gain?: number;
    attack?: number;
    through?: AudioNode;
  }): OscillatorNode {
    const { at = 0, dur, from, to = from, wave = 'sine', gain = 0.5, attack = 0.005 } = opts;
    const start = this.t0 + at;
    const osc = this.ctx.createOscillator();
    osc.type = wave;
    osc.frequency.setValueAtTime(from, start);
    if (to !== from) osc.frequency.exponentialRampToValueAtTime(to, start + dur);
    const env = this.envelope(start, dur, gain, attack);
    osc.connect(env);
    env.connect(opts.through ?? this.out);
    osc.start(start);
    osc.stop(start + dur + 0.02);
    return osc;
  }

  /** A bell: a sine plus a quieter overtone, ringing out. */
  bell(at: number, freq: number, dur = 0.5, gain = 0.35): void {
    this.tone({ at, dur, from: freq, gain, attack: 0.003 });
    this.tone({ at, dur: dur * 0.6, from: freq * 2.76, gain: gain * 0.25, attack: 0.003 });
  }

  /** Filtered white noise: rustles, swishes, card flips. */
  noise(opts: {
    at?: number;
    dur: number;
    freq: number;
    toFreq?: number;
    q?: number;
    type?: BiquadFilterType;
    gain?: number;
  }): void {
    const { at = 0, dur, freq, toFreq = freq, q = 1, type = 'bandpass', gain = 0.5 } = opts;
    const start = this.t0 + at;
    const src = this.ctx.createBufferSource();
    src.buffer = noiseBuffer(this.ctx);
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.Q.value = q;
    filter.frequency.setValueAtTime(freq, start);
    if (toFreq !== freq) filter.frequency.exponentialRampToValueAtTime(toFreq, start + dur);
    const env = this.envelope(start, dur, gain, 0.004);
    src.connect(filter).connect(env).connect(this.out);
    src.start(start, Math.random() * 0.5);
    src.stop(start + dur + 0.02);
  }

  /** A filter that later nodes can be routed through (vowel shapes for the meow). */
  filter(type: BiquadFilterType, freq: number, q: number): BiquadFilterNode {
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    f.connect(this.out);
    return f;
  }

  time(at: number): number {
    return this.t0 + at;
  }

  private envelope(start: number, dur: number, gain: number, attack: number): GainNode {
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0001, start);
    env.gain.exponentialRampToValueAtTime(gain, start + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    return env;
  }
}

function noiseBuffer(context: AudioContext): AudioBuffer {
  if (noise && noise.sampleRate === context.sampleRate) return noise;
  const length = context.sampleRate; // 1 s, played from a random offset
  noise = context.createBuffer(1, length, context.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  return noise;
}

/** Note frequencies used below (equal temperament, A4 = 440 Hz). */
const NOTE = {
  C5: 523.25,
  E5: 659.25,
  G5: 783.99,
  A5: 880,
  C6: 1046.5,
  D6: 1174.66,
  E6: 1318.51,
  G6: 1567.98,
  A6: 1760,
} as const;

// ------------------------------------------------------------------ the sounds

const RECIPES: Record<SoundId, (v: Voice, value: number) => void> = {
  // A soft wooden "tok".
  click: (v) => {
    v.tone({ dur: 0.05, from: 1100, to: 700, wave: 'triangle', gain: 0.35 });
  },
  // Disabled button: two low, muffled blips.
  nope: (v) => {
    v.tone({ dur: 0.07, from: 260, to: 230, wave: 'triangle', gain: 0.3 });
    v.tone({ at: 0.09, dur: 0.09, from: 220, to: 180, wave: 'triangle', gain: 0.3 });
  },
  // A card flipping over.
  card: (v) => {
    v.noise({ dur: 0.08, freq: 2500, toFreq: 5000, q: 0.8, gain: 0.45 });
    v.tone({ at: 0.03, dur: 0.04, from: 900, wave: 'triangle', gain: 0.15 });
  },
  // A tiny "mew": higher meow numbers mew higher. A glide through a vowel-like filter.
  meow: (v, value) => {
    const base = 520 + Math.min(5, Math.max(1, value)) * 70;
    const vowel = v.filter('bandpass', 1400, 2.5);
    const t = v.time(0);
    vowel.frequency.setValueAtTime(900, t);
    vowel.frequency.exponentialRampToValueAtTime(2200, t + 0.12);
    vowel.frequency.exponentialRampToValueAtTime(1000, t + 0.3);
    const osc = v.tone({
      dur: 0.32,
      from: base,
      to: base * 0.75,
      wave: 'sawtooth',
      gain: 0.5,
      attack: 0.03,
      through: vowel,
    });
    osc.frequency.setValueAtTime(base, t);
    osc.frequency.exponentialRampToValueAtTime(base * 1.35, t + 0.1);
    osc.frequency.exponentialRampToValueAtTime(base * 0.8, t + 0.32);
  },
  // New round: two lantern bells.
  round: (v) => {
    v.bell(0, NOTE.G5, 0.6);
    v.bell(0.16, NOTE.C6, 0.8);
  },
  // Bids revealed: a little drum hit and a bright pluck.
  reveal: (v) => {
    v.tone({ dur: 0.18, from: 180, to: 70, gain: 0.6 });
    v.bell(0.08, NOTE.E6, 0.4, 0.3);
  },
  // Clash: a wobbly, slightly sour "boing".
  clash: (v) => {
    v.tone({ dur: 0.18, from: 180, to: 70, gain: 0.6 });
    v.tone({ at: 0.06, dur: 0.35, from: 320, to: 200, wave: 'square', gain: 0.12 });
    v.tone({ at: 0.06, dur: 0.35, from: 338, to: 212, wave: 'square', gain: 0.12 });
    v.noise({ at: 0.06, dur: 0.25, freq: 6000, type: 'highpass', gain: 0.15 });
  },
  // Rummaging in the bin: three quick rustles.
  dig: (v) => {
    for (const at of [0, 0.07, 0.15]) {
      v.noise({ at, dur: 0.06, freq: 900, toFreq: 1600, q: 1.2, gain: 0.4 });
    }
  },
  // Guard dog: two gruff barks.
  woof: (v) => {
    for (const at of [0, 0.22]) {
      v.tone({ at, dur: 0.14, from: 230, to: 120, wave: 'square', gain: 0.18 });
      v.tone({ at, dur: 0.12, from: 115, to: 70, wave: 'sawtooth', gain: 0.2 });
      v.noise({ at, dur: 0.1, freq: 700, type: 'lowpass', gain: 0.35 });
    }
  },
  // Caught by the dog: a sad sliding "wah-wah".
  caught: (v) => {
    v.tone({ dur: 0.25, from: 440, to: 400, wave: 'triangle', gain: 0.35 });
    v.tone({ at: 0.28, dur: 0.45, from: 370, to: 250, wave: 'triangle', gain: 0.35 });
  },
  // Bone thrown: a whoosh and a wooden clack.
  bone: (v) => {
    v.noise({ dur: 0.2, freq: 800, toFreq: 3000, q: 0.7, gain: 0.3 });
    v.tone({ at: 0.2, dur: 0.06, from: 900, to: 600, wave: 'triangle', gain: 0.4 });
  },
  // Cards kept in the bag: a soft pop.
  kept: (v) => {
    v.tone({ dur: 0.08, from: 500, to: 900, gain: 0.4 });
  },
  // A meal: "nom" and a coin jingle going up.
  eat: (v) => {
    v.tone({ dur: 0.09, from: 300, to: 220, wave: 'triangle', gain: 0.4 });
    v.tone({ at: 0.11, dur: 0.09, from: 300, to: 220, wave: 'triangle', gain: 0.4 });
    v.bell(0.22, NOTE.C6, 0.3, 0.25);
    v.bell(0.3, NOTE.E6, 0.3, 0.25);
    v.bell(0.38, NOTE.G6, 0.5, 0.25);
  },
  // Turn skipped: a falling blip.
  skip: (v) => {
    v.tone({ dur: 0.18, from: 520, to: 300, wave: 'triangle', gain: 0.3 });
  },
  // Cards discarded: a swish down.
  discard: (v) => {
    v.noise({ dur: 0.22, freq: 4000, toFreq: 800, q: 0.7, gain: 0.35 });
  },
  // Game over: a short happy arpeggio.
  fanfare: (v) => {
    const notes = [NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6];
    notes.forEach((f, i) => {
      v.tone({ at: i * 0.12, dur: i === 3 ? 0.6 : 0.16, from: f, wave: 'triangle', gain: 0.35 });
    });
    v.bell(0.36, NOTE.E6, 0.7, 0.2);
  },
  // Your turn: a gentle rising ding-dong.
  turn: (v) => {
    v.bell(0, NOTE.D6, 0.35, 0.3);
    v.bell(0.12, NOTE.A6, 0.5, 0.3);
  },
  // Timer running out: a dry tick.
  tick: (v) => {
    v.tone({ dur: 0.03, from: 1600, wave: 'square', gain: 0.08 });
  },
  // A sticker arrives: a bubble pop.
  pop: (v) => {
    v.tone({ dur: 0.07, from: 400, to: 1100, gain: 0.4 });
    v.bell(0.05, NOTE.A5, 0.2, 0.12);
  },
};
