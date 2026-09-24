import { describe, expect, it } from 'vitest';
import { applyAction } from '../src/actions.ts';
import {
  BOT_PERSONALITIES,
  BOT_TUNING,
  type BotDifficulty,
  type BotPersonality,
  chooseBotAction,
} from '../src/bots/index.ts';
import { dogRisk } from '../src/bots/common.ts';
import { createRng } from '../src/rng.ts';
import { pendingActors } from '../src/rules.ts';
import { createGame } from '../src/setup.ts';
import type { Action, Card, CardKind, GameState } from '../src/types.ts';
import { getPlayerView } from '../src/view.ts';
import {
  act,
  bidAll,
  cards,
  newGame,
  patch,
  patchPlayer,
  stopAll,
  skipToTrash,
} from './helpers.ts';

const decide = (
  s: GameState,
  who: string,
  bot: BotPersonality,
  seed: number | string = 1,
  difficulty: BotDifficulty = 'normal',
) => chooseBotAction(bot, difficulty, getPlayerView(s, who), createRng(seed));

const bidOf = (a: Action | null) => (a?.type === 'bid' ? a.value : null);
const n = (count: number, kind: CardKind) => cards(...(Array(count).fill(kind) as CardKind[]));

/** Trash phase where the first digger faces a bin with `dogs` dogs out of `size` cards. */
function binWith(dogs: number, size: number, hand: Card[] = []) {
  let s = skipToTrash(newGame(3)).state;
  const who = s.turnOrder[0]!;
  s = patch(s, { trashDeck: [...n(dogs, 'dog'), ...n(size - dogs, 'fish')], discard: [] });
  s = patchPlayer(s, who, { hand });
  return { s, who };
}

/** Feast Time with a given hand for the first eater; `rivals` fills the others (by turn position). */
function feastWith(hand: Card[], lastRound = false, rivals: Card[][] = []) {
  let s = skipToTrash(newGame(3)).state;
  if (lastRound) s = patch(s, { round: s.config.rounds });
  const [who, ...others] = s.tieOrder as [string, ...string[]]; // all tied → eat in tie order
  s = patchPlayer(s, who, { hand });
  others.forEach((id, i) => (s = patchPlayer(s, id, { hand: rivals[i] ?? [] })));
  return { s: stopAll(s).state, who, others };
}

describe('§9 bots — legality and fairness', () => {
  it('every personality × difficulty plays whole games with only legal actions', () => {
    for (const difficulty of ['easy', 'normal'] as const) {
      for (let g = 0; g < 60; g++) {
        const players = 2 + (g % 3);
        const ids = ['a', 'b', 'c', 'd'].slice(0, players);
        const bots = ids.map((_, i) => BOT_PERSONALITIES[(g + i) % 3]!);
        let s = createGame({ playerIds: ids, seed: `legal-${difficulty}-${g}` });
        const rng = createRng(g);
        let steps = 0;
        while (s.phase !== 'gameOver') {
          const actor = pendingActors(s)[0]!;
          const bot = bots[ids.indexOf(actor)]!;
          const action = chooseBotAction(bot, difficulty, getPlayerView(s, actor), rng);
          if (!action) throw new Error(`${bot} had no action in ${s.phase}`);
          const result = applyAction(s, action);
          if (!result.ok) throw new Error(`${bot} ${action.type}: ${result.error}`);
          s = result.state;
          expect(++steps).toBeLessThan(5000);
        }
      }
    }
  });

  it('returns null when the game is not waiting on the bot', () => {
    const s = act(newGame(3), { type: 'bid', playerId: 'a', value: 3 }).state;
    expect(decide(s, 'a', 'greedy')).toBeNull();
    const spectator = getPlayerView(s, null);
    expect(chooseBotAction('sly', 'normal', spectator, createRng(1))).toBeNull();
  });

  it('decides only from the player view (same view + same rng = same action)', () => {
    // Two games that differ only in hidden information: the order of both decks.
    for (const phase of ['bidding', 'trash', 'eat'] as const) {
      let s = newGame(3);
      if (phase === 'trash') s = binWith(1, 12).s;
      if (phase === 'eat') s = feastWith(n(3, 'fish')).s;
      const hidden = patch(s, {
        trashDeck: [...s.trashDeck].reverse(),
        marketDeck: [...s.marketDeck].reverse(),
      });
      const who = s.turnOrder[s.turnIndex] ?? 'a';
      for (const bot of BOT_PERSONALITIES) {
        expect(decide(hidden, who, bot, 5)).toEqual(decide(s, who, bot, 5));
      }
    }
  });
});

describe('§9 แมวส้มตะกละ (greedy)', () => {
  it('bids high from the start (its top two numbers)', () => {
    const bids = new Set(
      Array.from({ length: 50 }, (_, i) => bidOf(decide(newGame(3), 'a', 'greedy', i))),
    );
    expect([...bids].sort()).toEqual([4, 5]);
  });

  it('keeps digging until the dog risk passes its (high) threshold', () => {
    const at25 = binWith(1, 4);
    expect(decide(at25.s, at25.who, 'greedy')?.type).toBe('dig');
    const at30 = binWith(3, 10);
    expect(decide(at30.s, at30.who, 'greedy')?.type).toBe('stop');
  });

  it('stops once its bag is full enough to hurt (push-your-luck limit)', () => {
    const { s, who } = binWith(1, 20); // 5% risk — only the bag size stops it
    const full = patch(s, {
      bag: cards(...(Array(BOT_TUNING.greedy.maxBag).fill('fish') as CardKind[])),
    });
    expect(decide(full, who, 'greedy')?.type).toBe('stop');
    expect(decide(s, who, 'greedy')?.type).toBe('dig');
  });

  it('eats as soon as it has a set, best meal first', () => {
    const { s, who } = feastWith([...n(4, 'fish'), ...n(3, 'milk')]);
    const action = decide(s, who, 'greedy');
    expect(action?.type).toBe('eat');
    expect(action?.type === 'eat' && action.cardIds.length).toBe(4); // big feast = 10 pts
  });
});

describe('§9 แมวดำเจ้าเล่ห์ (sly)', () => {
  it('tries to clash with the leader’s likely (highest) number', () => {
    let s = newGame(3);
    s = patchPlayer(s, 'b', {
      meals: [{ round: 1, food: 'fish', cards: [], big: false, price: 5, points: 5 }],
      meowLeft: [1, 3, 4],
    });
    s = patchPlayer(s, 'c', { meowLeft: [1, 3, 4] });
    const hits = Array.from({ length: 100 }, (_, i) => bidOf(decide(s, 'a', 'sly', i))).filter(
      (v) => v === 4,
    );
    expect(hits.length).toBeGreaterThan(50);
  });

  it('otherwise takes a number nobody else has left (it can never clash)', () => {
    let s = newGame(3);
    s = patchPlayer(s, 'b', { meowLeft: [1, 2] });
    s = patchPlayer(s, 'c', { meowLeft: [1, 3] });
    s = patchPlayer(s, 'a', { meowLeft: [1, 4, 5] });
    expect(bidOf(decide(s, 'a', 'sly'))).toBe(5);
  });

  it('digs moderately (between careful and greedy)', () => {
    expect(BOT_TUNING.sly.maxDogRisk).toBeLessThan(BOT_TUNING.greedy.maxDogRisk);
    expect(BOT_TUNING.sly.maxDogRisk).toBeGreaterThan(BOT_TUNING.careful.maxDogRisk);
    const at20 = binWith(1, 5); // 20%
    expect(decide(at20.s, at20.who, 'sly')?.type).toBe('dig');
    const at30 = binWith(3, 10);
    expect(decide(at30.s, at30.who, 'sly')?.type).toBe('stop');
  });

  it('eats foods other cats are collecting (open hands) before they can', () => {
    // A rival later in the eat order could eat milk too → sly eats milk first.
    const { s, who } = feastWith([...n(4, 'fish'), ...n(3, 'milk')], false, [n(3, 'milk')]);
    const action = decide(s, who, 'sly');
    expect(action?.type).toBe('eat');
    const eaten = action?.type === 'eat' ? action.cardIds : [];
    const hand = s.players.find((p) => p.id === who)!.hand;
    expect(hand.filter((c) => eaten.includes(c.id)).every((c) => c.kind === 'milk')).toBe(true);
  });
});

describe('§9 แมวขาวขี้ระวัง (careful)', () => {
  it('saves its high numbers: bids low unless the stall can finish a meal', () => {
    const low = new Set(
      Array.from({ length: 50 }, (_, i) => bidOf(decide(newGame(3), 'a', 'careful', i))),
    );
    expect([...low].sort()).toEqual([1, 2]);

    let s = patch(newGame(3), { round: 2, market: cards('fish', 'milk', 'snack', 'shrimp') });
    s = patchPlayer(s, 'a', { hand: n(2, 'fish') }); // a third fish would make a meal
    expect(bidOf(decide(s, 'a', 'careful'))).toBe(5);
  });

  it('stops digging early — unless it holds a bone', () => {
    expect(BOT_TUNING.careful.maxDogRisk).toBeLessThan(BOT_TUNING.sly.maxDogRisk);
    const early = binWith(1, 5); // 20%
    expect(decide(early.s, early.who, 'careful')?.type).toBe('stop');
    const plain = binWith(1, 4); // 25%
    expect(decide(plain.s, plain.who, 'careful')?.type).toBe('stop');
    const boned = binWith(1, 4, n(1, 'bone'));
    expect(decide(boned.s, boned.who, 'careful')?.type).toBe('dig');
  });

  it('does not wait when a rival later this round could eat the same food first', () => {
    const { s, who } = feastWith(n(3, 'fish'), false, [n(3, 'fish')]);
    expect(decide(s, who, 'careful')?.type).toBe('eat');
  });

  it('waits for a big feast while prices are high, but eats a big feast at once', () => {
    const small = feastWith(n(3, 'fish'));
    expect(decide(small.s, small.who, 'careful')?.type).toBe('finishEating');
    const big = feastWith(n(4, 'fish'));
    expect(decide(big.s, big.who, 'careful')?.type).toBe('eat');
  });

  it('eats whatever it can in the final round', () => {
    const last = feastWith(n(3, 'fish'), true);
    expect(decide(last.s, last.who, 'careful')?.type).toBe('eat');
  });
});

describe('§9 difficulty', () => {
  it('easy bots make a random decision about 30% of the time', () => {
    // Greedy never bids 1–3 in round 1 on normal; on easy a random bid sometimes does.
    const s = newGame(3);
    const odd = Array.from({ length: 1000 }, (_, i) =>
      bidOf(decide(s, 'a', 'greedy', i, 'easy')),
    ).filter((v) => v !== null && v <= 3).length;
    // 30% random × 3/5 of random bids are 1–3 ≈ 18%
    expect(odd).toBeGreaterThan(120);
    expect(odd).toBeLessThan(240);
  });
});

describe('bot helpers', () => {
  it('dog risk accounts for the discard pile being shuffled in when only dogs remain', () => {
    let s = bidAll(newGame(3), { a: 1, b: 1, c: 1 }).state;
    s = patch(s, { trashDeck: n(2, 'dog'), discard: n(6, 'fish') });
    expect(dogRisk(getPlayerView(s, 'a'))).toBeCloseTo(2 / 8);
  });
});
