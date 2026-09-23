// Seeded, serialisable RNG (mulberry32). The engine never uses Math.random:
// the generator's whole state is one uint32 kept in GameState, so a game can be
// saved, sent over the network and replayed exactly.

export interface Rng {
  /** Float in [0, 1). */
  next(): number;
  /** Integer in [0, maxExclusive). */
  int(maxExclusive: number): number;
  /** New array with the items in random order (Fisher–Yates). */
  shuffle<T>(items: readonly T[]): T[];
  /** Current internal state; feed back into createRng to continue the sequence. */
  readonly state: number;
}

/** FNV-1a hash so any string (e.g. a date "2026-09-23") can be a seed. */
export function hashSeed(seed: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function normalizeSeed(seed: number | string): number {
  return typeof seed === 'string' ? hashSeed(seed) : seed >>> 0;
}

export function createRng(seed: number | string): Rng {
  let a = normalizeSeed(seed);

  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const int = (maxExclusive: number): number => Math.floor(next() * maxExclusive);

  return {
    next,
    int,
    shuffle<T>(items: readonly T[]): T[] {
      const out = items.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = int(i + 1);
        [out[i], out[j]] = [out[j] as T, out[i] as T];
      }
      return out;
    },
    get state() {
      return a;
    },
  };
}
