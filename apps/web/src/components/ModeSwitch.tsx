import { CLASSIC_MODE, type GameMode, MAYHEM_MODE } from '@meow/protocol';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { hasSeenMayhemIntro, markMayhemIntroSeen } from '../game/mayhemIntro';
import { modeName } from '../game/mode';
import { MayhemIntro } from './MayhemIntro';
import { Button, Switch } from './ui';

/**
 * Classic / Market Mayhem in one tap, or cat powers and market events one by one.
 * Without `onChange` it only shows the rules (a guest in an online room).
 * The first time any Mayhem rule is on (chosen here, or the room's host chose it), the
 * two-page intro opens once; "What is Market Mayhem?" opens it again.
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
  const mayhemOn = mode.powers || mode.events;
  const [seen, setSeen] = useState(hasSeenMayhemIntro);
  const [reopened, setReopened] = useState(false);
  const intro =
    reopened || (mayhemOn && !seen) ? (
      <MayhemIntro
        onClose={() => {
          markMayhemIntroSeen();
          setSeen(true);
          setReopened(false);
        }}
      />
    ) : null;
  const explain = mayhemOn && (
    <Button variant="ghost" onClick={() => setReopened(true)}>
      {t('intro.open')}
    </Button>
  );
  if (!onChange) {
    return (
      <section className="grid gap-1">
        <h2 className="font-display">{t('mode.title')}</h2>
        <p className="text-sm text-card/80">{t(`modeName.${name}`)}</p>
        {explain}
        {intro}
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
      {explain}
      {intro}
    </section>
  );
}
