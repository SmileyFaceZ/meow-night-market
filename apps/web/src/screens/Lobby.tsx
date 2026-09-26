import { MAX_SEATS, MIN_SEATS_TO_START } from '@meow/protocol';
import { useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { CatArt } from '../art/CatArt';
import { CatPicker } from '../components/CatPicker';
import { RoomSettings } from '../components/RoomSettings';
import { seatCatHolders } from '../game/online';
import { Button } from '../components/ui';
import { useSeatName } from '../game/hooks';
import type { Profile, RemoteController } from '../game/online';

/** Waiting room: share the code, fill seats with bots, start (docs/MULTIPLAYER.md). */
export function LobbyScreen({
  controller,
  profile,
  onLeave,
}: {
  controller: RemoteController;
  profile: Profile;
  onLeave: () => void;
}) {
  const { t } = useTranslation();
  const online = useSyncExternalStore(controller.subscribe, controller.getOnline);
  const { room, connection, problem, code } = online;
  const seats = room?.seats ?? [];
  const seatName = useSeatName(seats);
  const [copied, setCopied] = useState(false);
  const link = `${location.origin}/room/${code}`;
  const me = seats.find((s) => s.id === room?.you);
  const isHost = me?.host ?? false;

  if (problem) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-xl flex-col items-center justify-center gap-5 px-4 text-center">
        <span className="size-28">
          <CatArt color="calico" mood="shocked" />
        </span>
        <p className="font-display text-xl">{t(`lobby.problem.${problem}`, { code })}</p>
        <Button onClick={onLeave}>{t('result.home')}</Button>
      </main>
    );
  }

  const share = async () => {
    const text = t('lobby.shareText', { code });
    try {
      if (navigator.share) {
        await navigator.share({ title: t('game.title'), text, url: link });
        return;
      }
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      // share sheet dismissed / clipboard blocked: nothing to do
    }
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col gap-4 px-4 pt-4 pb-10">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-2xl text-lantern">{t('lobby.title')}</h1>
        <Button variant="secondary" onClick={onLeave}>
          {t('lobby.leave')}
        </Button>
      </header>

      {connection !== 'open' && (
        <p role="status" className="rounded-2xl bg-night-2 px-3 py-2 text-center text-sm">
          {t(`lobby.${connection}`)}
        </p>
      )}

      {/* the code, big enough to read out loud */}
      <section className="rounded-3xl bg-night-2 p-4 text-center">
        <p className="text-sm text-card/70">{t('lobby.code')}</p>
        <p
          className="font-display text-5xl tracking-[0.3em] text-lantern"
          aria-label={[...code].join(' ')}
        >
          {code}
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              navigator.clipboard
                .writeText(link)
                .then(() => setCopied(true))
                .catch(() => setCopied(false));
            }}
          >
            {copied ? t('lobby.copied') : t('lobby.copyLink')}
          </Button>
          <Button onClick={() => void share()}>{t('lobby.share')}</Button>
        </div>
      </section>

      <section className="grid gap-2" aria-label={t('lobby.seats')}>
        <h2 className="font-display">
          {t('lobby.seatsCount', { n: seats.length, max: MAX_SEATS })}
        </h2>
        {seats.map((seat) => {
          const away = !seat.connected;
          const removable = isHost && !seat.host && (seat.bot !== null || away);
          return (
            <div key={seat.id} className="flex items-center gap-3 rounded-2xl bg-night-2 p-2">
              <span className={`relative size-11 shrink-0 ${away ? 'opacity-50 grayscale' : ''}`}>
                <CatArt color={seat.cat} mood={seat.id === room?.you ? 'happy' : 'normal'} />
                {seat.host && (
                  <span className="absolute -top-2 left-1/2 -translate-x-1/2 text-sm" aria-hidden>
                    👑
                  </span>
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-display leading-tight">
                  {seatName(seat.id)}
                  {seat.id === room?.you && ` (${t('term.you')})`}
                </p>
                <p className="text-xs text-card/70">
                  {[
                    seat.host ? t('lobby.host') : null,
                    seat.bot ? t(`difficulty.${seat.bot.difficulty}`) : null,
                    away ? t('presence.away') : null,
                  ]
                    .filter(Boolean)
                    .join(' · ') || ' '}
                </p>
              </div>
              {removable && (
                <Button
                  variant="ghost"
                  onClick={() => controller.send({ type: 'removeSeat', seatId: seat.id })}
                >
                  {t('setup.removeBot')}
                </Button>
              )}
            </div>
          );
        })}
        {Array.from({ length: MAX_SEATS - seats.length }, (_, i) => (
          <p
            key={`empty-${i}`}
            className="rounded-2xl border-2 border-dashed border-card/20 p-3 text-center text-sm text-card/50"
          >
            {t('lobby.emptySeat')}
          </p>
        ))}
      </section>

      {room && me && (
        <section className="grid gap-1.5">
          <h2 className="font-display">{t('cats.title')}</h2>
          <CatPicker
            value={me.cat}
            holders={seatCatHolders(seats, me.id, seatName)}
            powers={room.mode.powers}
            onPick={(cat) => controller.send({ type: 'updateMe', name: me.name ?? '', cat })}
          />
          {online.notice?.key === 'room.error.catTaken' && (
            <p role="status" className="text-sm text-alert">
              {t('room.error.catTaken')}
            </p>
          )}
        </section>
      )}

      {room && <RoomSettings controller={controller} room={room} isHost={isHost} />}

      <div className="mt-auto grid gap-2">
        {room && room.you === null && (
          <p className="text-center text-sm text-card/80">{t('lobby.watching')}</p>
        )}
        {room && room.you === null && seats.length < MAX_SEATS && (
          <Button
            variant="secondary"
            onClick={() => controller.send({ type: 'hello', name: profile.name })}
          >
            {t('lobby.takeSeat')}
          </Button>
        )}
        {isHost ? (
          <Button
            disabledReason={
              seats.length < MIN_SEATS_TO_START
                ? t('lobby.needPlayers', { min: MIN_SEATS_TO_START })
                : null
            }
            onClick={() => controller.send({ type: 'start' })}
          >
            {t('lobby.start')}
          </Button>
        ) : (
          room?.you && <p className="text-center text-card/80">{t('lobby.waitHost')}</p>
        )}
      </div>
    </main>
  );
}
