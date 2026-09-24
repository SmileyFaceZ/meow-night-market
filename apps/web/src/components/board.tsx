import { type Card, FOOD_TYPES, type PlayerView, type PublicPlayer } from '@meow/engine';
import { useTranslation } from 'react-i18next';
import { TrashBinArt } from '../art/BackArt';
import { CardArt } from '../art/CardArt';
import { CatArt, type CatMood } from '../art/CatArt';
import type { FeedLine } from '../game/hooks';
import type { SeatInfo } from '../game/types';
import { groupCards, sortCards } from './cardGroups';
import { CardBack, GameCard } from './cards';

export type PlayerStatus = 'turn' | 'ready' | 'thinking' | null;

export function PlayerBadge({
  player,
  seat,
  name,
  status,
  isYou = false,
  mood = 'normal',
  stacked = false,
  onOpen,
}: {
  player: PublicPlayer;
  seat: SeatInfo;
  name: string;
  status: PlayerStatus;
  isYou?: boolean;
  mood?: CatMood;
  /** Narrow layout (3 opponents on a phone): name gets the full width on its own line. */
  stacked?: boolean;
  onOpen?: () => void;
}) {
  const { t } = useTranslation();
  const statusText =
    status === 'turn'
      ? t(isYou ? 'player.yourTurn' : 'player.thinking')
      : status === 'ready'
        ? t('player.bidReady')
        : status === 'thinking'
          ? t('player.thinking')
          : null;
  const avatar = (
    <span className="relative size-9 shrink-0">
      <CatArt color={seat.cat} mood={mood} />
      {player.revealedBid !== null && (
        <span
          className={`absolute -right-1.5 -bottom-1 grid size-5 place-items-center rounded-full border-2 border-ink font-display text-[0.7rem] ${player.clashed ? 'bg-danger text-card' : 'bg-card text-ink'}`}
        >
          {player.revealedBid}
        </span>
      )}
    </span>
  );
  const stats = (
    <span className="block truncate text-[0.7rem] leading-tight text-card/80">
      {t('player.points', { count: player.mealPoints })}
      {/* narrow badges drop the card count — tap the badge to see the whole hand */}
      {!stacked && ` · ${t('player.cards', { count: player.handCount })}`}
    </span>
  );
  const statusLine = (
    <span
      className={`block truncate text-[0.7rem] leading-tight ${status === 'turn' ? 'text-lantern' : 'text-card/60'}`}
    >
      {statusText ?? '\u00a0'}
    </span>
  );
  const nameLine = (
    <span className="block truncate font-display text-[0.8rem] leading-tight">{name}</span>
  );
  const content = stacked ? (
    <span className="flex w-full min-w-0 flex-col">
      <span className="flex items-center gap-1.5">
        {avatar}
        <span className="min-w-0 text-left">
          {stats}
          {statusLine}
        </span>
      </span>
      <span className="mt-0.5 text-left">{nameLine}</span>
    </span>
  ) : (
    <>
      {avatar}
      <span className="min-w-0 flex-1 text-left">
        {nameLine}
        {stats}
        {statusLine}
      </span>
    </>
  );
  const frame = `flex min-h-tap w-full min-w-0 items-center gap-1.5 rounded-2xl px-1.5 py-1 ${status === 'turn' ? 'bg-night-2 ring-2 ring-lantern' : 'bg-night-2/70'}`;
  return onOpen ? (
    <button type="button" className={frame} onClick={onOpen}>
      {content}
    </button>
  ) : (
    <div className={frame}>{content}</div>
  );
}

/** Paper price tags hanging over the stall. */
export function PriceTags({ prices }: { prices: PlayerView['prices'] }) {
  const { t } = useTranslation();
  return (
    <ul className="grid grid-cols-5 gap-1.5" aria-label={t('term.price')}>
      {FOOD_TYPES.map((food) => (
        <li
          key={food}
          className="flex items-center justify-center gap-0.5 rounded-lg border-2 border-ink bg-card py-0.5 text-ink shadow-sm"
          aria-label={`${t(`card.${food}`)} ${prices[food]}`}
        >
          <span className="size-6 shrink-0" aria-hidden>
            <CardArt kind={food} />
          </span>
          <span className="font-display text-lg leading-none" aria-hidden>
            {prices[food]}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function MarketStall({
  cards,
  deckCount,
  onPick,
}: {
  cards: readonly Card[];
  deckCount: number;
  onPick?: ((card: Card) => void) | undefined;
}) {
  const { t } = useTranslation();
  return (
    <section aria-label={t('term.market')} className="rounded-2xl bg-night-2/60 px-2 pt-1 pb-2">
      <div className="flex items-center justify-between px-1 text-xs text-card/80">
        <span className="font-display text-sm text-card">{t('term.market')}</span>
        <span className="flex items-center gap-1">
          <span className="w-4">
            <CardBack deck="market" size="fill" />
          </span>
          ×{deckCount}
        </span>
      </div>
      <div className="mt-1 h-2.5 rounded-t-lg bg-[repeating-linear-gradient(90deg,var(--shrimp)_0_12px,var(--card)_12px_24px)]" />
      <div className="grid min-h-24 grid-cols-5 gap-1.5 rounded-b-lg bg-night/40 p-1.5">
        {cards.length === 0 ? (
          <span className="col-span-5 self-center text-center text-sm text-card/60">
            {t('term.empty')}
          </span>
        ) : (
          cards.map((card) => (
            <GameCard
              key={card.id}
              card={card}
              size="fill"
              onSelect={onPick ? () => onPick(card) : undefined}
            />
          ))
        )}
      </div>
    </section>
  );
}

export function TrashArea({ view }: { view: PlayerView }) {
  const { t } = useTranslation();
  const dogs = view.trashDogCount;
  const pool = view.trashCount > dogs ? view.trashCount : dogs + view.discard.length;
  const risk = pool > 0 ? Math.round((dogs / pool) * 100) : 0;
  const hasBag = view.bag.length > 0 || view.pendingDog;
  return (
    <section
      aria-label={t('term.trash')}
      className="flex items-center gap-2 rounded-2xl bg-night-2/60 px-2 py-1.5"
    >
      <span className="size-11 shrink-0">
        <TrashBinArt />
      </span>
      <span className="min-w-0 shrink-0 text-xs leading-snug">
        <span className="block font-display text-sm text-card">{t('term.trash')}</span>
        <span className="block text-card/80">
          {t('trash.status', { count: view.trashCount, dogs })}
        </span>
        <span className="block text-card/80">{t('trash.risk', { percent: risk })}</span>
      </span>
      {hasBag && (
        <span
          className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-1"
          aria-label={t('term.bag')}
        >
          {view.bag.map((card) => (
            <span key={card.id} className="w-8">
              <GameCard card={card} size="fill" />
            </span>
          ))}
          {view.pendingDog && (
            <span className="w-11">
              <GameCard card={view.pendingDog} size="fill" />
            </span>
          )}
        </span>
      )}
    </section>
  );
}

export function HandView({
  cards,
  selectable = false,
  selected = [],
  onToggle,
}: {
  cards: readonly Card[];
  selectable?: boolean;
  selected?: readonly number[];
  onToggle?: (card: Card) => void;
}) {
  const { t } = useTranslation();
  if (cards.length === 0) {
    return <p className="py-2 text-center text-sm text-card/60">{t('term.empty')}</p>;
  }
  if (selectable) {
    return (
      <div className="flex flex-wrap justify-center gap-1.5 pt-2">
        {sortCards(cards).map((card) => (
          <GameCard
            key={card.id}
            card={card}
            size="xs"
            selected={selected.includes(card.id)}
            onSelect={() => onToggle?.(card)}
          />
        ))}
      </div>
    );
  }
  return (
    <div className="flex flex-wrap justify-center gap-x-3 gap-y-3 pt-2">
      {groupCards(cards).map((group) => (
        <GameCard key={group.kind} kind={group.kind} size="xs" count={group.cards.length} />
      ))}
    </div>
  );
}

export function EventFeed({ lines }: { lines: readonly FeedLine[] }) {
  const { t } = useTranslation();
  const shown = lines.slice(-2);
  return (
    <ul aria-live="polite" className="min-h-[2.6rem] space-y-0.5 px-1 text-sm leading-snug">
      {shown.map((line, i) => (
        <li
          key={`${line.key}-${i}-${lines.length}`}
          className={`truncate ${line.tone === 'bad' ? 'text-alert' : i === shown.length - 1 ? 'text-card' : 'text-card/60'}`}
        >
          {t(line.key, line.params)}
        </li>
      ))}
    </ul>
  );
}
