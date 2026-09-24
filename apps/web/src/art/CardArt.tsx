import type { CardKind } from '@meow/engine';
import { Face, Sparkle } from './parts';
import { INK, outline } from './style';

// One square (100 × 100) illustration per card kind. Each food has its own silhouette,
// so they stay distinguishable without colour (docs/ART_DIRECTION.md › colour-blind support).

function Fish({ color = 'var(--fish)', gold = false }: { color?: string; gold?: boolean }) {
  return (
    <g>
      <path d="M 70 50 L 92 32 Q 86 50 92 68 Z" fill={color} {...outline} />
      <ellipse cx="45" cy="50" rx="32" ry="22" fill={color} {...outline} />
      <path d="M 52 30 Q 60 20 70 30" fill={color} {...outline} />
      <path d="M 58 44 q 5 6 0 12" fill="none" {...outline} strokeWidth={2.4} />
      <Face x={32} y={46} gap={12} />
      {gold && (
        <>
          <Sparkle x={18} y={20} size={7} />
          <Sparkle x={84} y={82} size={6} />
          <Sparkle x={76} y={16} size={5} />
          <path
            d="M 30 29 L 34 21 L 40 27 L 46 20 L 50 29 Z"
            fill="#FFF3B0"
            {...outline}
            strokeWidth={2}
          />
        </>
      )}
    </g>
  );
}

function Chicken() {
  return (
    <g>
      <path d="M 62 60 L 82 80" stroke={INK} strokeWidth={11} strokeLinecap="round" />
      <path d="M 62 60 L 82 80" stroke="var(--card)" strokeWidth={5} strokeLinecap="round" />
      <circle cx="84" cy="76" r="6" fill="var(--card)" {...outline} />
      <circle cx="78" cy="84" r="6" fill="var(--card)" {...outline} />
      <path
        d="M 20 42 Q 18 18 44 16 Q 70 16 70 44 Q 70 64 52 68 Q 28 72 20 42 Z"
        fill="var(--chicken)"
        {...outline}
      />
      <path
        d="M 30 28 q 6 -6 14 -4"
        fill="none"
        stroke="#FFE2B8"
        strokeWidth={4}
        strokeLinecap="round"
      />
      <Face x={44} y={42} gap={14} />
    </g>
  );
}

function Shrimp() {
  return (
    <g>
      <path d="M 34 30 Q 20 14 12 18" fill="none" {...outline} strokeWidth={2} />
      <path d="M 38 28 Q 30 8 20 8" fill="none" {...outline} strokeWidth={2} />
      <path
        d="M 30 36 Q 36 22 58 26 Q 84 32 80 58 Q 76 80 52 82 Q 44 82 40 76 Q 60 72 62 58 Q 64 42 46 42 Q 36 42 30 36 Z"
        fill="var(--shrimp)"
        {...outline}
      />
      <path
        d="M 62 32 q -4 8 2 14 M 74 44 q -8 4 -8 12 M 72 64 q -8 0 -12 6"
        fill="none"
        {...outline}
        strokeWidth={2.2}
      />
      <path d="M 40 76 L 26 70 L 28 84 Z" fill="var(--shrimp)" {...outline} />
      <circle cx="38" cy="32" r="2.6" fill={INK} />
      <ellipse cx="44" cy="38" rx="3.4" ry="2" fill="#F7A1B5" />
    </g>
  );
}

function Milk() {
  return (
    <g>
      <path
        d="M 28 34 L 50 16 L 72 34 Z"
        fill="var(--milk)"
        {...outline}
        stroke="var(--milk-edge)"
      />
      <path d="M 28 34 L 50 16 L 72 34 Z" fill="none" {...outline} />
      <rect x="44" y="10" width="12" height="8" rx="2" fill="var(--milk)" {...outline} />
      <rect x="28" y="34" width="44" height="54" rx="4" fill="var(--milk)" {...outline} />
      <path d="M 28 60 L 72 60" stroke="var(--milk-edge)" strokeWidth={6} />
      <Face x={50} y={46} gap={14} wink />
    </g>
  );
}

function Snack() {
  // ขนมชั้น — a layered Thai sweet.
  const layers = ['var(--snack)', '#E9F5D0', 'var(--snack)', '#E9F5D0', 'var(--snack)'];
  return (
    <g>
      <path d="M 18 36 L 50 22 L 84 36 L 52 50 Z" fill="#C8E68A" {...outline} />
      {layers.map((fill, i) => (
        <path
          key={i}
          d={`M 18 ${36 + i * 8} L 52 ${50 + i * 8} L 52 ${58 + i * 8} L 18 ${44 + i * 8} Z`}
          fill={fill}
        />
      ))}
      {layers.map((fill, i) => (
        <path
          key={`r${i}`}
          d={`M 52 ${50 + i * 8} L 84 ${36 + i * 8} L 84 ${44 + i * 8} L 52 ${58 + i * 8} Z`}
          fill={fill}
          opacity={0.8}
        />
      ))}
      <path
        d="M 18 36 L 52 50 L 84 36 M 18 36 L 18 76 L 52 90 L 84 76 L 84 36 M 52 50 L 52 90"
        fill="none"
        {...outline}
      />
      <Face x={35} y={62} gap={10} scale={0.85} />
    </g>
  );
}

function Bone() {
  return (
    <g transform="rotate(-20 50 50)">
      <path
        d="M 26 42 Q 14 30 22 24 Q 30 18 34 30 L 66 30 Q 70 18 78 24 Q 86 30 74 42 Q 86 54 78 60 Q 70 66 66 54 L 34 54 Q 30 66 22 60 Q 14 54 26 42 Z"
        fill="#FFFDF6"
        {...outline}
      />
      <Face x={50} y={40} gap={12} scale={0.8} />
    </g>
  );
}

function Dog() {
  // The guard dog is funny rather than scary.
  return (
    <g>
      <path d="M 18 38 Q 8 56 20 70 Q 26 58 28 44 Z" fill="#9A6B4F" {...outline} />
      <path d="M 82 38 Q 92 56 80 70 Q 74 58 72 44 Z" fill="#9A6B4F" {...outline} />
      <ellipse cx="50" cy="56" rx="30" ry="28" fill="#D9A77E" {...outline} />
      <ellipse cx="50" cy="68" rx="15" ry="11" fill="#F6E1CC" {...outline} />
      <ellipse cx="50" cy="62" rx="5.5" ry="4" fill={INK} />
      <path d="M 44 72 q 6 5 12 0" fill="none" {...outline} strokeWidth={2.4} />
      <circle cx="39" cy="50" r="3" fill={INK} />
      <circle cx="61" cy="50" r="3" fill={INK} />
      <path d="M 33 43 l 10 3 M 67 43 l -10 3" {...outline} strokeWidth={2.6} />
      {/* guard cap */}
      <path d="M 24 34 Q 50 10 76 34 Z" fill="var(--danger)" {...outline} />
      <path d="M 20 36 L 80 36" {...outline} strokeWidth={5} />
      <circle cx="50" cy="24" r="4" fill="var(--lantern)" {...outline} strokeWidth={2} />
    </g>
  );
}

export function CardArt({ kind }: { kind: CardKind }) {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" className="h-full w-full">
      {kind === 'fish' && <Fish />}
      {kind === 'chicken' && <Chicken />}
      {kind === 'shrimp' && <Shrimp />}
      {kind === 'milk' && <Milk />}
      {kind === 'snack' && <Snack />}
      {kind === 'goldfish' && <Fish color="var(--gold)" gold />}
      {kind === 'bone' && <Bone />}
      {kind === 'dog' && <Dog />}
    </svg>
  );
}
