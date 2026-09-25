import type { PlayerView } from '@meow/engine';
import { motion, useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CatArt } from '../art/CatArt';
import type { SeatInfo } from '../game/types';
import { Button } from './ui';

/**
 * The "ready" button wakes up after this pause, so the tap that ended the last
 * player's move cannot also pass the cover by accident.
 */
export const HANDOFF_GUARD_MS = 700;

/**
 * Pass-and-play cover (docs/ROADMAP.md › เฟส 5): hides the board until the named
 * player has the device. Opaque on purpose — nothing of the previous view shows through.
 */
export function HandoffCover({
  seat,
  name,
  phase,
  onReady,
  onQuit,
}: {
  seat: SeatInfo;
  name: string;
  phase: PlayerView['phase'];
  onReady: () => void;
  onQuit: () => void;
}) {
  const { t } = useTranslation();
  const reduced = useReducedMotion() ?? false;
  const [armed, setArmed] = useState(false);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setArmed(true), HANDOFF_GUARD_MS);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (armed) button.current?.focus();
  }, [armed]);

  const secret = phase === 'bidding' || phase === 'discard';
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="handoff-title"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-night px-6 text-center"
    >
      <motion.span
        className="size-36"
        initial={reduced ? false : { y: 24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.35 }}
      >
        <CatArt color={seat.cat} mood="happy" />
      </motion.span>
      <h1 id="handoff-title" className="font-display text-3xl leading-snug text-lantern">
        {t('handoff.title', { name })}
      </h1>
      <p className="max-w-xs text-lg leading-relaxed text-card">
        {t(`handoff.${phase}`, { name })}
      </p>
      {secret && (
        <p className="rounded-2xl bg-night-2 px-4 py-2 text-sm text-card/85">
          {t('handoff.noPeeking')}
        </p>
      )}
      <div className="grid w-full max-w-xs gap-2">
        <Button
          ref={button}
          className="w-full"
          disabledReason={armed ? null : t('handoff.wait')}
          onClick={onReady}
        >
          {t('handoff.ready', { name })}
        </Button>
        <Button variant="ghost" onClick={onQuit}>
          {t('action.quit')}
        </Button>
      </div>
    </div>
  );
}
