import type { GameResult } from '@meow/engine';
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
  playAgainReason = null,
  onHome,
}: {
  result: GameResult;
  seats: readonly SeatInfo[];
  /** Null when several players shared the screen: nobody is "you". */
  viewerId: string | null;
  onPlayAgain: () => void;
  /** Online: only the host can start another game; others see why. */
  playAgainReason?: string | null;
  onHome: () => void;
}) {
  const { t } = useTranslation();
  const name = useSeatName(seats);
  const ranked = [...result.scores].sort((a, b) => b.total - a.total || a.handCount - b.handCount);
  const winners = result.winners;
  const headline =
    winners.length === 1
      ? t('result.winner', { name: winners[0] === viewerId ? t('term.you') : name(winners[0]) })
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

      <div className="mt-auto grid gap-2">
        <Button onClick={onPlayAgain} disabledReason={playAgainReason}>
          {t('result.playAgain')}
        </Button>
        <Button variant="secondary" onClick={onHome}>
          {t('result.home')}
        </Button>
      </div>
    </main>
  );
}
