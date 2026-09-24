import { type BinMood, INK, outline } from './style';

/**
 * The trash bin shows how risky digging is: calm → uneasy (sweating) → scared (glowing
 * eyes inside) → only dogs left (ears poking out). The exact numbers are one tap away.
 */
export function BinArt({ mood }: { mood: BinMood }) {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" className="h-full w-full overflow-visible">
      {mood === 'empty' && (
        <>
          <path d="M 30 30 Q 26 8 40 16 Z" fill="#9A6B4F" {...outline} />
          <path d="M 70 30 Q 74 8 60 16 Z" fill="#9A6B4F" {...outline} />
        </>
      )}
      {mood !== 'empty' && (
        <>
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
        </>
      )}
      <path d="M 18 36 L 82 36 L 76 92 L 24 92 Z" fill="#AEB7C2" {...outline} />
      <path
        d={
          mood === 'scared' || mood === 'empty'
            ? 'M 12 26 L 88 20 L 88 30 L 12 36 Z'
            : 'M 12 28 L 88 28 L 88 38 L 12 38 Z'
        }
        fill="#C9D1DA"
        {...outline}
      />
      {(mood === 'scared' || mood === 'empty') && (
        <>
          <ellipse cx="40" cy="38" rx="4" ry="2.5" fill="#FFE45C" />
          <ellipse cx="58" cy="37" rx="4" ry="2.5" fill="#FFE45C" />
        </>
      )}
      {/* face on the bin */}
      {mood === 'calm' && (
        <>
          <path
            d="M 36 58 q 5 -5 10 0 M 54 58 q 5 -5 10 0"
            fill="none"
            {...outline}
            strokeWidth={2.6}
          />
          <path d="M 44 68 q 6 5 12 0" fill="none" {...outline} strokeWidth={2.4} />
        </>
      )}
      {mood === 'uneasy' && (
        <>
          <circle cx="41" cy="58" r="3" fill={INK} />
          <circle cx="59" cy="58" r="3" fill={INK} />
          <path d="M 44 70 q 6 -4 12 0" fill="none" {...outline} strokeWidth={2.4} />
          <path
            d="M 72 46 q 4 6 0 10 q -4 -4 0 -10 Z"
            fill="#8ED1F5"
            stroke={INK}
            strokeWidth={1.5}
          />
        </>
      )}
      {(mood === 'scared' || mood === 'empty') && (
        <>
          <circle cx="41" cy="58" r="5" fill="#fff" {...outline} strokeWidth={2} />
          <circle cx="59" cy="58" r="5" fill="#fff" {...outline} strokeWidth={2} />
          <circle cx="41" cy="58" r="1.8" fill={INK} />
          <circle cx="59" cy="58" r="1.8" fill={INK} />
          <ellipse cx="50" cy="72" rx="5" ry="4" fill={INK} />
        </>
      )}
    </svg>
  );
}
