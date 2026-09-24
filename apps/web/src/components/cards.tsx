import type { Card, CardKind } from '@meow/engine';
import { useTranslation } from 'react-i18next';
import { MarketBackArt, TrashBackArt } from '../art/BackArt';
import { CardArt } from '../art/CardArt';
import { KIND_COLOR } from '../art/style';

type Size = 'xs' | 'sm' | 'md' | 'fill';

const WIDTH: Record<Size, string> = {
  xs: 'w-11',
  sm: 'w-[4.5rem]',
  md: 'w-[5.75rem] sm:w-[6.5rem]',
  /** Fills its container (grids, bag). */
  fill: 'w-full',
};

/**
 * A card: big picture, name at the bottom, small corner badge (readable when cards overlap).
 * Selectable cards are real buttons (keyboard + screen readers get the food name).
 */
export function GameCard({
  card,
  kind = card?.kind,
  size = 'sm',
  selected = false,
  dimmed = false,
  onSelect,
  count,
}: {
  card?: Card;
  kind?: CardKind | undefined;
  size?: Size;
  selected?: boolean;
  dimmed?: boolean;
  onSelect?: (() => void) | undefined;
  /** Stack badge, e.g. ×3. */
  count?: number;
}) {
  const { t } = useTranslation();
  if (!kind) return null;
  const name = t(`card.${kind}`);
  const body = (
    <>
      <span
        className="absolute top-1 left-1 size-3 rounded-full border-[1.5px] border-ink"
        style={{ background: KIND_COLOR[kind] }}
        aria-hidden
      />
      <span className="flex-1 px-1 pt-1">
        <CardArt kind={kind} />
      </span>
      {size !== 'xs' && (
        <span className="truncate px-0.5 pb-1 text-center font-display text-[0.7rem] leading-tight text-ink sm:text-xs">
          {name}
        </span>
      )}
      {count !== undefined && count > 1 && (
        <span className="absolute -top-2 -right-2 grid size-6 place-items-center rounded-full border-2 border-ink bg-lantern font-display text-xs text-ink">
          ×{count}
        </span>
      )}
    </>
  );
  const frame = `relative flex aspect-[var(--card-ratio)] shrink-0 flex-col rounded-card border-[length:var(--stroke)] border-ink bg-card shadow-md transition ${WIDTH[size]} ${selected ? '-translate-y-2 ring-4 ring-lantern' : ''} ${dimmed ? 'opacity-40' : ''}`;

  if (!onSelect) {
    return (
      <span
        className={frame}
        role="img"
        aria-label={count && count > 1 ? `${name} ×${count}` : name}
      >
        {body}
      </span>
    );
  }
  return (
    <button
      type="button"
      className={`${frame} min-h-tap cursor-pointer hover:-translate-y-1 focus-visible:-translate-y-1`}
      aria-label={name}
      aria-pressed={selected}
      onClick={onSelect}
    >
      {body}
    </button>
  );
}

export function CardBack({ deck, size = 'sm' }: { deck: 'market' | 'trash'; size?: Size }) {
  return (
    <span
      className={`relative block aspect-[var(--card-ratio)] shrink-0 overflow-hidden rounded-card border-[length:var(--stroke)] border-ink shadow-md ${WIDTH[size]}`}
      aria-hidden
    >
      {deck === 'market' ? <MarketBackArt /> : <TrashBackArt />}
    </span>
  );
}

/** Meow bid card: speech bubble with a big number and that many paw dots. */
export function MeowCard({
  value,
  selected = false,
  onSelect,
  label,
}: {
  value: number;
  selected?: boolean;
  onSelect?: () => void;
  label: string;
}) {
  const body = (
    <>
      <svg viewBox="0 0 60 60" aria-hidden className="absolute inset-0 h-full w-full">
        <path
          d="M 10 18 L 14 4 L 22 12 L 38 12 L 46 4 L 50 18 Q 58 30 50 44 Q 42 54 30 54 L 22 60 L 22 53 Q 8 50 6 36 Q 4 26 10 18 Z"
          fill="var(--card)"
          stroke="var(--ink)"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
      </svg>
      <span className="relative mt-1 font-display text-2xl leading-none text-ink">{value}</span>
      <span className="relative mt-0.5 flex gap-px" aria-hidden>
        {Array.from({ length: value }, (_, i) => (
          <span key={i} className="size-1.5 rounded-full bg-shrimp" />
        ))}
      </span>
    </>
  );
  const cls = `relative flex size-14 shrink-0 flex-col items-center justify-center transition sm:size-16 ${selected ? '-translate-y-2 drop-shadow-[0_0_10px_rgb(255_200_87/0.9)]' : ''}`;
  return onSelect ? (
    <button
      type="button"
      className={`${cls} min-h-tap hover:-translate-y-1`}
      aria-label={label}
      aria-pressed={selected}
      onClick={onSelect}
    >
      {body}
    </button>
  ) : (
    <span className={cls} role="img" aria-label={label}>
      {body}
    </span>
  );
}
