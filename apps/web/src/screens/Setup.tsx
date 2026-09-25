import { BOT_DIFFICULTIES, BOT_PERSONALITIES } from '@meow/engine';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CatArt } from '../art/CatArt';
import { ModeSwitch } from '../components/ModeSwitch';
import { Button } from '../components/ui';
import { loadSetup, seatsFromSetup, type SoloSetup, storeSetup } from '../game/setup';
import { type BotSeat, CAT_COLORS, NAME_MAX_LENGTH } from '../game/types';

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
  const [setup, setSetup] = useState<SoloSetup>(loadSetup);
  const update = (patch: Partial<SoloSetup>) => setSetup((s) => ({ ...s, ...patch }));
  // Bots take other cats than the player's (every seat its own cat).
  const preview = seatsFromSetup(setup);
  const setBot = (index: number, patch: Partial<BotSeat>) =>
    update({ bots: setup.bots.map((b, i) => (i === index ? { ...b, ...patch } : b)) });

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

      <section>
        <h2 className="mb-2 font-display">{t('setup.yourCat')}</h2>
        <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label={t('setup.yourCat')}>
          {CAT_COLORS.map((cat) => (
            <button
              key={cat}
              type="button"
              role="radio"
              aria-checked={setup.cat === cat}
              aria-label={t(`cat.${cat}`)}
              onClick={() => update({ cat })}
              className={`flex min-h-tap flex-col items-center rounded-2xl p-2 ${setup.cat === cat ? 'bg-night-2 ring-2 ring-lantern' : 'bg-night-2/50'}`}
            >
              <span className="size-14">
                <CatArt color={cat} mood={setup.cat === cat ? 'happy' : 'normal'} />
              </span>
              <span className="text-xs">{t(`cat.${cat}`)}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="grid gap-2">
        <h2 className="font-display">{t('setup.opponents', { count: setup.bots.length })}</h2>
        {setup.mode.powers && <p className="text-sm text-card/70">{t('setup.botCatsRandom')}</p>}
        {setup.bots.map((bot, index) => (
          <div key={index} className="rounded-2xl bg-night-2 p-3">
            <div className="flex items-center gap-3">
              <span className="size-12 shrink-0">
                <CatArt color={preview[index + 1]!.cat} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-display leading-tight">{t(`bot.${bot.personality}`)}</p>
                <p className="text-sm leading-snug text-card/70">
                  {t(`botDesc.${bot.personality}`)}
                </p>
              </div>
              {setup.bots.length > 1 && (
                <Button
                  variant="ghost"
                  onClick={() => update({ bots: setup.bots.filter((_, i) => i !== index) })}
                >
                  {t('setup.removeBot')}
                </Button>
              )}
            </div>
            <div
              className="mt-2 grid grid-cols-3 gap-1.5"
              role="radiogroup"
              aria-label={t('setup.personality')}
            >
              {BOT_PERSONALITIES.map((p) => (
                <button
                  key={p}
                  type="button"
                  role="radio"
                  aria-checked={bot.personality === p}
                  onClick={() => setBot(index, { personality: p })}
                  className={`min-h-tap rounded-xl px-1 text-sm leading-tight ${bot.personality === p ? 'bg-lantern text-ink' : 'bg-night text-card'}`}
                >
                  {t(`bot.${p}`)}
                </button>
              ))}
            </div>
            <div
              className="mt-1.5 grid grid-cols-2 gap-1.5"
              role="radiogroup"
              aria-label={t('setup.difficulty')}
            >
              {BOT_DIFFICULTIES.map((d) => (
                <button
                  key={d}
                  type="button"
                  role="radio"
                  aria-checked={bot.difficulty === d}
                  onClick={() => setBot(index, { difficulty: d })}
                  className={`min-h-tap rounded-xl text-sm ${bot.difficulty === d ? 'bg-card text-ink' : 'bg-night text-card'}`}
                >
                  {t(`difficulty.${d}`)}
                </button>
              ))}
            </div>
          </div>
        ))}
        {setup.bots.length < 3 && (
          <Button
            variant="secondary"
            onClick={() =>
              update({
                bots: [
                  ...setup.bots,
                  {
                    // Prefer a personality that is not at the table yet.
                    personality:
                      BOT_PERSONALITIES.find((p) => !setup.bots.some((b) => b.personality === p)) ??
                      BOT_PERSONALITIES[0],
                    difficulty: 'normal',
                  },
                ],
              })
            }
          >
            {t('setup.addBot')}
          </Button>
        )}
      </section>

      <ModeSwitch mode={setup.mode} onChange={(mode) => update({ mode })} />

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
