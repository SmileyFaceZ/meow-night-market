import type { CatColor } from '../game/types';
import { INK, outline } from './style';

const FUR: Record<CatColor, { base: string; patch?: string; patch2?: string; inner: string }> = {
  orange: { base: '#F4A259', patch: '#E07B2E', inner: '#F7C7A0' },
  black: { base: '#3D3450', inner: '#8E6F9E' },
  white: { base: '#FBF7F2', inner: '#F4C6CF' },
  calico: { base: '#FBF7F2', patch: '#F4A259', patch2: '#3D3450', inner: '#F4C6CF' },
};

export type CatMood = 'normal' | 'happy' | 'shocked' | 'full';

/** Chibi cat head for player badges. */
export function CatArt({ color, mood = 'normal' }: { color: CatColor; mood?: CatMood }) {
  const fur = FUR[color];
  const eyeColor = color === 'black' ? '#FFE9A6' : INK;
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" className="h-full w-full">
      <path d="M 16 40 L 22 8 L 44 26 Z" fill={fur.base} {...outline} />
      <path d="M 84 40 L 78 8 L 56 26 Z" fill={fur.base} {...outline} />
      <path d="M 22 32 L 25 16 L 36 26 Z" fill={fur.inner} />
      <path d="M 78 32 L 75 16 L 64 26 Z" fill={fur.inner} />
      <ellipse cx="50" cy="56" rx="38" ry="34" fill={fur.base} {...outline} />
      {fur.patch && <path d="M 22 40 Q 30 24 48 24 Q 40 40 26 50 Z" fill={fur.patch} />}
      {fur.patch2 && <path d="M 62 26 Q 80 30 84 46 Q 72 44 62 34 Z" fill={fur.patch2} />}
      {color === 'orange' && (
        <path
          d="M 44 24 l 2 8 M 50 23 l 0 9 M 56 24 l -2 8"
          {...outline}
          stroke="#C8651E"
          strokeWidth={2.5}
        />
      )}
      <ellipse cx="50" cy="56" rx="38" ry="34" fill="none" {...outline} />
      {mood === 'happy' || mood === 'full' ? (
        <>
          <path d="M 30 54 q 6 -7 12 0" fill="none" {...outline} stroke={eyeColor} />
          <path d="M 58 54 q 6 -7 12 0" fill="none" {...outline} stroke={eyeColor} />
        </>
      ) : mood === 'shocked' ? (
        <>
          <circle cx="36" cy="54" r="6" fill="#fff" {...outline} />
          <circle cx="64" cy="54" r="6" fill="#fff" {...outline} />
          <circle cx="36" cy="54" r="2" fill={INK} />
          <circle cx="64" cy="54" r="2" fill={INK} />
        </>
      ) : (
        <>
          <ellipse cx="36" cy="54" rx="4" ry="5" fill={eyeColor} />
          <ellipse cx="64" cy="54" rx="4" ry="5" fill={eyeColor} />
        </>
      )}
      <ellipse cx="26" cy="66" rx="6" ry="3.5" fill="#F7A1B5" opacity={0.8} />
      <ellipse cx="74" cy="66" rx="6" ry="3.5" fill="#F7A1B5" opacity={0.8} />
      <path
        d="M 47 62 L 53 62 L 50 66 Z"
        fill="#F28AA0"
        stroke={INK}
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
      {mood === 'shocked' ? (
        <ellipse cx="50" cy="75" rx="5" ry="6" fill={INK} />
      ) : (
        <path d="M 42 69 q 4 5 8 0 q 4 5 8 0" fill="none" {...outline} strokeWidth={2.2} />
      )}
      <path
        d="M 14 62 l 16 2 M 14 70 l 16 -1 M 86 62 l -16 2 M 86 70 l -16 -1"
        {...outline}
        strokeWidth={1.6}
      />
    </svg>
  );
}
