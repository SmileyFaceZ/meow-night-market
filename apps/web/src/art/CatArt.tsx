import type { CatColor } from '../game/types';
import { INK, outline } from './style';

interface Fur {
  base: string;
  patch?: string;
  patch2?: string;
  inner: string;
  /** Ear colour when it differs from the face (siamese points). */
  ears?: string;
  eyes?: string;
}

const FUR: Record<CatColor, Fur> = {
  orange: { base: '#F4A259', patch: '#E07B2E', inner: '#F7C7A0' },
  black: { base: '#3D3450', inner: '#8E6F9E', eyes: '#FFE9A6' },
  white: { base: '#FBF7F2', inner: '#F4C6CF' },
  calico: { base: '#FBF7F2', patch: '#F4A259', patch2: '#3D3450', inner: '#F4C6CF' },
  // สีสวาด: silver-blue coat, famously green eyes.
  korat: { base: '#8FA0B8', inner: '#D7B3C2', eyes: '#3F7A3A' },
  // วิเชียรมาศ: cream coat with dark points (ears, mask).
  siamese: { base: '#F4E7CF', inner: '#B98A7A', ears: '#5E4033', eyes: '#2F6DB5' },
  // ลายสลิด: grey-brown tabby stripes.
  tabby: { base: '#B9A78C', inner: '#E8C4B8' },
  // ตุ้ยนุ้ย: round butter-coloured face, white muzzle.
  chubby: { base: '#F4D08A', inner: '#F7C7A0' },
};

export type CatMood = 'normal' | 'happy' | 'shocked' | 'full';

/** Chibi cat head for player badges. */
export function CatArt({ color, mood = 'normal' }: { color: CatColor; mood?: CatMood }) {
  const fur = FUR[color];
  const eyeColor = fur.eyes ?? INK;
  const ears = fur.ears ?? fur.base;
  // Chubby has a wider, rounder face.
  const rx = color === 'chubby' ? 42 : 38;
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" className="h-full w-full">
      <path d="M 16 40 L 22 8 L 44 26 Z" fill={ears} {...outline} />
      <path d="M 84 40 L 78 8 L 56 26 Z" fill={ears} {...outline} />
      <path d="M 22 32 L 25 16 L 36 26 Z" fill={fur.inner} />
      <path d="M 78 32 L 75 16 L 64 26 Z" fill={fur.inner} />
      <ellipse cx="50" cy="56" rx={rx} ry="34" fill={fur.base} {...outline} />
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
      {color === 'tabby' && (
        <path
          d="M 42 24 l 2 9 M 50 22 l 0 10 M 58 24 l -2 9 M 13 52 l 10 3 M 14 60 l 9 1 M 87 52 l -10 3 M 86 60 l -9 1"
          {...outline}
          stroke="#6E5C48"
          strokeWidth={3}
        />
      )}
      {color === 'siamese' && (
        <ellipse cx="50" cy="66" rx="17" ry="13" fill="#5E4033" opacity={0.85} />
      )}
      {color === 'chubby' && <ellipse cx="50" cy="70" rx="16" ry="11" fill="#FFF8EC" />}
      <ellipse cx="50" cy="56" rx={rx} ry="34" fill="none" {...outline} />
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
