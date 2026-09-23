import type { GameResult, GameState, ScoreLine } from './types.ts';

/** GAME_RULES §7 */
export function scoreGame(state: Pick<GameState, 'players' | 'config'>): GameResult {
  const { config } = state;
  const base = state.players.map((p) => ({
    playerId: p.id,
    mealPoints: p.meals.reduce((sum, m) => sum + m.points, 0),
    foodTypes: new Set(p.meals.map((m) => m.food)).size,
    handCount: p.hand.length,
  }));

  const mostTypes = Math.max(0, ...base.map((b) => b.foodTypes));
  const scores: ScoreLine[] = base.map((b) => {
    const varietyBonus =
      mostTypes >= config.varietyMinTypes && b.foodTypes === mostTypes ? config.varietyBonus : 0;
    return { ...b, varietyBonus, total: b.mealPoints + varietyBonus };
  });

  const bestTotal = Math.max(...scores.map((s) => s.total));
  const leaders = scores.filter((s) => s.total === bestTotal);
  const fewestCards = Math.min(...leaders.map((s) => s.handCount));
  const winners = leaders.filter((s) => s.handCount === fewestCards).map((s) => s.playerId);

  return { scores, winners };
}
