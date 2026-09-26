import type { Card, GameConfig, PlayerId } from '@meow/engine';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { type ReactNode, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { BinArt } from '../art/BinArt';
import { CatArt, type CatMood } from '../art/CatArt';
import { EventIcon } from '../art/EventIcon';
import { PowerIcon } from '../art/PowerIcon';
import { eventDescParams } from '../game/mayhem';
import type { Beat } from '../game/stage';
import type { SeatInfo } from '../game/types';
import type { StagedBeat } from '../game/useStage';
import { GameCard, MeowCard } from './cards';
import { Button } from './ui';

type NameOf = (id: PlayerId | null | undefined) => string;

/**
 * Plays the current beat over the board. Popups dim the board and a tap (or
 * Enter/Space/Esc) closes them early; a thin bar shows when they close by themselves.
 * Pinned popups (solo / pass-and-play) wait for "Got it". Other beats are small toasts.
 */
export function Stage({
  staged,
  seats,
  viewer,
  name,
  config,
  onSkip,
}: {
  staged: StagedBeat | null;
  seats: readonly SeatInfo[];
  viewer: PlayerId | null;
  name: NameOf;
  config: GameConfig;
  onSkip: () => void;
}) {
  const { t } = useTranslation();
  const reduced = useReducedMotion() ?? false;

  useEffect(() => {
    if (!staged?.blocking) return;
    const onKey = (e: KeyboardEvent) => {
      const keys = staged.pinned ? ['Enter', ' '] : ['Enter', ' ', 'Escape'];
      if (keys.includes(e.key)) {
        e.preventDefault();
        onSkip();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [staged, onSkip]);

  const seatOf = (id: PlayerId) => seats.find((s) => s.id === id);
  const who = (id: PlayerId) => (id === viewer ? t('term.you') : name(id));

  return (
    // mode="wait": the next popup comes in only after this one has gone (never overlapping).
    <AnimatePresence mode="wait">
      {staged && (
        <motion.div
          key={staged.id}
          className={`fixed inset-0 z-30 flex justify-center px-4 ${staged.blocking ? 'items-center bg-ink/45' : 'pointer-events-none items-end pb-44'}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduced ? 0 : 0.15 }}
          onClick={staged.blocking && !staged.pinned ? onSkip : undefined}
          role="status"
          aria-live="assertive"
        >
          <motion.div
            className={`relative w-full max-w-sm rounded-3xl border-[length:var(--stroke)] border-ink bg-night-2 px-4 py-4 text-center shadow-2xl ${staged.blocking ? '' : 'py-2'}`}
            initial={reduced ? false : { scale: 0.85, y: 12 }}
            animate={
              reduced
                ? {}
                : staged.beat.kind === 'dog'
                  ? { scale: 1, y: 0, x: [0, -10, 10, -8, 8, -4, 0] }
                  : { scale: 1, y: 0 }
            }
            transition={{ duration: 0.35, x: { delay: 0.25, duration: 0.5 } }}
          >
            <BeatContent
              beat={staged.beat}
              who={who}
              seatOf={seatOf}
              config={config}
              reduced={reduced}
            />
            {staged.pinned ? (
              <Button className="mt-4 w-full" onClick={onSkip}>
                {t('stage.gotIt')}
              </Button>
            ) : (
              staged.blocking && (
                <>
                  <TimeBar key={staged.id} ms={staged.duration} reduced={reduced} />
                  <p className="mt-1.5 text-xs text-card/50" aria-hidden>
                    {t('stage.tapToSkip')}
                  </p>
                </>
              )
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** How long until the popup closes by itself (whole seconds when motion is reduced). */
function TimeBar({ ms, reduced }: { ms: number; reduced: boolean }) {
  const { t } = useTranslation();
  return (
    <span
      className="mt-3 block h-1.5 overflow-hidden rounded-full bg-card/15"
      role="progressbar"
      aria-label={t('stage.closesIn')}
    >
      <span
        className="block h-full origin-left rounded-full bg-lantern"
        style={{
          animation: `mnm-shrink ${ms}ms ${reduced ? `steps(${Math.max(1, Math.round(ms / 1000))}, end)` : 'linear'} forwards`,
        }}
      />
    </span>
  );
}

/** A compact one-line toast: small picture(s), then the sentence. */
function ToastRow({ art, text, sub }: { art: ReactNode; text: string; sub?: string | undefined }) {
  return (
    <div className="flex items-center justify-center gap-2.5 text-left">
      <span className="flex shrink-0 items-center gap-1">{art}</span>
      <span className="min-w-0">
        <span className="block font-display text-base leading-snug">{text}</span>
        {sub && <span className="block text-xs text-card/75">{sub}</span>}
      </span>
    </div>
  );
}

function Cat({
  seat,
  mood = 'normal',
  size = 'size-14',
}: {
  seat: SeatInfo | undefined;
  mood?: CatMood;
  size?: string;
}) {
  if (!seat) return null;
  return (
    <span className={`inline-block ${size}`}>
      <CatArt color={seat.cat} mood={mood} />
    </span>
  );
}

function MiniCard({ card, className = 'w-12' }: { card: Card; className?: string }) {
  return (
    <span className={`inline-block ${className}`}>
      <GameCard card={card} size="fill" />
    </span>
  );
}

function BeatContent({
  beat,
  who,
  seatOf,
  config,
  reduced,
}: {
  beat: Beat;
  who: (id: PlayerId) => string;
  seatOf: (id: PlayerId) => SeatInfo | undefined;
  config: GameConfig;
  reduced: boolean;
}) {
  const { t } = useTranslation();
  const line = (text: string, tone: 'normal' | 'bad' | 'good' = 'normal') => (
    <p
      className={`mt-2 font-display text-lg leading-snug ${tone === 'bad' ? 'text-alert' : tone === 'good' ? 'text-lantern' : 'text-card'}`}
    >
      {text}
    </p>
  );

  switch (beat.kind) {
    case 'round':
      return (
        <>
          <p className="font-display text-3xl text-lantern">
            {t('feed.round', { round: beat.round })}
          </p>
          <p className="mt-2 text-sm text-card/80">{t('term.tieOrder')}</p>
          <div className="mt-1 flex justify-center gap-2">
            {beat.tieOrder.map((id, i) => (
              <span key={id} className="flex w-20 flex-col items-center text-xs">
                <Cat seat={seatOf(id)} size="size-10" />
                <span className="w-full truncate text-center font-display">
                  {i + 1}. {who(id)}
                </span>
              </span>
            ))}
          </div>
        </>
      );

    case 'reveal': {
      const clashed = new Set(beat.clashes.flatMap((c) => c.playerIds));
      const ids = Object.keys(beat.bids);
      return (
        <>
          <p className="font-display text-xl text-lantern">{t('stage.reveal')}</p>
          <div className="mt-3 flex justify-center gap-3">
            {ids.map((id) => {
              const isClash = clashed.has(id);
              return (
                <div key={id} className="relative flex w-16 flex-col items-center">
                  <Cat seat={seatOf(id)} mood={isClash ? 'shocked' : 'normal'} size="size-11" />
                  <motion.div
                    initial={reduced ? false : { scaleX: 0 }}
                    animate={
                      reduced
                        ? {}
                        : isClash
                          ? {
                              scaleX: 1,
                              x: [0, 0, -5, 5, -4, 4, 0],
                              rotate: [0, 0, -6, 6, -3, 3, 0],
                            }
                          : { scaleX: 1 }
                    }
                    transition={
                      isClash
                        ? { duration: 1.4, times: [0, 0.4, 0.5, 0.6, 0.7, 0.85, 1] }
                        : { duration: 0.35 }
                    }
                  >
                    <MeowCard value={beat.bids[id]!} label={`${who(id)} ${beat.bids[id]}`} />
                  </motion.div>
                  <span className="w-full truncate text-xs">{who(id)}</span>
                  {isClash && (
                    <motion.span
                      className="absolute -top-2 rounded-full bg-danger px-2 py-0.5 font-display text-xs text-card"
                      initial={reduced ? false : { scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ delay: reduced ? 0 : 0.6 }}
                    >
                      {t('term.clash')}
                    </motion.span>
                  )}
                  {isClash && !reduced && <Dust />}
                </div>
              );
            })}
          </div>
          {beat.clashes.length === 0
            ? line(t('stage.noClash'), 'good')
            : beat.clashes.map((c) => (
                <div key={c.value}>
                  {line(
                    t('feed.clash', { names: c.playerIds.map(who).join(', '), value: c.value }),
                    'bad',
                  )}
                </div>
              ))}
        </>
      );
    }

    case 'dog':
      return (
        <>
          <div className="relative mx-auto w-24">
            <motion.div
              initial={reduced ? false : { y: 40, scale: 0.6 }}
              animate={{ y: 0, scale: 1 }}
              transition={{ type: 'spring', stiffness: 380, damping: 14 }}
            >
              <GameCard kind="dog" size="fill" />
            </motion.div>
            <motion.span
              className="absolute -top-4 -right-10 rounded-2xl rounded-bl-none bg-card px-3 py-1 font-display text-2xl text-ink shadow-lg"
              initial={reduced ? false : { scale: 0, rotate: -20 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ delay: reduced ? 0 : 0.2, type: 'spring', stiffness: 500, damping: 12 }}
            >
              {t('stage.bark')}
            </motion.span>
          </div>
          {line(t('feed.dog', { name: who(beat.playerId) }), 'bad')}
        </>
      );

    case 'caught':
      return (
        <>
          <Cat seat={seatOf(beat.playerId)} mood="shocked" />
          <div className="relative mt-1 flex min-h-16 justify-center gap-1">
            {beat.lost.map((card, i) => (
              <motion.span
                key={card.id}
                initial={{ x: 0, y: 0, rotate: 0, opacity: 1 }}
                animate={
                  reduced
                    ? { opacity: 0.4 }
                    : {
                        x: (i - (beat.lost.length - 1) / 2) * 60,
                        y: -70 - (i % 2) * 30,
                        rotate: (i % 2 ? 1 : -1) * 70,
                        opacity: 0,
                      }
                }
                transition={{ delay: 0.25, duration: 0.8, ease: 'easeOut' }}
              >
                <MiniCard card={card} className="w-10" />
              </motion.span>
            ))}
          </div>
          {line(t('feed.caught', { name: who(beat.playerId), count: beat.lost.length }), 'bad')}
        </>
      );

    case 'meal':
      return (
        <ToastRow
          art={
            <>
              <Cat seat={seatOf(beat.playerId)} mood="full" size="size-10" />
              <MiniCard card={beat.meal.cards[0]!} className="w-8" />
            </>
          }
          text={t(beat.meal.big ? 'feed.bigMeal' : 'feed.meal', {
            name: who(beat.playerId),
            food: t(`card.${beat.meal.food}`),
            points: beat.meal.points,
          })}
          sub={t('stage.priceDrop', {
            food: t(`card.${beat.meal.food}`),
            from: beat.meal.price,
            to: beat.newPrice,
          })}
        />
      );

    case 'skipped':
      return (
        <ToastRow
          art={<Cat seat={seatOf(beat.playerId)} size="size-10" />}
          text={t('feed.skipped', { name: who(beat.playerId) })}
        />
      );

    case 'bone':
      return (
        <ToastRow
          art={
            <>
              <Cat seat={seatOf(beat.playerId)} mood="happy" size="size-10" />
              <span className="inline-block w-8">
                <GameCard kind="bone" size="fill" />
              </span>
            </>
          }
          text={t('feed.bone', { name: who(beat.playerId) })}
        />
      );

    case 'dug':
      return (
        <div className="flex items-center justify-center gap-3">
          <motion.span
            className="inline-block size-10"
            initial={false}
            animate={reduced ? {} : { rotate: [0, -8, 8, -6, 6, 0] }}
            transition={{ duration: 0.3 }}
          >
            <BinArt mood="calm" />
          </motion.span>
          <motion.span
            initial={reduced ? false : { y: 18, scale: 0.4, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            transition={{ delay: reduced ? 0 : 0.28, type: 'spring', stiffness: 420, damping: 15 }}
          >
            <MiniCard card={beat.card} className="w-10" />
          </motion.span>
          <p className="text-left font-display text-base">
            {t('feed.dug', { name: who(beat.playerId), card: t(`card.${beat.card.kind}`) })}
          </p>
        </div>
      );

    case 'pick':
      return (
        <div className="flex items-center justify-center gap-3">
          <Cat seat={seatOf(beat.playerId)} mood="happy" size="size-10" />
          <motion.span
            initial={reduced ? false : { y: 16, scale: 0.6 }}
            animate={{ y: 0, scale: 1 }}
            transition={{ type: 'spring', stiffness: 420, damping: 16 }}
          >
            <MiniCard card={beat.card} className="w-10" />
          </motion.span>
          <p className="text-left font-display text-base">
            {t('feed.picked', {
              name: who(beat.playerId),
              card: t(`card.${beat.card.kind}`),
            })}
          </p>
        </div>
      );

    case 'kept':
      return (
        <div className="flex flex-col items-center">
          <div className="flex -space-x-4">
            {beat.cards.map((card) => (
              <MiniCard key={card.id} card={card} className="w-9" />
            ))}
          </div>
          {line(t('feed.kept', { name: who(beat.playerId), count: beat.cards.length }), 'good')}
        </div>
      );

    case 'discarded':
      return (
        <ToastRow
          art={
            <span className="flex -space-x-4 opacity-80">
              {beat.cards.slice(0, 3).map((card) => (
                <MiniCard key={card.id} card={card} className="w-8" />
              ))}
            </span>
          }
          text={t('feed.discarded', { name: who(beat.playerId), count: beat.cards.length })}
        />
      );

    case 'gameOver':
      return (
        <>
          <motion.p
            className="font-display text-3xl text-lantern"
            initial={reduced ? false : { scale: 0.5 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 12 }}
          >
            {t('stage.gameOver')}
          </motion.p>
          {!reduced && <Confetti />}
        </>
      );

    // ── cat powers ──
    case 'power': {
      const power = t(`powerName.${beat.power}`);
      return (
        <>
          <div className="relative mx-auto flex w-fit items-end justify-center gap-1">
            <Cat seat={seatOf(beat.playerId)} mood="happy" size="size-16" />
            <motion.span
              className="inline-block size-12"
              initial={reduced ? false : { scale: 0, rotate: -40 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{
                delay: reduced ? 0 : 0.15,
                type: 'spring',
                stiffness: 420,
                damping: 12,
              }}
            >
              <PowerIcon power={beat.power} />
            </motion.span>
            {!reduced && <Sparkles />}
          </div>
          <motion.p
            className="mt-1 font-display text-3xl text-lantern"
            initial={reduced ? false : { scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: reduced ? 0 : 0.3, type: 'spring', stiffness: 380, damping: 11 }}
          >
            {t('stage.powerUsed', { power })}
          </motion.p>
          {line(t('feed.power', { name: who(beat.playerId), power }))}
        </>
      );
    }

    case 'bidChanged':
      return (
        <ToastRow
          art={<Cat seat={seatOf(beat.playerId)} mood="happy" size="size-10" />}
          text={t('feed.bidChanged', { name: who(beat.playerId), from: beat.from, to: beat.to })}
        />
      );

    case 'swapped':
      return (
        <ToastRow
          art={
            <>
              <MiniCard card={beat.out} className="w-8" />
              <span aria-hidden>→</span>
              <MiniCard card={beat.in} className="w-8" />
            </>
          }
          text={t('feed.swapped', {
            name: who(beat.playerId),
            out: t(`card.${beat.out.kind}`),
            in: t(`card.${beat.in.kind}`),
          })}
        />
      );

    case 'scavenged':
    case 'gift':
      return (
        <div className="flex items-center justify-center gap-3">
          <Cat seat={seatOf(beat.playerId)} mood="happy" size="size-10" />
          <motion.span
            initial={reduced ? false : { y: 16, scale: 0.6 }}
            animate={{ y: 0, scale: 1 }}
            transition={{ type: 'spring', stiffness: 420, damping: 16 }}
          >
            <MiniCard card={beat.card} className="w-10" />
          </motion.span>
          <p className="text-left font-display text-base">
            {t(beat.kind === 'gift' ? 'feed.gift' : 'feed.scavenged', {
              name: who(beat.playerId),
              card: t(`card.${beat.card.kind}`),
            })}
          </p>
        </div>
      );

    case 'price':
      return (
        <div className="flex items-center justify-center gap-3">
          <span className="inline-block w-9">
            <GameCard kind={beat.food} size="fill" />
          </span>
          <p className="font-display text-base">
            {t('feed.price', { food: t(`card.${beat.food}`), from: beat.from, to: beat.to })}
          </p>
        </div>
      );

    case 'restored':
      return (
        <ToastRow
          art={
            <span className="inline-block size-9">
              <EventIcon event="fullMoon" />
            </span>
          }
          text={t('stage.restored')}
        />
      );

    // ── market events ──
    case 'event':
      return (
        <>
          <p className="text-sm text-card/80">{t('stage.eventTitle', { round: beat.round })}</p>
          <motion.span
            className="mx-auto mt-2 block size-20"
            initial={reduced ? false : { rotateY: 180, scale: 0.6 }}
            animate={{ rotateY: 0, scale: 1 }}
            transition={{ duration: 0.6, type: 'spring', stiffness: 200, damping: 15 }}
          >
            <EventIcon event={beat.event} />
          </motion.span>
          <p className="mt-2 font-display text-2xl text-lantern">{t(`eventName.${beat.event}`)}</p>
          <p className="mt-1 text-base leading-snug text-card">
            {t(`eventDesc.${beat.event}`, eventDescParams(beat.event, config))}
          </p>
        </>
      );

    case 'slept':
      return (
        <>
          <div className="relative mx-auto w-20">
            <motion.span
              className="block"
              initial={false}
              animate={reduced ? {} : { rotate: [0, -3, 0, 3, 0] }}
              transition={{ duration: 1.2, repeat: Infinity }}
            >
              <GameCard kind="dog" size="fill" />
            </motion.span>
            <motion.span
              className="absolute -top-3 -right-6 font-display text-2xl text-lantern"
              initial={reduced ? false : { y: 6, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: reduced ? 0 : 0.2 }}
              aria-hidden
            >
              {t('stage.snore')}
            </motion.span>
          </div>
          {line(t('feed.slept', { name: who(beat.playerId) }), 'good')}
        </>
      );

    case 'passStart':
      return (
        <>
          <span className="mx-auto block size-16">
            <EventIcon event="gustyWind" />
          </span>
          <p className="mt-2 font-display text-2xl text-lantern">{t('eventName.gustyWind')}</p>
          <p className="mt-1 text-base leading-snug text-card">{t('stage.passStart')}</p>
          <div className="mt-2 flex justify-center gap-2" aria-hidden>
            {beat.passers.map((id) => (
              <Cat key={id} seat={seatOf(id)} size="size-9" />
            ))}
          </div>
        </>
      );

    case 'passed':
      return (
        <>
          <p className="font-display text-xl text-lantern">{t('eventName.gustyWind')}</p>
          <ul className="mt-2 space-y-1.5">
            {beat.passes.map((p, i) => (
              <motion.li
                key={p.card.id}
                className="flex items-center justify-center gap-2 text-sm"
                initial={reduced ? false : { x: -24, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: reduced ? 0 : 0.15 + i * 0.12 }}
              >
                <span className="flex w-20 flex-col items-center">
                  <Cat seat={seatOf(p.from)} size="size-8" />
                  <span className="w-full truncate text-xs">{who(p.from)}</span>
                </span>
                <MiniCard card={p.card} className="w-9" />
                <span className="font-display text-xl" aria-hidden>
                  →
                </span>
                <span className="flex w-20 flex-col items-center">
                  <Cat seat={seatOf(p.to)} size="size-8" />
                  <span className="w-full truncate text-xs">{who(p.to)}</span>
                </span>
              </motion.li>
            ))}
          </ul>
          {line(t('feed.passed'))}
        </>
      );
  }
}

/** Star sparkles bursting around a power. */
function Sparkles() {
  return (
    <span className="pointer-events-none absolute top-1/2 left-1/2" aria-hidden>
      {Array.from({ length: 8 }, (_, i) => {
        const angle = (i / 8) * Math.PI * 2;
        return (
          <motion.span
            key={i}
            className="absolute text-lg text-lantern"
            initial={{ x: 0, y: 0, scale: 0, opacity: 0 }}
            animate={{
              x: Math.cos(angle) * 58,
              y: Math.sin(angle) * 44,
              scale: [0, 1.2, 0.6],
              opacity: [0, 1, 0],
            }}
            transition={{ delay: 0.2 + (i % 2) * 0.08, duration: 0.9 }}
          >
            ✦
          </motion.span>
        );
      })}
    </span>
  );
}

/** Little dust puffs when two meows collide. */
function Dust() {
  return (
    <span className="pointer-events-none absolute top-10 left-1/2" aria-hidden>
      {[-1, 1, -0.5, 0.5].map((dir, i) => (
        <motion.span
          key={i}
          className="absolute size-3 rounded-full bg-card/70"
          initial={{ x: 0, y: 0, scale: 0, opacity: 0 }}
          animate={{ x: dir * 28, y: -10 - i * 4, scale: [0, 1.4, 0.6], opacity: [0, 0.9, 0] }}
          transition={{ delay: 0.55, duration: 0.7 }}
        />
      ))}
    </span>
  );
}

const CONFETTI_COLORS = [
  'var(--lantern)',
  'var(--shrimp)',
  'var(--fish)',
  'var(--snack)',
  'var(--milk)',
];

function Confetti() {
  return (
    <span className="pointer-events-none absolute inset-0 overflow-visible" aria-hidden>
      {Array.from({ length: 18 }, (_, i) => (
        <motion.span
          key={i}
          className="absolute top-1/2 left-1/2 h-3 w-1.5 rounded-sm"
          style={{ background: CONFETTI_COLORS[i % CONFETTI_COLORS.length] }}
          initial={{ x: 0, y: 0, rotate: 0, opacity: 1 }}
          animate={{
            x: Math.cos((i / 18) * Math.PI * 2) * (90 + (i % 3) * 30),
            y: Math.sin((i / 18) * Math.PI * 2) * (70 + (i % 4) * 20) + 40,
            rotate: 360 + i * 40,
            opacity: 0,
          }}
          transition={{ duration: 1.1, ease: 'easeOut' }}
        />
      ))}
    </span>
  );
}
