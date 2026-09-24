import { INK, outline } from './style';

/** Dot eyes, pink cheeks and a little smile — every food has a face. */
export function Face({
  x,
  y,
  gap = 14,
  wink = false,
  scale = 1,
}: {
  x: number;
  y: number;
  gap?: number;
  wink?: boolean;
  scale?: number;
}) {
  const r = 2.6 * scale;
  const half = gap / 2;
  return (
    <g>
      <circle cx={x - half} cy={y} r={r} fill={INK} />
      {wink ? (
        <path
          d={`M ${x + half - 3.5 * scale} ${y} q ${3.5 * scale} ${-3.5 * scale} ${7 * scale} 0`}
          fill="none"
          {...outline}
          strokeWidth={2.4 * scale}
        />
      ) : (
        <circle cx={x + half} cy={y} r={r} fill={INK} />
      )}
      <ellipse
        cx={x - half - 3 * scale}
        cy={y + 6 * scale}
        rx={3.6 * scale}
        ry={2.2 * scale}
        fill="#F7A1B5"
        opacity={0.85}
      />
      <ellipse
        cx={x + half + 3 * scale}
        cy={y + 6 * scale}
        rx={3.6 * scale}
        ry={2.2 * scale}
        fill="#F7A1B5"
        opacity={0.85}
      />
      <path
        d={`M ${x - 3.5 * scale} ${y + 4.5 * scale} q ${3.5 * scale} ${3.5 * scale} ${7 * scale} 0`}
        fill="none"
        {...outline}
        strokeWidth={2.2 * scale}
      />
    </g>
  );
}

export function Sparkle({ x, y, size = 6 }: { x: number; y: number; size?: number }) {
  const s = size;
  return (
    <path
      d={`M ${x} ${y - s} Q ${x + s * 0.2} ${y - s * 0.2} ${x + s} ${y} Q ${x + s * 0.2} ${y + s * 0.2} ${x} ${y + s} Q ${x - s * 0.2} ${y + s * 0.2} ${x - s} ${y} Q ${x - s * 0.2} ${y - s * 0.2} ${x} ${y - s} Z`}
      fill="#FFF7C2"
      stroke={INK}
      strokeWidth={1.6}
      strokeLinejoin="round"
    />
  );
}
