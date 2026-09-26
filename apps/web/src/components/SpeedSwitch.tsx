import { GAME_SPEEDS, type GameSpeed } from '@meow/protocol';
import { useTranslation } from 'react-i18next';

/**
 * Slow / normal / fast (DECISIONS 051). Without `onChange` it only shows the speed
 * (online guests: the host picks it).
 */
export function SpeedSwitch({
  speed,
  onChange,
}: {
  speed: GameSpeed;
  onChange?: ((speed: GameSpeed) => void) | undefined;
}) {
  const { t } = useTranslation();
  if (!onChange) {
    return (
      <section className="grid gap-1">
        <h2 className="font-display">{t('speed.title')}</h2>
        <p className="text-sm text-card/80">
          {t(`speed.${speed}`)} · {t('speed.hostPicks')}
        </p>
      </section>
    );
  }
  return (
    <section className="grid gap-1.5">
      <h2 className="font-display">{t('speed.title')}</h2>
      <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label={t('speed.title')}>
        {GAME_SPEEDS.map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={speed === s}
            onClick={() => onChange(s)}
            className={`min-h-tap rounded-xl font-display text-sm ${speed === s ? 'bg-lantern text-ink' : 'bg-night-2 text-card'}`}
          >
            {t(`speed.${s}`)}
          </button>
        ))}
      </div>
      <p className="text-xs text-card/70">{t('speed.hint')}</p>
    </section>
  );
}
