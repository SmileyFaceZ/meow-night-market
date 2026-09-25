import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../src/config.ts';
import { CAT_IDS, type CatId } from '../src/powers.ts';
import { createRng } from '../src/rng.ts';
import { createGame } from '../src/setup.ts';
import type { Card, GameState } from '../src/types.ts';
import { getPlayerView } from '../src/view.ts';
import {
  act,
  allCardIds,
  bidAll,
  card,
  cards,
  eventTypes,
  expectError,
  P,
  patch,
  patchPlayer,
  playRandomGame,
  player,
  reachableCardIds,
  skipToEat,
  skipToTrash,
  stopAll,
} from './helpers.ts';

// GAME_RULES §14 — cat powers.

/** A 3-player game where player a has `cat` (b, c get plain cats without window powers). */
function withCat(cat: CatId, seed = 'powers', config = DEFAULT_CONFIG): GameState {
  const others = CAT_IDS.filter((c) => c !== cat && !['calico', 'black'].includes(c));
  return createGame({
    playerIds: ['a', 'b', 'c'],
    seed,
    config,
    cats: { a: cat, b: others[0]!, c: others[1]! },
  });
}

/** Give the given player the given cat (tests set up exact situations). */
function giveCat(state: GameState, id: string, cat: CatId): GameState {
  return patch(state, { powers: { ...state.powers, [id]: { cat, used: false } } });
}

const current = (s: GameState) => s.turnOrder[s.turnIndex]!;

describe('setup (§14)', () => {
  it('gives each player an unused power; classic games have none', () => {
    const s = withCat('orange');
    expect(s.powers?.a).toEqual({ cat: 'orange', used: false });
    const view = getPlayerView(s, 'b');
    expect(view.players.find((p) => p.id === 'a')).toMatchObject({
      cat: 'orange',
      power: 'keenNose',
      powerUsed: false,
    });
    expect(view.powersOn).toBe(true);
    expect(createGame({ playerIds: ['a', 'b'], seed: 1 }).powers).toBeNull();
  });

  it('needs every player to have a different cat', () => {
    expect(() =>
      createGame({ playerIds: ['a', 'b'], seed: 1, cats: { a: 'orange', b: 'orange' } }),
    ).toThrow('different');
    expect(() => createGame({ playerIds: ['a', 'b'], seed: 1, cats: { a: 'orange' } })).toThrow(
      'every player',
    );
  });
});

describe('Keen Nose (orange)', () => {
  function sniffer() {
    let s = skipToTrash(withCat('korat')).state;
    s = giveCat(s, current(s), 'orange');
    const [dog, fish, chicken] = [card('dog'), card('fish'), card('chicken')];
    s = patch(s, {
      trashDeck: [fish, dog, chicken, ...s.trashDeck.filter((c) => c.kind !== 'dog')],
    });
    return { s, me: current(s), dog, fish };
  }

  it('shows the top two bin cards to the sniffer only; nothing moves', () => {
    const { s, me, dog, fish } = sniffer();
    const used = act(s, { type: 'usePower', playerId: me, use: { power: 'keenNose' } });
    expect(eventTypes(used.events)).toEqual(['POWER_USED']);
    expect(used.state.trashDeck.slice(0, 2).map((c) => c.id)).toEqual([fish.id, dog.id]);
    expect(getPlayerView(used.state, me).peek?.cards.map((c) => c.id)).toEqual([fish.id, dog.id]);
    const other = s.players.find((p) => p.id !== me)!.id;
    const theirs = getPlayerView(used.state, other);
    expect(theirs.peek).toBeNull();
    expect(theirs.sniffing).toBe(me);
    expect(reachableCardIds(theirs).has(dog.id)).toBe(false);
    // The sniffer keeps knowing what comes next as cards are drawn.
    const dug = act(used.state, { type: 'dig', playerId: me }).state;
    expect(dug.bag.map((c) => c.id)).toEqual([fish.id]);
    expect(getPlayerView(dug, me).peek?.cards.map((c) => c.id)).toEqual([dog.id]);
  });

  it('works only before the first draw of the turn, and only once per game', () => {
    const { s, me } = sniffer();
    const dug = act(s, { type: 'dig', playerId: me }).state;
    expectError(
      dug,
      { type: 'usePower', playerId: me, use: { power: 'keenNose' } },
      'error.powerNotNow',
    );
    const used = act(s, { type: 'usePower', playerId: me, use: { power: 'keenNose' } }).state;
    expect(used.powers![me]!.used).toBe(true);
    expectError(
      used,
      { type: 'usePower', playerId: me, use: { power: 'keenNose' } },
      'error.noPower',
    );
  });
});

describe('Second Thought (black)', () => {
  it('after the reveal, may move its number ±1 to one still in hand (old one comes back)', () => {
    const s = withCat('black');
    const bid = bidAll(s, { a: 3, b: 3, c: 5 });
    expect(bid.state.powerWindow).toEqual({ playerId: 'a', power: 'secondThought' });
    expect(eventTypes(bid.events)).not.toContain('BID_CLASH');
    expectError(bid.state, { type: 'pick', playerId: 'c', cardId: 1 }, 'error.powerPending');
    expectError(
      bid.state,
      { type: 'usePower', playerId: 'a', use: { power: 'secondThought', value: 5 } },
      'error.invalidPowerTarget',
    );

    const moved = act(bid.state, {
      type: 'usePower',
      playerId: 'a',
      use: { power: 'secondThought', value: 4 },
    });
    expect(moved.events).toContainEqual({ type: 'BID_CHANGED', playerId: 'a', from: 3, to: 4 });
    expect(player(moved.state, 'a').meowLeft).toEqual([1, 2, 3, 5]);
    expect(moved.state.clashed).toEqual([]);
    expect(moved.state.pickQueue).toEqual(['c', 'a', 'b']);
  });

  it('may let it pass: the clash stands', () => {
    const bid = bidAll(withCat('black'), { a: 3, b: 3, c: 5 });
    const passed = act(bid.state, { type: 'passPower', playerId: 'a' });
    expect([...passed.state.clashed].sort()).toEqual(['a', 'b']);
    expect(passed.state.powers!.a!.used).toBe(false);
  });

  it('opens no window when neither neighbour number is left', () => {
    let s = withCat('black');
    s = patchPlayer(s, 'a', { meowLeft: [1, 3, 5] });
    expect(bidAll(s, { a: 3, b: 1, c: 5 }).state.powerWindow).toBeNull();
  });
});

describe('Scavenger (white)', () => {
  it('takes a food card from the discard pile on its eat turn — even with nothing else to eat', () => {
    // Something was lost while digging: the discard pile holds a bone and a fish.
    const fish = card('fish');
    let t = skipToTrash(withCat('white')).state;
    t = patch(t, {
      discard: [card('bone'), fish],
      players: t.players.map((p) => ({ ...p, hand: p.id === 'a' ? cards('fish', 'fish') : [] })),
    });
    const s = stopAll(t).state;
    // a had no meal but could scavenge, so the turn was not skipped.
    expect(current(s)).toBe('a');
    expectError(
      s,
      { type: 'usePower', playerId: 'a', use: { power: 'scavenger', cardId: s.discard[0]!.id } },
      'error.invalidPowerTarget',
    );
    const took = act(s, {
      type: 'usePower',
      playerId: 'a',
      use: { power: 'scavenger', cardId: fish.id },
    });
    expect(took.events).toContainEqual({ type: 'CARD_SCAVENGED', playerId: 'a', card: fish });
    expect(player(took.state, 'a').hand.filter((c) => c.kind === 'fish')).toHaveLength(3);
    expect(current(took.state)).toBe('a'); // now a meal is possible
  });
});

describe('Lucky Swap (calico)', () => {
  it('before anyone bids, swaps a stall card for the first food card in the bin', () => {
    const s = withCat('calico');
    expect(s.powerWindow).toEqual({ playerId: 'a', power: 'luckySwap' });
    expectError(s, { type: 'bid', playerId: 'b', value: 1 }, 'error.powerPending');
    const fresh = s.trashDeck.find((c) => c.kind !== 'dog' && c.kind !== 'bone')!;
    const out = s.market[0]!;
    const swapped = act(s, {
      type: 'usePower',
      playerId: 'a',
      use: { power: 'luckySwap', cardId: out.id },
    });
    expect(swapped.state.market[0]).toEqual(fresh);
    expect(swapped.state.discard).toContainEqual(out);
    expect(swapped.state.trashDeck.some((c) => c.id === fresh.id)).toBe(false);
    expect(swapped.state.powerWindow).toBeNull();
    act(swapped.state, { type: 'bid', playerId: 'b', value: 1 });
  });

  it('asks again next round if it was let pass', () => {
    const s = act(withCat('calico'), { type: 'passPower', playerId: 'a' }).state;
    expect(s.powerWindow).toBeNull();
    expect(s.powers!.a!.used).toBe(false);
  });
});

describe('Good-Luck Cat (korat)', () => {
  it('meets a dog without a bone: the dog snatches half the bag (rounded up), the rest is kept, turn over', () => {
    let s = skipToTrash(withCat('orange')).state;
    const me = current(s);
    s = giveCat(s, me, 'korat');
    const bagged = cards('fish', 'milk', 'shrimp');
    s = patch(s, { trashDeck: [...bagged, card('dog'), ...s.trashDeck] });
    for (let i = 0; i < 4; i++) s = act(s, { type: 'dig', playerId: me }).state;
    expect(s.pendingDog?.kind).toBe('dog');
    const lucky = act(s, { type: 'usePower', playerId: me, use: { power: 'goodLuck' } });
    expect(eventTypes(lucky.events).slice(0, 4)).toEqual([
      'POWER_USED',
      'DOG_CAUGHT',
      'DOG_RETURNED',
      'BAG_KEPT',
    ]);
    expect(player(lucky.state, me).hand).toEqual([bagged[2]]);
    expect(lucky.state.discard).toEqual(bagged.slice(0, 2));
    expect(lucky.state.pendingDog).toBeNull();
    expect(current(lucky.state)).not.toBe(me);
  });

  it('without the power (used, or another cat) a dog and no bone still means caught', () => {
    let s = skipToTrash(withCat('orange')).state;
    const me = current(s);
    s = patch(s, { powers: { ...s.powers, [me]: { cat: 'korat', used: true } } });
    s = patch(s, { trashDeck: [card('fish'), card('dog'), ...s.trashDeck] });
    s = act(s, { type: 'dig', playerId: me }).state;
    const dog = act(s, { type: 'dig', playerId: me });
    expect(eventTypes(dog.events)).toContain('DOG_CAUGHT');
    expect(dog.state.pendingDog).toBeNull();
  });
});

describe('Extra Order (siamese)', () => {
  it('also gets the stall leftover after everyone has picked', () => {
    const bid = bidAll(withCat('siamese'), { a: 1, b: 2, c: 3 });
    // c, b pick first; a (lowest) picks last.
    let s = act(bid.state, { type: 'pick', playerId: 'c', cardId: bid.state.market[0]!.id }).state;
    s = act(s, { type: 'pick', playerId: 'b', cardId: s.market[0]!.id }).state;
    s = act(s, { type: 'usePower', playerId: 'a', use: { power: 'extraOrder' } }).state;
    const [mine, leftover] = s.market as [(typeof s.market)[0], (typeof s.market)[0]];
    const done = act(s, { type: 'pick', playerId: 'a', cardId: mine.id });
    expect(player(done.state, 'a').hand).toEqual([mine, leftover]);
    expect(eventTypes(done.events)).not.toContain('MARKET_CLEARED');
  });
});

describe('Haggle (tabby)', () => {
  it('raises one food by 1 before its first meal of the turn, never above the start price', () => {
    let s = skipToEat(withCat('tabby'), {
      a: cards('fish', 'fish', 'fish', 'milk', 'milk', 'milk'),
    });
    // Every price still at the start price: nothing to haggle.
    expectError(
      s,
      { type: 'usePower', playerId: 'a', use: { power: 'haggle', food: 'fish' } },
      'error.powerNotNow',
    );
    s = patch(s, { prices: { ...s.prices, milk: 3 } });
    expectError(
      s,
      { type: 'usePower', playerId: 'a', use: { power: 'haggle', food: 'fish' } },
      'error.invalidPowerTarget',
    );
    s = patch(s, { prices: { ...s.prices, fish: 3 } });
    const raised = act(s, {
      type: 'usePower',
      playerId: 'a',
      use: { power: 'haggle', food: 'fish' },
    });
    expect(raised.events).toContainEqual({ type: 'PRICE_CHANGED', food: 'fish', from: 3, to: 4 });
    const fishIds = player(raised.state, 'a')
      .hand.filter((c) => c.kind === 'fish')
      .map((c) => c.id);
    const ate = act(raised.state, { type: 'eat', playerId: 'a', cardIds: fishIds });
    expect(player(ate.state, 'a').meals[0]!.points).toBe(4);
  });

  it('is only before the first meal of the turn', () => {
    let s = skipToEat(withCat('tabby'), {
      a: cards('fish', 'fish', 'fish', 'milk', 'milk', 'milk'),
    });
    s = patch(s, { prices: { ...s.prices, milk: 3 } });
    const fishIds = player(s, 'a')
      .hand.filter((c) => c.kind === 'fish')
      .map((c) => c.id);
    s = act(s, { type: 'eat', playerId: 'a', cardIds: fishIds }).state;
    expectError(
      s,
      { type: 'usePower', playerId: 'a', use: { power: 'haggle', food: 'milk' } },
      'error.powerNotNow',
    );
  });
});

describe('Big Appetite (chubby)', () => {
  it('eats a pair once: points = price − 1 (at least 1), the price drops as usual', () => {
    const s = skipToEat(withCat('chubby'), { a: cards('milk', 'milk', 'goldfish') });
    expect(current(s)).toBe('a'); // a pair counts as something to eat
    const [m1, m2, gold] = player(s, 'a').hand as unknown as [Card, Card, Card];
    expectError(
      s,
      { type: 'usePower', playerId: 'a', use: { power: 'bigAppetite', cardIds: [m1.id, gold.id] } },
      'error.invalidPowerTarget',
    );
    const ate = act(s, {
      type: 'usePower',
      playerId: 'a',
      use: { power: 'bigAppetite', cardIds: [m1.id, m2.id] },
    });
    const meal = player(ate.state, 'a').meals[0]!;
    expect(meal).toMatchObject({ food: 'milk', points: 4, price: 5 });
    expect(ate.state.prices.milk).toBe(4);
    // Nothing left to eat: the turn moved on.
    expect(ate.state.turnOrder[ate.state.turnIndex]).not.toBe('a');
  });

  it('scores at least 1 when milk is at the lowest price', () => {
    let s = skipToEat(withCat('chubby'), { a: cards('milk', 'milk') });
    s = patch(s, { prices: { ...s.prices, milk: 1 } });
    const ids = player(s, 'a').hand.map((c) => c.id);
    const ate = act(s, {
      type: 'usePower',
      playerId: 'a',
      use: { power: 'bigAppetite', cardIds: ids },
    });
    expect(player(ate.state, 'a').meals[0]!.points).toBe(1);
  });
});

describe('whole games with powers', () => {
  it.each([2, 3, 4])('finish with every card accounted for (%i players)', (n) => {
    for (let seed = 0; seed < 15; seed++) {
      const rng = createRng(`cats:${n}:${seed}`);
      const chosen = rng.shuffle([...CAT_IDS]).slice(0, n);
      const cats = Object.fromEntries(P.slice(0, n).map((id, i) => [id, chosen[i]!]));
      let expected: number[] | null = null;
      const { final } = playRandomGame(
        `pw:${seed}`,
        n,
        (state) => {
          const ids = allCardIds(state).sort((a, b) => a - b);
          expected ??= ids;
          expect(ids).toEqual(expected);
        },
        DEFAULT_CONFIG,
        cats,
      );
      expect(final.phase).toBe('gameOver');
    }
  });
});
