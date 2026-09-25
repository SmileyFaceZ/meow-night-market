import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { soundStore } from '../audio/settings';
import { playSound } from '../audio/sound';
import { useSoundSettings } from '../audio/useSoundSettings';
import { Button, Modal } from './ui';

/** Speaker drawn for this game; crossed out when sound is off. */
function SpeakerIcon({ muted }: { muted: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden fill="none" stroke="currentColor">
      <path
        d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"
        fill="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      {muted ? (
        <path d="M16 9.5l5 5m0-5l-5 5" strokeWidth="2" strokeLinecap="round" />
      ) : (
        <>
          <path d="M15.5 9a4 4 0 0 1 0 6" strokeWidth="2" strokeLinecap="round" />
          <path d="M18 6.5a7.5 7.5 0 0 1 0 11" strokeWidth="2" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}

/** A labelled on/off switch (≥ 44px tall). */
function Toggle({
  label,
  hint,
  checked,
  disabled = false,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (on: boolean) => void;
}) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-disabled={disabled || undefined}
      // the switch plays its own sample instead of the generic tap
      data-sound="none"
      onClick={() => !disabled && onChange(!checked)}
      className={`flex min-h-tap w-full items-center justify-between gap-3 rounded-2xl bg-night px-3 py-2 text-left ${disabled ? 'opacity-45' : ''}`}
    >
      <span className="min-w-0">
        <span className="block font-display leading-tight">{label}</span>
        {hint && <span className="block text-xs leading-tight text-card/70">{hint}</span>}
      </span>
      <span className="flex shrink-0 items-center gap-2 text-sm text-card/80">
        {checked ? t('sound.on') : t('sound.off')}
        <span
          aria-hidden
          className={`relative h-7 w-12 rounded-full transition ${checked ? 'bg-lantern' : 'bg-card/25'}`}
        >
          <span
            className={`absolute top-1 size-5 rounded-full bg-card shadow transition-all ${checked ? 'left-6' : 'left-1'}`}
          />
        </span>
      </span>
    </button>
  );
}

/** All sound settings; changes apply (and are saved) immediately. */
export function SoundPanel() {
  const { t } = useTranslation();
  const settings = useSoundSettings();
  const off = !settings.enabled;
  const percent = Math.round(settings.volume * 100);
  return (
    <div className="grid gap-2">
      <Toggle
        label={t('sound.master')}
        checked={settings.enabled}
        onChange={(enabled) => {
          soundStore.set({ enabled });
          if (enabled) playSound('turn');
        }}
      />
      <label
        className={`grid gap-1 rounded-2xl bg-night px-3 py-2 ${off ? 'opacity-45' : ''}`}
        htmlFor="sound-volume"
      >
        <span className="flex items-center justify-between font-display">
          {t('sound.volume')}
          <span className="text-sm text-card/80">{percent}%</span>
        </span>
        <input
          id="sound-volume"
          type="range"
          min={0}
          max={100}
          step={5}
          value={percent}
          disabled={off}
          data-sound="none"
          onChange={(e) => soundStore.set({ volume: Number(e.target.value) / 100 })}
          // a sample at the new level once the thumb is let go
          onPointerUp={() => playSound('meow')}
          onKeyUp={() => playSound('meow')}
          className="h-tap w-full cursor-pointer accent-lantern"
        />
      </label>
      <Toggle
        label={t('sound.clicks')}
        hint={t('sound.clicksHint')}
        checked={settings.clicks}
        disabled={off}
        onChange={(clicks) => {
          soundStore.set({ clicks });
          if (clicks) playSound('click');
        }}
      />
      <Toggle
        label={t('sound.effects')}
        hint={t('sound.effectsHint')}
        checked={settings.effects}
        disabled={off}
        onChange={(effects) => {
          soundStore.set({ effects });
          if (effects) playSound('eat');
        }}
      />
      <p className="px-1 text-xs text-card/65">{t('sound.note')}</p>
    </div>
  );
}

/** Speaker button that opens the sound settings. */
export function SoundButton({ withLabel = false }: { withLabel?: boolean }) {
  const { t } = useTranslation();
  const settings = useSoundSettings();
  const [open, setOpen] = useState(false);
  const muted = !settings.enabled || settings.volume === 0;
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)} ariaLabel={t('sound.title')}>
        <span className="flex items-center gap-1.5">
          <SpeakerIcon muted={muted} />
          {withLabel && t('sound.short')}
        </span>
      </Button>
      {open && (
        <Modal
          title={t('sound.title')}
          onClose={() => setOpen(false)}
          closeLabel={t('action.close')}
        >
          <SoundPanel />
        </Modal>
      )}
    </>
  );
}
