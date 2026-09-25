import type { PlayerId } from '@meow/engine';
import { EMOTES, type EmoteId } from '@meow/protocol';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { playSound } from '../audio/sound';
import { useTranslation } from 'react-i18next';
import { CatArt, type CatMood } from '../art/CatArt';
import type { OnlineExtras, SeatInfo } from '../game/types';
import { Modal } from './ui';

/** Each sticker is a cat face plus a short line (docs/ART_DIRECTION.md › สติกเกอร์). */
const EMOTE_MOOD: Record<EmoteId, CatMood> = {
  meow: 'normal',
  yay: 'happy',
  yum: 'full',
  wow: 'shocked',
  oops: 'shocked',
  hurry: 'normal',
  thanks: 'happy',
  gg: 'happy',
};

/** Seconds left on the clock that matters to this screen: ours first, else whoever we wait on. */
export function TurnTimer({
  clocks,
  viewer,
  name,
}: {
  clocks: OnlineExtras['clocks'];
  viewer: PlayerId | null;
  name: (id: PlayerId) => string;
}) {
  const [now, setNow] = useState(() => Date.now());
  const timed = clocks.filter((c) => c.deadline !== null);
  const clock = timed.find((c) => c.playerId === viewer) ?? timed[0];
  useEffect(() => {
    if (!clock) return;
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, [clock]);
  if (!clock || clock.deadline === null) return null;
  const seconds = Math.max(0, Math.ceil((clock.deadline - now) / 1000));
  const mine = clock.playerId === viewer;
  const urgent = seconds <= 10;
  return <TimerText seconds={seconds} mine={mine} urgent={urgent} name={name(clock.playerId)} />;
}

/** Ticks once a second through your own last 5 seconds. */
function TimerText({
  seconds,
  mine,
  urgent,
  name,
}: {
  seconds: number;
  mine: boolean;
  urgent: boolean;
  name: string;
}) {
  const { t } = useTranslation();
  const ticked = useRef<number | null>(null);
  useEffect(() => {
    if (!mine || seconds > 5 || seconds === 0 || ticked.current === seconds) return;
    ticked.current = seconds;
    playSound('tick');
  }, [mine, seconds]);
  return (
    <p
      className={`text-center text-xs ${urgent ? 'font-display text-alert' : 'text-card/75'}`}
      aria-live={urgent && mine ? 'assertive' : 'off'}
    >
      {mine ? t('online.timeLeft', { seconds }) : t('online.timeLeftOf', { name, seconds })}
    </p>
  );
}

/** Sticker picker: a fixed set of cat faces, no free text. */
export function EmotePicker({
  cat,
  onPick,
  onClose,
}: {
  cat: SeatInfo['cat'];
  onPick: (id: EmoteId) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Modal title={t('emote.title')} onClose={onClose} closeLabel={t('action.close')}>
      <div className="grid grid-cols-4 gap-2">
        {EMOTES.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              onPick(id);
              onClose();
            }}
            className="flex min-h-tap flex-col items-center gap-1 rounded-2xl bg-night p-2 hover:ring-2 hover:ring-lantern"
          >
            <span className="size-10">
              <CatArt color={cat} mood={EMOTE_MOOD[id]} />
            </span>
            <span className="text-xs leading-tight">{t(`emote.${id}`)}</span>
          </button>
        ))}
      </div>
    </Modal>
  );
}

/** Stickers others just sent, floating over the top of the table. */
export function EmoteToasts({
  emotes,
  seats,
  name,
}: {
  emotes: OnlineExtras['emotes'];
  seats: readonly SeatInfo[];
  name: (id: PlayerId) => string;
}) {
  const { t } = useTranslation();
  const reduced = useReducedMotion() ?? false;
  // A pop for each sticker as it arrives.
  const lastKey = useRef(emotes.at(-1)?.key ?? 0);
  useEffect(() => {
    const newest = emotes.at(-1)?.key ?? 0;
    if (newest > lastKey.current) playSound('pop');
    lastKey.current = Math.max(lastKey.current, newest);
  }, [emotes]);
  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-16 z-40 flex flex-col items-center gap-1.5 px-4"
      aria-live="polite"
    >
      <AnimatePresence>
        {emotes.map((emote) => {
          const seat = seats.find((s) => s.id === emote.from);
          return (
            <motion.div
              key={emote.key}
              initial={reduced ? false : { opacity: 0, y: -12, scale: 0.8 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-2 rounded-full border-[length:var(--stroke)] border-ink bg-card py-1 pr-4 pl-1 text-ink shadow-lg"
            >
              <span className="size-9">
                {seat && <CatArt color={seat.cat} mood={EMOTE_MOOD[emote.id]} />}
              </span>
              <span className="font-display text-sm">
                {t('emote.said', { name: name(emote.from), text: t(`emote.${emote.id}`) })}
              </span>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
