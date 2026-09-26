import { BOT_DIFFICULTIES, type BotDifficulty } from '@meow/engine';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CatArt } from '../art/CatArt';
import { CatPicker } from '../components/CatPicker';
import { ModeSwitch } from '../components/ModeSwitch';
import { SpeedSwitch } from '../components/SpeedSwitch';
import { speedStore, useLocalSpeed } from '../game/speed';
import { Button, Modal } from '../components/ui';
import { useSeatName } from '../game/hooks';
import {
  catClashes,
  humanCount,
  loadLocalSetup,
  localTakeCat,
  localTakenCats,
  type LocalPlayerSetup,
  type LocalSetup,
  MAX_LOCAL_PLAYERS,
  MIN_LOCAL_HUMANS,
  newBot,
  randomFreeCat,
  seatsFromLocalSetup,
  storeLocalSetup,
} from '../game/setup';
import { NAME_MAX_LENGTH } from '../game/types';

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
  const speed = useLocalSpeed();
  const [setup, setSetup] = useState<LocalSetup>(loadLocalSetup);
  // Every seat has its own cat: preview the bots' cats, and flag humans sharing one.
  const preview = seatsFromLocalSetup(setup);
  const clashes = catClashes(setup);
  /** Seat whose cat picker is open. */
  const [picking, setPicking] = useState<number | null>(null);
  const [botDifficulty, setBotDifficulty] = useState<BotDifficulty>('normal');
  const humans = humanCount(setup);
  const seatName = useSeatName(preview);
  const taken = preview.map((s) => s.cat);
  /** "Player 2" — numbered among the humans, as in the game (useSeatName). */
  const humanNumber = (index: number) =>
    setup.players.slice(0, index + 1).filter((p) => p.kind === 'human').length;
  const setPlayer = (index: number, player: LocalPlayerSetup) =>
    setSetup((s) => ({ ...s, players: s.players.map((p, i) => (i === index ? player : p)) }));
  const removable = (player: LocalPlayerSetup) =>
    setup.players.length > MIN_LOCAL_HUMANS && (player.kind === 'bot' || humans > MIN_LOCAL_HUMANS);
  const full = setup.players.length >= MAX_LOCAL_PLAYERS;

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col gap-4 px-4 pt-4 pb-10">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-2xl text-lantern">{t('mode.local')}</h1>
        <Button variant="secondary" onClick={onBack}>
          {t('setup.back')}
        </Button>
      </header>
      <p className="leading-relaxed text-card/85">{t('local.intro')}</p>

      {/* The table, like an online waiting room (DECISIONS 052). */}
      <section className="grid gap-2">
        <h2 className="font-display">
          {t('local.players', { n: setup.players.length, max: MAX_LOCAL_PLAYERS })}
        </h2>
        {setup.players.map((player, index) => {
          const seat = preview[index]!;
          return (
            <div key={index} className="grid gap-2 rounded-2xl bg-night-2 p-2">
              <div className="flex items-center gap-3">
                <span className="size-11 shrink-0">
                  <CatArt color={seat.cat} mood={player.kind === 'human' ? 'happy' : 'normal'} />
                </span>
                <div className="min-w-0 flex-1">
                  {player.kind === 'human' ? (
                    <>
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
                        className="min-h-tap w-full rounded-xl border-2 border-card/30 bg-night px-3 text-base text-card placeholder:text-card/40 focus:border-lantern"
                      />
                    </>
                  ) : (
                    <>
                      <p className="truncate font-display leading-tight">{seatName(seat.id)}</p>
                      <p className="text-xs text-card/70">
                        {t(`difficulty.${player.bot.difficulty}`)} ·{' '}
                        {t(`botDesc.${player.bot.personality}`)}
                      </p>
                    </>
                  )}
                </div>
                {removable(player) && (
                  <Button
                    variant="ghost"
                    onClick={() =>
                      setSetup((s) => ({ ...s, players: s.players.filter((_, i) => i !== index) }))
                    }
                  >
                    {t('setup.removeBot')}
                  </Button>
                )}
              </div>
              {player.kind === 'human' && (
                <Button variant="secondary" onClick={() => setPicking(index)}>
                  {t('cats.change')} · {t(`cat.${seat.cat}`)}
                </Button>
              )}
            </div>
          );
        })}
        {!full && (
          <Button
            variant="secondary"
            onClick={() =>
              setSetup((s) => ({
                ...s,
                players: [
                  ...s.players,
                  { kind: 'human', name: '', cat: randomFreeCat(localTakenCats(s), Math.random) },
                ],
              }))
            }
          >
            {t('local.addPlayer')}
          </Button>
        )}
      </section>

      {picking !== null && setup.players[picking]?.kind === 'human' && (
        <Modal
          title={t('cats.pickFor', { name: seatName(preview[picking]!.id) })}
          onClose={() => setPicking(null)}
          closeLabel={t('action.close')}
        >
          <CatPicker
            value={preview[picking]!.cat}
            holders={Object.fromEntries(
              preview
                .filter((_, i) => i !== picking)
                .map((s) => [s.cat, { name: seatName(s.id), bot: s.bot !== null }]),
            )}
            powers={setup.mode.powers}
            onPick={(cat) => {
              const next = localTakeCat(setup, picking, cat);
              if (next) setSetup(next);
            }}
          />
        </Modal>
      )}

      <ModeSwitch mode={setup.mode} onChange={(mode) => setSetup((s) => ({ ...s, mode }))} />
      <SpeedSwitch speed={speed} onChange={speedStore.set} />

      {!full && (
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
            onClick={() => {
              const { cat, ...bot } = newBot(botDifficulty, taken);
              setSetup((s) => ({ ...s, players: [...s.players, { kind: 'bot', bot, cat }] }));
            }}
          >
            {t('lobby.addBotButton')}
          </Button>
        </section>
      )}

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
