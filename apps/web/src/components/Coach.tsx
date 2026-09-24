import { motion, useReducedMotion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { CatArt } from '../art/CatArt';
import { Button } from './ui';

/** "Auntie Meow" speech bubble for the interactive tutorial. */
export function CoachBubble({
  stepId,
  final,
  waitsForMove,
  low,
  onNext,
  onKeepPlaying,
  onHome,
}: {
  stepId: string;
  final: boolean;
  /** The player must make a move (no Next button). */
  waitsForMove: boolean;
  /** Sit lower on screen so the highlighted thing near the top stays visible. */
  low: boolean;
  onNext: () => void;
  onKeepPlaying: () => void;
  onHome: () => void;
}) {
  const { t } = useTranslation();
  const reduced = useReducedMotion() ?? false;
  return (
    <motion.aside
      key={stepId}
      role="dialog"
      aria-live="polite"
      aria-label={t('tutorial.coach')}
      className={`fixed inset-x-3 z-20 mx-auto max-w-lg rounded-3xl border-[length:var(--stroke)] border-ink bg-card p-3 text-ink shadow-2xl ${low ? 'top-[46%]' : 'top-2'}`}
      initial={reduced ? false : { y: low ? 20 : -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.25 }}
    >
      <div className="flex items-start gap-2">
        <span className="size-12 shrink-0">
          <CatArt color="calico" mood="happy" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-sm text-night-2">{t('tutorial.coach')}</p>
          <p className="leading-snug">{t(`tutorial.${stepId}`)}</p>
        </div>
      </div>
      {final ? (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Button onClick={onKeepPlaying}>{t('tutorial.keepPlaying')}</Button>
          <Button variant="secondary" onClick={onHome}>
            {t('tutorial.home')}
          </Button>
        </div>
      ) : (
        !waitsForMove && (
          <div className="mt-2 flex justify-end">
            <Button onClick={onNext}>{t('tutorial.next')}</Button>
          </div>
        )
      )}
    </motion.aside>
  );
}
