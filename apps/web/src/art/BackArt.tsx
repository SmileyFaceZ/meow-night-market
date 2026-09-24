import { INK, outline } from './style';

/** Market deck back: red-and-white striped stall canvas. */
export function MarketBackArt() {
  return (
    <svg
      viewBox="0 0 50 70"
      preserveAspectRatio="none"
      aria-hidden="true"
      className="h-full w-full"
    >
      <rect width="50" height="70" fill="#FFF6E9" />
      {[0, 1, 2, 3, 4].map((i) => (
        <rect key={i} x={i * 10} y="0" width="5" height="70" fill="var(--shrimp)" />
      ))}
      <path
        d="M 0 16 Q 6 24 12.5 16 Q 19 24 25 16 Q 31 24 37.5 16 Q 44 24 50 16 L 50 0 L 0 0 Z"
        fill="var(--lantern)"
        stroke={INK}
        strokeWidth={1.5}
      />
    </svg>
  );
}

/** Trash deck back: a tin bin with a cat tail peeking out. */
export function TrashBackArt() {
  return (
    <svg viewBox="0 0 50 70" aria-hidden="true" className="h-full w-full">
      <rect width="50" height="70" fill="var(--night-2)" />
      <path
        d="M 30 22 Q 34 6 44 10"
        fill="none"
        stroke="#F4A259"
        strokeWidth={4}
        strokeLinecap="round"
      />
      <path
        d="M 30 22 Q 34 6 44 10"
        fill="none"
        stroke={INK}
        strokeWidth={1.2}
        strokeLinecap="round"
      />
      <path d="M 10 26 L 40 26 L 37 60 L 13 60 Z" fill="#AEB7C2" {...outline} strokeWidth={2} />
      <path d="M 7 22 L 43 22 L 43 27 L 7 27 Z" fill="#C9D1DA" {...outline} strokeWidth={2} />
      <path
        d="M 18 32 L 18 54 M 25 32 L 25 54 M 32 32 L 32 54"
        stroke="#8A94A0"
        strokeWidth={1.5}
      />
    </svg>
  );
}

/** The trash area illustration (bigger bin). */
export function TrashBinArt() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" className="h-full w-full">
      <path
        d="M 62 30 Q 70 6 88 12"
        fill="none"
        stroke="#F4A259"
        strokeWidth={7}
        strokeLinecap="round"
      />
      <path
        d="M 62 30 Q 70 6 88 12"
        fill="none"
        stroke={INK}
        strokeWidth={2}
        strokeLinecap="round"
      />
      <path d="M 18 36 L 82 36 L 76 92 L 24 92 Z" fill="#AEB7C2" {...outline} />
      <path d="M 12 28 L 88 28 L 88 38 L 12 38 Z" fill="#C9D1DA" {...outline} />
      <path d="M 40 22 Q 50 14 60 22" fill="none" {...outline} />
      <path
        d="M 36 46 L 38 84 M 50 46 L 50 84 M 64 46 L 62 84"
        stroke="#8A94A0"
        strokeWidth={3}
        strokeLinecap="round"
      />
    </svg>
  );
}
