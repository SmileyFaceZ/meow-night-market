import { BOT_DIFFICULTIES, type BotDifficulty } from '@meow/engine';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CatArt } from '../art/CatArt';
import { CatPicker } from '../components/CatPicker';
import { ModeSwitch } from '../components/ModeSwitch';
import { SpeedSwitch } from '../components/SpeedSwitch';
import { speedStore, useLocalSpeed } from '../game/speed';
import { Button } from '../components/ui';
import { useSeatName } from '../game/hooks';
import {
  loadSetup,
  newBot,
  seatsFromSetup,
  type SoloSetup,
  soloTakeCat,
  storeSetup,
} from '../game/setup';
import { NAME_MAX_LENGTH } from '../game/types';

export function SetupScreen({
  hasSave,
  onStart,
  onBack,
}: {
  hasSave: boolean;
  onStart: (setup: SoloSetup) => void;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const speed = useLocalSpeed();
  const [setup, setSetup] = useState<SoloSetup>(loadSetup);
  const update = (patch: Partial<SoloSetup>) => setSetup((s) => ({ ...s, ...patch }));
  // Bots take other cats than the player's (every seat its own cat).
  const preview = seatsFromSetup(setup);
  const seatName = useSeatName(preview);
  const [botDifficulty, setBotDifficulty] = useState<BotDifficulty>('normal');

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col gap-5 px-4 pt-4 pb-10">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-2xl text-lantern">{t('setup.title')}</h1>
        <Button variant="secondary" onClick={onBack}>
          {t('setup.back')}
        </Button>
      </header>

      <section className="grid gap-2">
        <label htmlFor="nickname" className="font-display">
          {t('setup.yourName')}
        </label>
        <input
          id="nickname"
          value={setup.name}
          maxLength={NAME_MAX_LENGTH}
          placeholder={t('setup.namePlaceholder')}
          onChange={(e) => update({ name: e.target.value.slice(0, NAME_MAX_LENGTH) })}
          className="min-h-tap rounded-2xl border-2 border-card/30 bg-night-2 px-4 text-lg text-card placeholder:text-card/40 focus:border-lantern"
          aria-describedby="nickname-hint"
        />
        <p id="nickname-hint" className="text-sm text-card/60">
          {t('setup.nameHint', { max: NAME_MAX_LENGTH })}
        </p>
      </section>

      {/* The table, like an online waiting room (DECISIONS 052). */}
      <section className="grid gap-2" aria-label={t('lobby.seats')}>
        <h2 className="font-display">{t('lobby.seatsCount', { n: preview.length, max: 4 })}</h2>
        {preview.map((seat, index) => (
          <div key={seat.id} className="flex items-center gap-3 rounded-2xl bg-night-2 p-2">
            <span className="size-11 shrink-0">
              <CatArt color={seat.cat} mood={seat.bot ? 'normal' : 'happy'} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-display leading-tight">
                {seatName(seat.id)}
                {!seat.bot && ` (${t('term.you')})`}
              </p>
              <p className="text-xs text-card/70">
                {seat.bot
                  ? `${t(`difficulty.${seat.bot.difficulty}`)} · ${t(`botDesc.${seat.bot.personality}`)}`
                  : '\u00a0'}
              </p>
            </div>
            {seat.bot && setup.bots.length > 1 && (
              <Button
                variant="ghost"
                onClick={() => update({ bots: setup.bots.filter((_, i) => i !== index - 1) })}
              >
                {t('setup.removeBot')}
              </Button>
            )}
          </div>
        ))}
      </section>

      <section className="grid gap-1.5">
        <h2 className="font-display">{t('cats.title')}</h2>
        <CatPicker
          value={setup.cat}
          holders={Object.fromEntries(
            preview.filter((s) => s.bot).map((s) => [s.cat, { name: seatName(s.id), bot: true }]),
          )}
          powers={setup.mode.powers}
          onPick={(cat) => setSetup((s) => soloTakeCat(s, cat))}
        />
      </section>

      <ModeSwitch mode={setup.mode} onChange={(mode) => update({ mode })} />
      <SpeedSwitch speed={speed} onChange={speedStore.set} />

      {setup.bots.length < 3 && (
        <section className="grid gap-1.5">
          <h2 className="font-display">{t('lobby.addBot')}</h2>
          <p className="text-xs text-card/70">{t('lobby.botRandom')}</p>
          <div
            className="grid grid-cols-2 gap-1.5"
            role="radiogroup"
            aria-label={t('setup.difficulty')}
          >
            {BOT_DIFFICULTIES.map((d) => (
              <button
                key={d}
                type="button"
                role="radio"
                aria-checked={botDifficulty === d}
                onClick={() => setBotDifficulty(d)}
                className={`min-h-tap rounded-xl text-sm ${botDifficulty === d ? 'bg-card text-ink' : 'bg-night-2 text-card'}`}
              >
                {t(`difficulty.${d}`)}
              </button>
            ))}
          </div>
          <Button
            variant="secondary"
            onClick={() =>
              update({
                bots: [
                  ...setup.bots,
                  newBot(
                    botDifficulty,
                    preview.map((s) => s.cat),
                  ),
                ],
              })
            }
          >
            {t('lobby.addBotButton')}
          </Button>
        </section>
      )}

      <div className="mt-auto grid gap-2">
        {hasSave && <p className="text-center text-sm text-card/70">{t('home.newGameConfirm')}</p>}
        <Button
          onClick={() => {
            storeSetup(setup);
            onStart(setup);
          }}
        >
          {t('setup.start')}
        </Button>
      </div>
    </main>
  );
}
