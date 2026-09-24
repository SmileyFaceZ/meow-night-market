// Finds a seed for the scripted tutorial: after round 1's picks (and the discard reshuffle)
// the player's first four digs must be fish, bone, fish, dog. Run: node apps/web/scripts/find-tutorial-seed.ts
// Keep the constants in sync with src/game/tutorial.ts (a test checks the chosen seed).
import {
  type Action,
  applyAction,
  createGame,
  type GameState,
} from '../../../packages/engine/src/index.ts';

const MARKET_TOP = ['fish', 'milk', 'chicken', 'shrimp', 'snack', 'chicken'] as const;
const WANT = ['fish', 'bone', 'fish', 'dog'];

function act(s: GameState, a: Action): GameState {
  const r = applyAction(s, a);
  if (!r.ok) throw new Error(`${a.type}: ${r.error}`);
  return r.state;
}

for (let n = 0; n < 200_000; n++) {
  const seed = `tutorial-${n}`;
  let s = createGame({ playerIds: ['p0', 'p1'], seed, marketTop: [...MARKET_TOP] });
  s = act(s, { type: 'bid', playerId: 'p0', value: 5 });
  s = act(s, { type: 'bid', playerId: 'p1', value: 2 });
  s = act(s, { type: 'pick', playerId: 'p0', cardId: s.market.find((c) => c.kind === 'fish')!.id });
  s = act(s, { type: 'pick', playerId: 'p1', cardId: s.market.find((c) => c.kind === 'milk')!.id });
  s = act(s, { type: 'stop', playerId: 'p1' });
  if (
    s.trashDeck
      .slice(0, 4)
      .map((c) => c.kind)
      .join() === WANT.join()
  ) {
    console.log(`found: ${seed}`);
    process.exit(0);
  }
}
console.log('not found');
