import type { PowerId } from '@meow/engine';
import { INK, outline } from './style';

// One round badge per cat power (GAME_RULES §14): a bold glyph on a coloured disc, drawn to
// stay readable at 24px. A spent power is shown greyed out by the caller.

const DISC: Record<PowerId, string> = {
  keenNose: 'var(--chicken)',
  secondThought: '#8e7cc3',
  scavenger: 'var(--milk)',
  luckySwap: 'var(--snack)',
  goodLuck: 'var(--gold)',
  extraOrder: 'var(--fish)',
  haggle: 'var(--shrimp)',
  bigAppetite: '#f7a1b5',
};

const thin = { ...outline, strokeWidth: 3.2, fill: 'none' } as const;

function Glyph({ power }: { power: PowerId }) {
  switch (power) {
    case 'keenNose':
      // a pink nose with sniff lines
      return (
        <>
          <path d="M 14 20 L 26 20 L 20 28 Z" fill="#f7a1b5" {...outline} />
          <path d="M 30 16 Q 34 20 30 24" {...thin} />
          <path d="M 34 12 Q 40 20 34 28" {...thin} />
          <path d="M 20 28 L 20 33 M 20 33 Q 16 36 13 33 M 20 33 Q 24 36 27 33" {...thin} />
        </>
      );
    case 'secondThought':
      // two arrows chasing each other: change your mind
      return (
        <>
          <path d="M 13 21 A 11 11 0 0 1 33 17" {...thin} />
          <path d="M 35 11 L 34 18 L 27 17" {...thin} />
          <path d="M 35 27 A 11 11 0 0 1 15 31" {...thin} />
          <path d="M 13 37 L 14 30 L 21 31" {...thin} />
        </>
      );
    case 'scavenger':
      // a big paw print: it grabs from the discard pile
      return (
        <>
          <path
            d="M 24 23 C 31 23 36 30 34 35 C 32 39 27 36 24 36 C 21 36 16 39 14 35 C 12 30 17 23 24 23 Z"
            fill={INK}
          />
          <ellipse cx="13" cy="21" rx="3.4" ry="4.4" fill={INK} transform="rotate(-20 13 21)" />
          <ellipse cx="20" cy="14" rx="3.6" ry="4.8" fill={INK} />
          <ellipse cx="28" cy="14" rx="3.6" ry="4.8" fill={INK} />
          <ellipse cx="35" cy="21" rx="3.4" ry="4.4" fill={INK} transform="rotate(20 35 21)" />
        </>
      );
    case 'luckySwap':
      // a four-leaf clover
      return (
        <>
          {[0, 90, 180, 270].map((deg) => (
            <path
              key={deg}
              d="M 24 23 C 17 20 15 12 20 11 C 22 10 24 12 24 14 C 24 12 26 10 28 11 C 33 12 31 20 24 23 Z"
              fill="#5fa832"
              {...outline}
              strokeWidth={2.4}
              transform={`rotate(${deg} 24 24)`}
            />
          ))}
          <path d="M 25 26 Q 30 34 34 37" {...thin} />
        </>
      );
    case 'goodLuck':
      // a cat bell
      return (
        <>
          <path d="M 18 14 Q 24 10 30 14" {...thin} />
          <circle cx="24" cy="26" r="11" fill="var(--gold)" {...outline} />
          <path d="M 13.5 24 L 34.5 24" {...thin} strokeWidth={2.6} />
          <circle cx="24" cy="30" r="2.4" fill={INK} />
          <path d="M 24 32 L 24 36" {...thin} strokeWidth={2.6} />
        </>
      );
    case 'extraOrder':
      // two cards and a plus
      return (
        <>
          <rect x="10" y="13" width="14" height="19" rx="3" fill="var(--card)" {...outline} />
          <rect x="17" y="17" width="14" height="19" rx="3" fill="var(--card)" {...outline} />
          <path d="M 35 13 L 35 23 M 30 18 L 40 18" {...thin} />
        </>
      );
    case 'haggle':
      // a price tag with an up arrow
      return (
        <>
          <path
            d="M 12 18 L 22 10 L 38 10 L 38 38 L 22 38 L 12 30 Z"
            fill="var(--card)"
            {...outline}
          />
          <circle cx="18" cy="24" r="2.2" fill={INK} />
          <path d="M 30 32 L 30 17 M 25 22 L 30 16 L 35 22" {...thin} />
        </>
      );
    case 'bigAppetite':
      // a heaped bowl
      return (
        <>
          <path d="M 14 22 Q 17 13 24 15 Q 31 13 34 22 Z" fill="var(--chicken)" {...outline} />
          <path d="M 9 22 L 39 22 Q 37 36 24 36 Q 11 36 9 22 Z" fill="var(--card)" {...outline} />
          <path d="M 17 40 L 31 40" {...thin} />
        </>
      );
  }
}

export function PowerIcon({ power, used = false }: { power: PowerId; used?: boolean }) {
  return (
    <svg
      viewBox="0 0 48 48"
      aria-hidden="true"
      className={`h-full w-full ${used ? 'opacity-60 grayscale' : ''}`}
    >
      <circle cx="24" cy="24" r="21.5" fill={DISC[power]} {...outline} />
      <Glyph power={power} />
    </svg>
  );
}
