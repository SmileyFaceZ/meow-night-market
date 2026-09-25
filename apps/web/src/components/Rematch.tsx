import { MIN_SEATS_TO_START, type RoomInfo, type RoomSeat } from '@meow/protocol';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CatArt } from '../art/CatArt';
import { useSeatName } from '../game/hooks';
import type { Profile, RemoteController } from '../game/online';
import { CAT_COLORS } from '../game/types';
import { RoomSettings } from './RoomSettings';
import { Button, Modal } from './ui';

// "Play again" online (GAME_RULES §13): everyone marks themselves ready; the host starts
// once 2+ seats are ready, and whoever is not ready watches that game from the sidelines.

/** Games won in this room, per person (resets when the room is deleted). */
export function RoomScore({ seats }: { seats: readonly RoomSeat[] }) {
  const { t } = useTranslation();
  const name = useSeatName(seats);
  const best = Math.max(0, ...seats.map((s) => s.wins));
  return (
    <section
      aria-label={t('rematch.score')}
      className="flex flex-wrap items-center justify-center gap-1.5 rounded-2xl bg-night-2/70 px-2 py-1.5 text-sm"
    >
      <span className="font-display text-lantern">{t('rematch.score')}</span>
      {seats.map((s) => (
        <span
          key={s.id}
          className={`flex items-center gap-1 rounded-full px-2 py-0.5 ${best > 0 && s.wins === best ? 'bg-lantern text-ink' : 'bg-night text-card'}`}
        >
          <span className="size-5">
            <CatArt color={s.cat} mood={best > 0 && s.wins === best ? 'happy' : 'normal'} />
          </span>
          <span className="max-w-[6rem] truncate">{name(s.id)}</span>
          <span className="font-display">{s.wins}</span>
        </span>
      ))}
    </section>
  );
}

export function RematchPanel({
  controller,
  room,
  profile,
}: {
  controller: RemoteController;
  room: RoomInfo;
  profile: Profile;
}) {
  const { t } = useTranslation();
  const name = useSeatName(room.seats);
  const [confirming, setConfirming] = useState(false);
  const [settings, setSettings] = useState(false);
  const me = room.seats.find((s) => s.id === room.you);
  const isHost = me?.host ?? false;
  // The host starting counts as ready; bots always are.
  const plays = (s: RoomSeat) => Boolean(s.bot) || (s.connected && (s.ready || s.id === me?.id));
  const readyCount = isHost ? room.seats.filter(plays).length : 0;
  const sittingOut = room.seats.filter((s) => s.connected && !plays(s));
  const start = () => {
    setConfirming(false);
    controller.send({ type: 'start' });
  };

  return (
    <section className="grid gap-2 rounded-3xl bg-night-2 p-3" aria-label={t('rematch.title')}>
      <h2 className="text-center font-display text-lg text-lantern">{t('rematch.title')}</h2>
      <ul className="grid gap-1">
        {room.seats.map((s) => (
          <li key={s.id} className="flex items-center gap-2 rounded-xl bg-night px-2 py-1">
            <span className={`size-8 shrink-0 ${s.connected ? '' : 'opacity-50 grayscale'}`}>
              <CatArt color={s.cat} mood={s.ready ? 'happy' : 'normal'} />
            </span>
            <span className="min-w-0 flex-1 truncate">
              {name(s.id)}
              {s.id === room.you && ` (${t('term.you')})`}
            </span>
            <span
              className={`shrink-0 text-sm ${s.ready ? 'font-display text-lantern' : 'text-card/60'}`}
            >
              {!s.connected
                ? t('presence.away')
                : s.host
                  ? t('lobby.host')
                  : s.ready
                    ? t('term.ready')
                    : t('rematch.notReady')}
            </span>
          </li>
        ))}
      </ul>

      {me && !isHost && (
        <Button
          variant={me.ready ? 'secondary' : 'primary'}
          onClick={() => controller.send({ type: 'ready', ready: !me.ready })}
        >
          {me.ready ? t('rematch.cancelReady') : t('term.rematch')}
        </Button>
      )}
      {me?.ready && !isHost && (
        <p className="text-center text-sm text-card/80">{t('rematch.waitHost')}</p>
      )}
      {isHost && (
        <Button
          disabledReason={
            readyCount < MIN_SEATS_TO_START
              ? t('rematch.needReady', { min: MIN_SEATS_TO_START })
              : null
          }
          onClick={() => (sittingOut.length > 0 ? setConfirming(true) : start())}
        >
          {t('rematch.start')}
        </Button>
      )}
      {me && (
        <Button variant="secondary" onClick={() => setSettings(true)}>
          {t('rematch.settings')}
        </Button>
      )}

      {confirming && (
        <Modal
          title={t('rematch.confirmTitle')}
          onClose={() => setConfirming(false)}
          closeLabel={t('rematch.notYet')}
        >
          <ul className="mb-3 grid gap-1">
            {sittingOut.map((s) => (
              <li key={s.id} className="flex items-center gap-2">
                <span className="size-7 shrink-0">
                  <CatArt color={s.cat} mood="normal" />
                </span>
                {t('rematch.sitsOut', { name: name(s.id) })}
              </li>
            ))}
          </ul>
          <Button className="w-full" onClick={start}>
            {t('rematch.start')}
          </Button>
        </Modal>
      )}

      {settings && me && (
        <Modal
          title={t('rematch.settings')}
          onClose={() => setSettings(false)}
          closeLabel={t('action.close')}
        >
          <div className="grid gap-4">
            <section className="grid gap-1.5">
              <h2 className="font-display">{t('setup.yourCat')}</h2>
              <div
                className="grid grid-cols-4 gap-2"
                role="radiogroup"
                aria-label={t('setup.yourCat')}
              >
                {CAT_COLORS.map((cat) => {
                  const taken = room.seats.some((s) => s.id !== me.id && s.cat === cat);
                  return (
                    <button
                      key={cat}
                      type="button"
                      role="radio"
                      aria-checked={me.cat === cat}
                      aria-disabled={taken || undefined}
                      aria-label={t(`cat.${cat}`)}
                      onClick={() =>
                        controller.send({ type: 'updateMe', name: me.name ?? profile.name, cat })
                      }
                      className={`flex min-h-tap items-center justify-center rounded-2xl p-1.5 ${me.cat === cat ? 'bg-night ring-2 ring-lantern' : 'bg-night/50'} ${taken ? 'opacity-30' : ''}`}
                    >
                      <span className="size-10">
                        <CatArt color={cat} mood={me.cat === cat ? 'happy' : 'normal'} />
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
            {isHost && (
              <section className="grid gap-1.5">
                <h2 className="font-display">{t('lobby.seats')}</h2>
                {room.seats
                  .filter((s) => !s.host && (s.bot || !s.connected))
                  .map((s) => (
                    <div key={s.id} className="flex items-center gap-2 rounded-xl bg-night px-2">
                      <span className="size-8 shrink-0">
                        <CatArt color={s.cat} mood="normal" />
                      </span>
                      <span className="min-w-0 flex-1 truncate">{name(s.id)}</span>
                      <Button
                        variant="ghost"
                        onClick={() => controller.send({ type: 'removeSeat', seatId: s.id })}
                      >
                        {t('setup.removeBot')}
                      </Button>
                    </div>
                  ))}
              </section>
            )}
            <RoomSettings controller={controller} room={room} isHost={isHost} />
          </div>
        </Modal>
      )}
    </section>
  );
}

/** Sitting a game out with no spectator place left: wait for the next one. */
export function WaitingOutScreen({
  room,
  cat,
  onLeave,
}: {
  room: RoomInfo;
  cat: RoomSeat['cat'];
  onLeave: () => void;
}) {
  const { t } = useTranslation();
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col items-center justify-center gap-5 px-4 text-center">
      <span className="size-28">
        <CatArt color={cat} mood="normal" />
      </span>
      <h1 className="text-2xl text-lantern">{t('rematch.waitingTitle')}</h1>
      <p className="text-card/85">{t('rematch.waitingText')}</p>
      <RoomScore seats={room.seats} />
      <Button variant="secondary" onClick={onLeave}>
        {t('lobby.leave')}
      </Button>
    </main>
  );
}
