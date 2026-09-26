import { BOT_DIFFICULTIES, BOT_PERSONALITIES, type BotDifficulty } from '@meow/engine';
import { MAX_SEATS, type RoomInfo, TURN_SECONDS_OPTIONS } from '@meow/protocol';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { RemoteController } from '../game/online';
import { DEFAULT_SPEED } from '@meow/protocol';
import { ModeSwitch } from './ModeSwitch';
import { SpeedSwitch } from './SpeedSwitch';

/** Room settings between games: bots and the turn timer (the host changes them). */
export function RoomSettings({
  controller,
  room,
  isHost,
}: {
  controller: RemoteController;
  room: RoomInfo;
  isHost: boolean;
}) {
  const { t } = useTranslation();
  const [difficulty, setDifficulty] = useState<BotDifficulty>('normal');
  return (
    <>
      <ModeSwitch
        mode={room.mode}
        onChange={isHost ? (mode) => controller.send({ type: 'setMode', ...mode }) : undefined}
      />
      <SpeedSwitch
        speed={room.speed ?? DEFAULT_SPEED}
        onChange={isHost ? (speed) => controller.send({ type: 'setSpeed', speed }) : undefined}
      />
      {isHost && room.seats.length < MAX_SEATS && (
        <section className="grid gap-1.5">
          <h2 className="font-display">{t('lobby.addBot')}</h2>
          <div className="grid grid-cols-3 gap-1.5">
            {BOT_PERSONALITIES.map((personality) => (
              <button
                key={personality}
                type="button"
                onClick={() =>
                  controller.send({ type: 'addBot', bot: { personality, difficulty } })
                }
                className="min-h-tap rounded-xl border-2 border-card/30 bg-night-2 px-1 text-sm leading-tight hover:border-lantern"
              >
                {t(`bot.${personality}`)}
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
                aria-checked={difficulty === d}
                onClick={() => setDifficulty(d)}
                className={`min-h-tap rounded-xl text-sm ${difficulty === d ? 'bg-card text-ink' : 'bg-night-2 text-card'}`}
              >
                {t(`difficulty.${d}`)}
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="grid gap-1.5">
        <h2 className="font-display">{t('lobby.timer')}</h2>
        {isHost ? (
          <div className="grid grid-cols-5 gap-1.5" role="radiogroup" aria-label={t('lobby.timer')}>
            {TURN_SECONDS_OPTIONS.map((seconds) => (
              <button
                key={seconds}
                type="button"
                role="radio"
                aria-checked={room.turnSeconds === seconds}
                onClick={() => controller.send({ type: 'setTurnSeconds', seconds })}
                className={`min-h-tap rounded-xl text-sm ${room.turnSeconds === seconds ? 'bg-lantern text-ink' : 'bg-night-2 text-card'}`}
              >
                {seconds === 0 ? t('lobby.timerOff') : t('lobby.seconds', { seconds })}
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-card/80">
            {room.turnSeconds
              ? t('lobby.timerIs', { seconds: room.turnSeconds })
              : t('lobby.timerOff')}
          </p>
        )}
      </section>
    </>
  );
}
