import type { GameResult } from '@meow/engine';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { CatArt } from '../art/CatArt';
import { Button } from '../components/ui';
import { useSeatName } from '../game/hooks';
import type { SeatInfo } from '../game/types';

export function ResultScreen({
  result,
  seats,
  viewerId,
  onPlayAgain,
  onChangeSetup,
  extra,
  onHome,
}: {
  result: GameResult;
  seats: readonly SeatInfo[];
  /** Null when several players shared the screen: nobody is "you". */
  viewerId: string | null;
  /** Same settings, new game at once (absent online: the rematch panel handles it). */
  onPlayAgain?: (() => void) | undefined;
  /** Back to the setup screen with the current settings. */
  onChangeSetup?: (() => void) | undefined;
  /** Shown above the buttons: running score, or the online rematch panel. */
  extra?: ReactNode;
  onHome: () => void;
}) {
  const { t } = useTranslation();
  const name = useSeatName(seats);
  const ranked = [...result.scores].sort((a, b) => b.total - a.total || a.handCount - b.handCount);
  const winners = result.winners;
  const headline =
    winners.length === 1
      ? winners[0] === viewerId
        ? t('result.youWin')
        : t('result.winner', { name: name(winners[0]) })
      : t('result.sharedWin');

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col gap-4 px-4 pt-6 pb-10">
      <h1 className="text-center text-2xl text-lantern">{t('result.title')}</h1>
      <p role="status" className="text-center font-display text-3xl">
        {headline}
      </p>

      <ol className="grid gap-2">
        {ranked.map((score) => {
          const seat = seats.find((s) => s.id === score.playerId)!;
          const won = winners.includes(score.playerId);
          return (
            <li
              key={score.playerId}
              className={`flex items-center gap-3 rounded-2xl p-3 ${won ? 'bg-night-2 ring-2 ring-lantern' : 'bg-night-2/60'}`}
            >
              <span className="relative size-14 shrink-0">
                <CatArt color={seat.cat} mood={won ? 'happy' : 'normal'} />
                {won && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-xl" aria-hidden>
                    👑
                  </span>
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-display">
                  {score.playerId === viewerId
                    ? `${name(score.playerId)} (${t('term.you')})`
                    : name(score.playerId)}
                </p>
                <p className="text-sm leading-snug text-card/75">
                  {t('result.mealPoints')} {score.mealPoints} · {t('result.bonus')} +
                  {score.varietyBonus} · {t('result.foodTypes', { count: score.foodTypes })} ·{' '}
                  {t('result.handLeft')} {score.handCount}
                </p>
              </div>
              <p className="text-right">
                <span className="block font-display text-3xl leading-none text-lantern">
                  {score.total}
                </span>
                <span className="text-xs text-card/70">{t('result.total')}</span>
              </p>
            </li>
          );
        })}
      </ol>

      {extra}

      <div className="mt-auto grid gap-2">
        {onPlayAgain && <Button onClick={onPlayAgain}>{t('term.rematch')}</Button>}
        {onChangeSetup && (
          <Button variant="secondary" onClick={onChangeSetup}>
            {t('result.changeSetup')}
          </Button>
        )}
        <Button variant="secondary" onClick={onHome}>
          {t('result.home')}
        </Button>
      </div>
    </main>
  );
}

/** Wins in a row on this device for the same line-up (solo / pass-and-play). */
export function SessionScoreBar({
  seats,
  wins,
  games,
}: {
  seats: readonly SeatInfo[];
  wins: Readonly<Record<string, number>>;
  games: number;
}) {
  const { t } = useTranslation();
  const name = useSeatName(seats);
  if (games < 2) return null;
  return (
    <section
      aria-label={t('result.sessionScore', { count: games })}
      className="flex flex-wrap items-center justify-center gap-1.5 rounded-2xl bg-night-2/70 px-2 py-1.5 text-sm"
    >
      <span className="font-display text-lantern">
        {t('result.sessionScore', { count: games })}
      </span>
      {seats.map((s) => (
        <span key={s.id} className="flex items-center gap-1 rounded-full bg-night px-2 py-0.5">
          <span className="size-5">
            <CatArt color={s.cat} mood="normal" />
          </span>
          <span className="max-w-[6rem] truncate">{name(s.id)}</span>
          <span className="font-display">{wins[s.id] ?? 0}</span>
        </span>
      ))}
    </section>
  );
}
