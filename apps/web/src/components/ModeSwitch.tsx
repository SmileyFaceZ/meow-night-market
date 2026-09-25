import { CLASSIC_MODE, type GameMode, MAYHEM_MODE } from '@meow/protocol';
import { useTranslation } from 'react-i18next';
import { modeName } from '../game/mode';
import { Switch } from './ui';

/**
 * Classic / Market Mayhem in one tap, or cat powers and market events one by one.
 * Without `onChange` it only shows the rules (a guest in an online room).
 */
export function ModeSwitch({
  mode,
  onChange,
}: {
  mode: GameMode;
  onChange?: ((mode: GameMode) => void) | undefined;
}) {
  const { t } = useTranslation();
  const name = modeName(mode);
  if (!onChange) {
    return (
      <section className="grid gap-1">
        <h2 className="font-display">{t('mode.title')}</h2>
        <p className="text-sm text-card/80">{t(`modeName.${name}`)}</p>
      </section>
    );
  }
  const preset = (label: 'classic' | 'chaos', value: GameMode) => (
    <button
      type="button"
      role="radio"
      aria-checked={name === label}
      onClick={() => onChange(value)}
      className={`min-h-tap rounded-xl px-2 font-display text-sm ${name === label ? 'bg-lantern text-ink' : 'bg-night-2 text-card'}`}
    >
      {t(`mode.${label}`)}
    </button>
  );
  return (
    <section className="grid gap-1.5">
      <h2 className="font-display">{t('mode.title')}</h2>
      <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label={t('mode.title')}>
        {preset('classic', CLASSIC_MODE)}
        {preset('chaos', MAYHEM_MODE)}
      </div>
      <Switch
        label={t('term.power')}
        hint={t('mode.powersHint')}
        checked={mode.powers}
        onChange={(powers) => onChange({ ...mode, powers })}
      />
      <Switch
        label={t('term.event')}
        hint={t('mode.eventsHint')}
        checked={mode.events}
        onChange={(events) => onChange({ ...mode, events })}
      />
    </section>
  );
}
