import {
  type Card,
  type EventId,
  FOOD_TYPES,
  type FoodType,
  type PlayerView,
  type PowerId,
} from '@meow/engine';
import { motion, useReducedMotion } from 'motion/react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { EventIcon } from '../art/EventIcon';
import { PowerIcon } from '../art/PowerIcon';
import { eventDescParams } from '../game/mayhem';
import { GameCard } from './cards';

// Market Mayhem pieces of the game screen (GAME_RULES §14–15, docs/ART_DIRECTION.md).

/** The glowing "use your power" button. */
export function PowerButton({
  power,
  onClick,
  children,
}: {
  power: PowerId;
  onClick: () => void;
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  const reduced = useReducedMotion() ?? false;
  return (
    <motion.button
      type="button"
      onClick={onClick}
      className="flex min-h-tap w-full items-center justify-center gap-2 rounded-2xl border-2 border-lantern bg-night px-3 py-1.5 font-display text-base leading-tight text-lantern"
      animate={
        reduced
          ? {}
          : {
              boxShadow: [
                '0 0 6px rgb(255 200 87 / 0.35)',
                '0 0 18px rgb(255 200 87 / 0.8)',
                '0 0 6px rgb(255 200 87 / 0.35)',
              ],
            }
      }
      transition={{ duration: 1.6, repeat: Infinity }}
    >
      <span className="size-7 shrink-0">
        <PowerIcon power={power} />
      </span>
      <span>{children ?? t('power.use', { power: t(`powerName.${power}`) })}</span>
    </motion.button>
  );
}

/** A power's name, icon and one-line description (player details, cat pickers). */
export function PowerInfo({
  power,
  used = false,
  compact = false,
}: {
  power: PowerId;
  used?: boolean;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <span className="flex items-start gap-2 text-left">
      <span className={`shrink-0 ${compact ? 'size-6' : 'size-9'}`}>
        <PowerIcon power={power} used={used} />
      </span>
      <span className="min-w-0">
        <span className={`block font-display leading-tight ${compact ? 'text-sm' : ''}`}>
          {t(`powerName.${power}`)}
          {!compact && (
            <span className="ml-2 text-xs text-card/70">
              {t(used ? 'power.used' : 'power.ready')}
            </span>
          )}
        </span>
        <span className="block text-xs leading-snug text-card/75">{t(`powerDesc.${power}`)}</span>
      </span>
    </span>
  );
}

/** This round's event, top of the screen; tap for the details. */
export function EventChip({ event, onOpen }: { event: EventId | null; onOpen: () => void }) {
  const { t } = useTranslation();
  const name = event ? t(`eventName.${event}`) : t('events.none');
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${t('events.thisRound')}: ${name}`}
      className="flex min-h-tap max-w-[9.5rem] min-w-0 items-center gap-1.5 rounded-2xl bg-night-2 py-1 pr-2 pl-1 text-left"
    >
      <span className="size-8 shrink-0">
        {event ? (
          <EventIcon event={event} />
        ) : (
          <span className="block size-full rounded-lg border-2 border-dashed border-card/40" />
        )}
      </span>
      <span className="truncate font-display text-xs leading-tight">{name}</span>
    </button>
  );
}

export function EventDetails({ view }: { view: PlayerView }) {
  const { t } = useTranslation();
  const row = (event: EventId, big = false) => (
    <li key={event} className="flex items-start gap-2">
      <span className={`shrink-0 ${big ? 'size-12' : 'size-8'}`}>
        <EventIcon event={event} />
      </span>
      <span className="min-w-0">
        <span className={`block font-display leading-tight ${big ? 'text-lg text-lantern' : ''}`}>
          {t(`eventName.${event}`)}
        </span>
        <span className="block text-sm leading-snug text-card/80">
          {t(`eventDesc.${event}`, eventDescParams(event, view.config))}
        </span>
      </span>
    </li>
  );
  return (
    <div className="space-y-4">
      <ul>{view.event ? row(view.event, true) : <li>{t('events.none')}</li>}</ul>
      {view.pastEvents.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm text-card/70">{t('events.past')}</h3>
          <ul className="space-y-2">{view.pastEvents.map((e) => row(e))}</ul>
        </section>
      )}
      <p className="text-sm text-card/70">{t('events.left', { count: view.eventsLeft })}</p>
    </div>
  );
}

/** Keen Nose: the cards the player sniffed, next draw first (only they see this). */
export function PeekStrip({ cards }: { cards: readonly Card[] }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-2 rounded-2xl bg-night px-2 py-1">
      <span className="size-6 shrink-0">
        <PowerIcon power="keenNose" />
      </span>
      <span className="text-xs leading-tight text-card/80">{t('power.peekTitle')}</span>
      <span className="ml-auto flex gap-1">
        {cards.length === 0 ? (
          <span className="text-xs text-card/60">{t('power.peekEmpty')}</span>
        ) : (
          cards.map((card, i) => (
            <span key={card.id} className={`w-8 ${i > 0 ? 'opacity-70' : ''}`}>
              <GameCard card={card} size="fill" />
            </span>
          ))
        )}
      </span>
    </div>
  );
}

/** Scavenger: pick one food card from the discard pile. */
export function ScavengeChooser({
  cards,
  onPick,
}: {
  cards: readonly Card[];
  onPick: (card: Card) => void;
}) {
  const { t } = useTranslation();
  if (cards.length === 0) return <p className="text-sm text-card/70">{t('power.nothing')}</p>;
  return (
    <div className="flex flex-wrap justify-center gap-2">
      {cards.map((card) => (
        <GameCard key={card.id} card={card} size="sm" onSelect={() => onPick(card)} />
      ))}
    </div>
  );
}

/** Haggle: foods whose price can still go up. */
export function HaggleChooser({
  view,
  onPick,
}: {
  view: PlayerView;
  onPick: (food: FoodType) => void;
}) {
  const { t } = useTranslation();
  const foods = FOOD_TYPES.filter((f) => view.prices[f] < view.config.startPrice);
  return (
    <div className="grid grid-cols-2 gap-2">
      {foods.map((food) => (
        <button
          key={food}
          type="button"
          onClick={() => onPick(food)}
          className="flex min-h-tap items-center gap-2 rounded-2xl bg-night px-2 py-1.5 text-left font-display"
        >
          <span className="w-8 shrink-0">
            <GameCard kind={food} size="fill" />
          </span>
          {t('power.haggleOption', {
            food: t(`card.${food}`),
            from: view.prices[food],
            to: view.prices[food] + 1,
          })}
        </button>
      ))}
    </div>
  );
}

/**
 * The market's mood for this round's event: rain, a dimmed stall in a blackout, a big moon.
 * Pure decoration behind the board; still images when motion is reduced.
 */
export function MayhemScene({ event }: { event: EventId | null }) {
  const reduced = useReducedMotion() ?? false;
  if (event === 'downpour') {
    return (
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden>
        <div className="absolute inset-0 bg-[#1d2a4a]/40" />
        {Array.from({ length: 28 }, (_, i) => (
          <motion.span
            key={i}
            className="absolute top-0 h-6 w-0.5 rounded-full bg-[#9ec9ec]/50"
            style={{ left: `${(i * 37) % 100}%` }}
            initial={{ y: `${(i * 53) % 100}vh`, opacity: reduced ? 0.6 : 0 }}
            animate={reduced ? {} : { y: ['-10vh', '110vh'], opacity: [0, 0.8, 0.8] }}
            transition={{
              duration: 0.9 + (i % 5) * 0.15,
              repeat: Infinity,
              delay: (i % 7) * 0.13,
              ease: 'linear',
            }}
          />
        ))}
      </div>
    );
  }
  if (event === 'blackout') {
    return (
      <div
        className="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(circle_at_50%_40%,transparent_0,rgb(10_8_24/0.65)_70%)]"
        aria-hidden
      />
    );
  }
  if (event === 'fullMoon') {
    return (
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden>
        <motion.span
          className="absolute -top-20 -right-20 size-56 rounded-full bg-gold/25 shadow-[0_0_90px_40px_rgb(255_210_63/0.18)]"
          initial={reduced ? false : { opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.2 }}
        />
      </div>
    );
  }
  return null;
}
