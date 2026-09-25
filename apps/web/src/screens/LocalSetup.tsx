import { BOT_DIFFICULTIES, BOT_PERSONALITIES } from '@meow/engine';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CAT_POWER } from '@meow/engine';
import { CatArt } from '../art/CatArt';
import { PowerInfo } from '../components/Mayhem';
import { ModeSwitch } from '../components/ModeSwitch';
import { Button } from '../components/ui';
import {
  catClashes,
  freeCat,
  humanCount,
  loadLocalSetup,
  type LocalPlayerSetup,
  type LocalSetup,
  MAX_LOCAL_PLAYERS,
  MIN_LOCAL_HUMANS,
  seatsFromLocalSetup,
  storeLocalSetup,
} from '../game/setup';
import { type BotSeat, CAT_COLORS, NAME_MAX_LENGTH } from '../game/types';

/** Pass-and-play setup: 2–4 seats, at least two of them humans; bots fill the rest. */
export function LocalSetupScreen({
  hasSave,
  onStart,
  onBack,
}: {
  hasSave: boolean;
  onStart: (setup: LocalSetup) => void;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const [setup, setSetup] = useState<LocalSetup>(loadLocalSetup);
  // Every seat has its own cat: preview the bots' cats, and flag humans sharing one.
  const preview = seatsFromLocalSetup(setup);
  const clashes = catClashes(setup);
  const [takenHint, setTakenHint] = useState<number | null>(null);
  /** Seat whose "bot" switch was refused (it would leave fewer than two humans). */
  const [blocked, setBlocked] = useState<number | null>(null);
  const humans = humanCount(setup);
  const setPlayer = (index: number, player: LocalPlayerSetup) => {
    setBlocked(null);
    setSetup((s) => ({ ...s, players: s.players.map((p, i) => (i === index ? player : p)) }));
  };
  // Prefer a personality that is not at the table yet.
  const newBot = (): BotSeat => ({
    personality:
      BOT_PERSONALITIES.find(
        (p) => !setup.players.some((x) => x.kind === 'bot' && x.bot.personality === p),
      ) ?? BOT_PERSONALITIES[0],
    difficulty: 'normal',
  });
  const setBot = (index: number, bot: BotSeat, patch: Partial<BotSeat>) =>
    setPlayer(index, { kind: 'bot', bot: { ...bot, ...patch } });
  /** "Player 2" — numbered among the humans, as in the game (useSeatName). */
  const humanNumber = (index: number) =>
    setup.players.slice(0, index + 1).filter((p) => p.kind === 'human').length;

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col gap-4 px-4 pt-4 pb-10">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-2xl text-lantern">{t('mode.local')}</h1>
        <Button variant="secondary" onClick={onBack}>
          {t('setup.back')}
        </Button>
      </header>
      <p className="leading-relaxed text-card/85">{t('local.intro')}</p>

      <section className="grid gap-2">
        <h2 className="font-display">
          {t('local.players', { n: setup.players.length, max: MAX_LOCAL_PLAYERS })}
        </h2>
        {setup.players.map((player, index) => {
          const cat = preview[index]!.cat;
          const takenByOthers = new Set(
            setup.players.flatMap((p, i) => (p.kind === 'human' && i !== index ? [p.cat] : [])),
          );
          const lastHumans = player.kind === 'human' && humans <= MIN_LOCAL_HUMANS;
          return (
            <div key={index} className="rounded-2xl bg-night-2 p-3">
              <div className="flex items-center gap-3">
                <span className="size-12 shrink-0">
                  <CatArt color={cat} />
                </span>
                <div
                  className="grid flex-1 grid-cols-2 gap-1.5"
                  role="radiogroup"
                  aria-label={t('local.seat', { n: index + 1 })}
                >
                  <button
                    type="button"
                    role="radio"
                    aria-checked={player.kind === 'human'}
                    onClick={() =>
                      player.kind === 'bot' &&
                      setPlayer(index, { kind: 'human', name: '', cat: freeCat(setup) })
                    }
                    className={`min-h-tap rounded-xl text-sm ${player.kind === 'human' ? 'bg-lantern text-ink' : 'bg-night text-card'}`}
                  >
                    {t('local.human')}
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={player.kind === 'bot'}
                    aria-disabled={lastHumans || undefined}
                    onClick={() => {
                      if (lastHumans) return setBlocked(index);
                      if (player.kind === 'human') setPlayer(index, { kind: 'bot', bot: newBot() });
                    }}
                    className={`min-h-tap rounded-xl text-sm ${player.kind === 'bot' ? 'bg-lantern text-ink' : 'bg-night text-card'} ${lastHumans ? 'opacity-45' : ''}`}
                  >
                    {t('local.bot')}
                  </button>
                </div>
                {setup.players.length > MIN_LOCAL_HUMANS && !lastHumans && (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setBlocked(null);
                      setSetup((s) => ({ ...s, players: s.players.filter((_, i) => i !== index) }));
                    }}
                  >
                    {t('setup.removeBot')}
                  </Button>
                )}
              </div>
              {blocked === index && (
                <p role="status" className="mt-1 text-center text-sm text-alert">
                  {t('local.needHumans', { min: MIN_LOCAL_HUMANS })}
                </p>
              )}

              {player.kind === 'human' ? (
                <div className="mt-2 grid gap-2">
                  <label className="sr-only" htmlFor={`name-${index}`}>
                    {t('local.nameOf', { n: humanNumber(index) })}
                  </label>
                  <input
                    id={`name-${index}`}
                    value={player.name}
                    maxLength={NAME_MAX_LENGTH}
                    placeholder={t('local.playerN', { n: humanNumber(index) })}
                    onChange={(e) =>
                      setPlayer(index, {
                        ...player,
                        name: e.target.value.slice(0, NAME_MAX_LENGTH),
                      })
                    }
                    className="min-h-tap rounded-2xl border-2 border-card/30 bg-night px-4 text-lg text-card placeholder:text-card/40 focus:border-lantern"
                  />
                  <div
                    className="grid grid-cols-4 gap-1.5"
                    role="radiogroup"
                    aria-label={t('setup.yourCat')}
                  >
                    {CAT_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        role="radio"
                        aria-checked={player.cat === c}
                        aria-disabled={takenByOthers.has(c) || undefined}
                        aria-label={t(`cat.${c}`)}
                        onClick={() =>
                          takenByOthers.has(c)
                            ? setTakenHint(index)
                            : (setTakenHint(null), setPlayer(index, { ...player, cat: c }))
                        }
                        className={`flex min-h-tap items-center justify-center rounded-xl p-1 ${player.cat === c ? 'bg-night ring-2 ring-lantern' : 'bg-night/50'} ${takenByOthers.has(c) ? 'opacity-30' : ''}`}
                      >
                        <span className="size-9">
                          <CatArt color={c} mood={player.cat === c ? 'happy' : 'normal'} />
                        </span>
                      </button>
                    ))}
                  </div>
                  {setup.mode.powers && <PowerInfo power={CAT_POWER[player.cat]} compact />}
                  {takenHint === index && (
                    <p role="status" className="text-xs text-alert">
                      {t('room.error.catTaken')}
                    </p>
                  )}
                </div>
              ) : (
                <div className="mt-2 grid gap-1.5">
                  <p className="text-sm leading-snug text-card/70">
                    {t(`botDesc.${player.bot.personality}`)}
                  </p>
                  <div
                    className="grid grid-cols-3 gap-1.5"
                    role="radiogroup"
                    aria-label={t('setup.personality')}
                  >
                    {BOT_PERSONALITIES.map((p) => (
                      <button
                        key={p}
                        type="button"
                        role="radio"
                        aria-checked={player.bot.personality === p}
                        onClick={() => setBot(index, player.bot, { personality: p })}
                        className={`min-h-tap rounded-xl px-1 text-sm leading-tight ${player.bot.personality === p ? 'bg-lantern text-ink' : 'bg-night text-card'}`}
                      >
                        {t(`bot.${p}`)}
                      </button>
                    ))}
                  </div>
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
                        aria-checked={player.bot.difficulty === d}
                        onClick={() => setBot(index, player.bot, { difficulty: d })}
                        className={`min-h-tap rounded-xl text-sm ${player.bot.difficulty === d ? 'bg-card text-ink' : 'bg-night text-card'}`}
                      >
                        {t(`difficulty.${d}`)}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {setup.players.length < MAX_LOCAL_PLAYERS && (
          <Button
            variant="secondary"
            onClick={() =>
              setSetup((s) => ({
                ...s,
                players: [...s.players, { kind: 'human', name: '', cat: freeCat(s) }],
              }))
            }
          >
            {t('local.addPlayer')}
          </Button>
        )}
      </section>

      <ModeSwitch mode={setup.mode} onChange={(mode) => setSetup((s) => ({ ...s, mode }))} />

      <div className="mt-auto grid gap-2">
        {hasSave && <p className="text-center text-sm text-card/70">{t('home.newGameConfirm')}</p>}
        <Button
          disabledReason={clashes.size > 0 ? t('local.catClash') : null}
          onClick={() => {
            storeLocalSetup(setup);
            onStart(setup);
          }}
        >
          {t('setup.start')}
        </Button>
      </div>
    </main>
  );
}
