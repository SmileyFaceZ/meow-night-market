import type { EventId } from '@meow/engine';
import { INK, outline } from './style';

// One square tile per market event (GAME_RULES §15), readable at 24px. The tile colour
// hints at the mood: blue for weather, warm for good luck, purple for tricks.

const TILE: Record<EventId, string> = {
  downpour: '#9ec9ec',
  seafoodFest: 'var(--fish)',
  milkDelivery: 'var(--milk)',
  garbageTruck: '#aeb7c2',
  blackout: '#5d4f8f',
  kindVendor: '#f7a1b5',
  bargainRush: 'var(--snack)',
  sleepyDogs: '#c3b4ec',
  gustyWind: '#bfe6dc',
  queueFlip: 'var(--chicken)',
  busyNight: 'var(--lantern)',
  fullMoon: '#27418a',
  snackSale: 'var(--snack)',
};

const thin = { ...outline, strokeWidth: 3.2, fill: 'none' } as const;

function Glyph({ event }: { event: EventId }) {
  switch (event) {
    case 'downpour':
      return (
        <>
          <path
            d="M 13 26 Q 8 26 9 20 Q 10 15 16 16 Q 18 9 26 10 Q 33 11 34 17 Q 40 17 40 22 Q 40 26 35 26 Z"
            fill="var(--card)"
            {...outline}
          />
          <path d="M 16 31 L 14 37 M 24 31 L 22 37 M 32 31 L 30 37" {...thin} stroke="#2b6fb3" />
        </>
      );
    case 'seafoodFest':
      // a curled shrimp
      return (
        <>
          <path
            d="M 34 14 Q 40 28 28 36 Q 18 40 12 32 Q 20 34 25 29 Q 30 22 26 15 Z"
            fill="var(--shrimp)"
            {...outline}
          />
          <path d="M 26 15 L 20 10 M 28 14 L 25 8" {...thin} strokeWidth={2.4} />
          <circle cx="31" cy="18" r="1.8" fill={INK} />
        </>
      );
    case 'milkDelivery':
      return (
        <>
          <path
            d="M 19 8 L 29 8 L 29 14 L 33 20 L 33 39 L 15 39 L 15 20 L 19 14 Z"
            fill="var(--card)"
            {...outline}
          />
          <path d="M 15 26 L 33 26" {...thin} strokeWidth={2.4} />
          <path
            d="M 19 8 L 29 8 L 29 12 L 19 12 Z"
            fill="var(--fish)"
            {...outline}
            strokeWidth={2.4}
          />
        </>
      );
    case 'garbageTruck':
      return (
        <>
          <path d="M 7 16 L 29 16 L 29 33 L 7 33 Z" fill="var(--snack)" {...outline} />
          <path d="M 29 21 L 37 21 L 41 27 L 41 33 L 29 33 Z" fill="var(--card)" {...outline} />
          <circle cx="15" cy="35" r="4" fill={INK} />
          <circle cx="34" cy="35" r="4" fill={INK} />
          <path d="M 12 21 L 12 28 M 18 21 L 18 28 M 24 21 L 24 28" {...thin} strokeWidth={2.2} />
        </>
      );
    case 'blackout':
      // a bulb with a cross
      return (
        <>
          <path
            d="M 24 8 Q 35 8 35 19 Q 35 25 30 29 L 30 33 L 18 33 L 18 29 Q 13 25 13 19 Q 13 8 24 8 Z"
            fill="#7a7a8c"
            {...outline}
          />
          <path d="M 19 37 L 29 37" {...thin} />
          <path d="M 19 15 L 29 25 M 29 15 L 19 25" {...thin} stroke="var(--card)" />
        </>
      );
    case 'kindVendor':
      // a gift with a heart
      return (
        <>
          <rect x="10" y="20" width="28" height="19" rx="2" fill="var(--card)" {...outline} />
          <path d="M 24 20 L 24 39" {...thin} />
          <path
            d="M 24 17 C 20 10 12 12 15 17 C 17 20 22 19 24 17 C 26 19 31 20 33 17 C 36 12 28 10 24 17 Z"
            fill="var(--shrimp)"
            {...outline}
            strokeWidth={2.4}
          />
        </>
      );
    case 'bargainRush':
      // a tag with a plus
      return (
        <>
          <path d="M 10 22 L 24 8 L 40 8 L 40 24 L 26 38 Z" fill="var(--card)" {...outline} />
          <circle cx="33" cy="15" r="2.4" fill={INK} />
          <path d="M 25 18 L 25 30 M 19 24 L 31 24" {...thin} />
        </>
      );
    case 'sleepyDogs':
      // closed eyes and Zzz
      return (
        <>
          <path d="M 10 30 Q 14 34 18 30 M 24 30 Q 28 34 32 30" {...thin} />
          <path
            d="M 26 10 L 34 10 L 26 18 L 34 18 M 36 20 L 41 20 L 36 25 L 41 25"
            {...thin}
            strokeWidth={2.6}
          />
        </>
      );
    case 'gustyWind':
      return (
        <>
          <path d="M 8 18 L 28 18 Q 34 18 34 13 Q 34 9 30 9 Q 26 9 26 13" {...thin} />
          <path d="M 8 26 L 36 26 Q 41 26 41 31 Q 41 36 36 36 Q 32 36 32 32" {...thin} />
          <path d="M 8 34 L 22 34" {...thin} />
        </>
      );
    case 'queueFlip':
      // an up and a down arrow
      return (
        <>
          <path d="M 17 38 L 17 11 M 10 18 L 17 10 L 24 18" {...thin} />
          <path d="M 31 10 L 31 37 M 24 30 L 31 38 L 38 30" {...thin} />
        </>
      );
    case 'busyNight':
      // a paper lantern
      return (
        <>
          <path d="M 24 5 L 24 10" {...thin} />
          <ellipse cx="24" cy="23" rx="12" ry="13" fill="var(--shrimp)" {...outline} />
          <path d="M 18 11 L 30 11 M 18 35 L 30 35" {...thin} />
          <path
            d="M 24 10 L 24 36 M 16 16 Q 13 23 16 30 M 32 16 Q 35 23 32 30"
            {...thin}
            strokeWidth={2.2}
          />
          <path d="M 24 36 L 24 42" {...thin} strokeWidth={2.4} />
        </>
      );
    case 'fullMoon':
      return (
        <>
          <circle cx="24" cy="24" r="14" fill="var(--gold)" {...outline} />
          <circle cx="19" cy="20" r="2.6" fill="#e9b92c" />
          <circle cx="28" cy="28" r="3.4" fill="#e9b92c" />
          <circle cx="29" cy="17" r="1.8" fill="#e9b92c" />
        </>
      );
    case 'snackSale':
      // dango on a stick
      return (
        <>
          <path d="M 12 40 L 36 10" {...thin} />
          {[
            [18, 32, '#f7a1b5'],
            [24, 24, 'var(--card)'],
            [30, 16, 'var(--snack)'],
          ].map(([x, y, fill]) => (
            <circle key={String(x)} cx={x} cy={y} r="6" fill={String(fill)} {...outline} />
          ))}
        </>
      );
  }
}

export function EventIcon({ event }: { event: EventId }) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className="h-full w-full">
      <rect x="2" y="2" width="44" height="44" rx="11" fill={TILE[event]} {...outline} />
      <Glyph event={event} />
    </svg>
  );
}
