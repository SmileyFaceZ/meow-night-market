import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../src/config.ts';
import { EVENT_IDS, type EventId, eventDeckFor } from '../src/events.ts';
import { CAT_IDS } from '../src/powers.ts';
import { createRng } from '../src/rng.ts';
import { createGame } from '../src/setup.ts';
import type { GameState } from '../src/types.ts';
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
  pickAll,
  playRandomGame,
  player,
  reachableCardIds,
  skipToTrash,
  stopAll,
} from './helpers.ts';

// GAME_RULES §15 — market events.

function game(eventTop: EventId[], opts: { powers?: boolean; seed?: string } = {}) {
  return createGame({
    playerIds: ['a', 'b', 'c'],
    seed: opts.seed ?? 'events',
    events: true,
    eventTop,
    ...(opts.powers ? { cats: { a: 'orange', b: 'korat', c: 'tabby' } as const } : {}),
  });
}

/** Play the current round through with nothing much happening (everyone bids its lowest, stops, eats nothing). */
function finishRound(s: GameState): GameState {
  const round = s.round;
  s = bidAll(s, Object.fromEntries(s.players.map((p) => [p.id, p.meowLeft[0]!]))).state;
  s = pickAll(s).state;
  s = patch(s, { players: s.players.map((p) => ({ ...p, hand: [] })) });
  s = stopAll(s).state;
  expect(s.round).toBe(round + 1);
  return s;
}

const current = (s: GameState) => s.turnOrder[s.turnIndex]!;

describe('the event deck', () => {
  it('has 12 cards: the full moon with powers, the snack sale without', () => {
    expect(eventDeckFor(true)).toHaveLength(12);
    expect(eventDeckFor(true)).toContain('fullMoon');
    expect(eventDeckFor(false)).toContain('snackSale');
    expect(eventDeckFor(false)).not.toContain('fullMoon');
  });

  it('reveals one event per round before the stall, never the same twice, deck order secret', () => {
    const s = createGame({ playerIds: ['a', 'b'], seed: 'deck', events: true });
    const seen: EventId[] = [s.events!.current!];
    let state = s;
    while (state.round < 5) {
      state = finishRound(state);
      seen.push(state.events!.current!);
    }
    expect(new Set(seen).size).toBe(5);
    const view = getPlayerView(s, 'a');
    expect(view.eventsLeft).toBe(11);
    // No upcoming event appears anywhere in the view (only this round's and past ones).
    const values = new Set<unknown>();
    const walk = (v: unknown): void => {
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object') Object.values(v).forEach(walk);
      else values.add(v);
    };
    walk(view);
    for (const upcoming of s.events!.deck) expect(values.has(upcoming)).toBe(false);
    const first = playRandomGame('order', 2, undefined, undefined, undefined, true);
    expect(first.final.events!.past).toHaveLength(4);
  });

  it('announces the event before the stall is laid out', () => {
    let s = game(['seafoodFest', 'busyNight']);
    expect(s.events!.current).toBe('seafoodFest');
    s = bidAll(s, Object.fromEntries(s.players.map((p) => [p.id, p.meowLeft[0]!]))).state;
    s = pickAll(s).state;
    s = patch(s, { players: s.players.map((p) => ({ ...p, hand: [] })) });
    const next = stopAll(s);
    const types = eventTypes(next.events);
    expect(types.indexOf('EVENT_REVEALED')).toBeLessThan(types.indexOf('ROUND_STARTED'));
    expect(next.state.events).toMatchObject({ current: 'busyNight', past: ['seafoodFest'] });
  });
});

describe('each event', () => {
  it('Downpour: a dog leaves the bin for the round, then comes back', () => {
    const s = game(['downpour']);
    expect(s.setAsideDogs).toHaveLength(1);
    expect(getPlayerView(s, 'a').trashDogCount).toBe(DEFAULT_CONFIG.dogCopies - 1);
    const next = finishRound(s);
    expect(next.setAsideDogs).toHaveLength(0);
    expect(next.trashDeck.filter((c) => c.kind === 'dog')).toHaveLength(DEFAULT_CONFIG.dogCopies);
  });

  it('Seafood Fest: fish and shrimp meals score +2', () => {
    let s = skipToTrash(game(['seafoodFest'])).state;
    s = patch(s, {
      players: s.players.map((p) => ({
        ...p,
        hand: p.id === 'a' ? cards('fish', 'fish', 'fish') : [],
      })),
    });
    s = stopAll(s).state;
    const ate = act(s, {
      type: 'eat',
      playerId: 'a',
      cardIds: player(s, 'a').hand.map((c) => c.id),
    });
    expect(player(ate.state, 'a').meals[0]!.points).toBe(DEFAULT_CONFIG.startPrice + 2);
  });

  it('Milk Delivery: one more stall card — the first milk in the bin', () => {
    const s = game(['milkDelivery']);
    expect(s.market).toHaveLength(3 + 1 + 1);
    expect(s.market.at(-1)!.kind).toBe('milk');
  });

  it('Busy Night: one more stall card from the bin', () => {
    expect(game(['busyNight']).market).toHaveLength(5);
  });

  it('Garbage Truck: at most four draws per Trash Dig turn', () => {
    let s = skipToTrash(game(['garbageTruck'])).state;
    const me = current(s);
    s = patch(s, {
      trashDeck: [...cards('fish', 'milk', 'shrimp', 'snack', 'chicken'), ...s.trashDeck],
    });
    for (let i = 0; i < 4; i++) s = act(s, { type: 'dig', playerId: me }).state;
    expect(getPlayerView(s, me).trashDiggable).toBe(false);
    expectError(s, { type: 'dig', playerId: me }, 'error.digLimit');
    act(s, { type: 'stop', playerId: me });
  });

  it('Blackout: two stall cards face down — their kind is nobody’s business until picked', () => {
    const s = game(['blackout']);
    expect(s.faceDown).toHaveLength(2);
    const view = getPlayerView(s, 'a');
    expect(view.market).toHaveLength(2);
    expect(view.faceDownMarket).toEqual(s.faceDown);
    const seen = reachableCardIds(view);
    for (const id of s.faceDown) expect(seen.has(id)).toBe(false);
    // The pick reveals it.
    const bid = bidAll(s, { a: 1, b: 2, c: 3 });
    const hidden = s.faceDown[0]!;
    const picked = act(bid.state, { type: 'pick', playerId: 'c', cardId: hidden });
    expect(picked.events.find((e) => e.type === 'CARD_PICKED')).toMatchObject({
      card: { id: hidden },
    });
    expect(picked.state.faceDown).toEqual([s.faceDown[1]]);
  });

  it('Kind Vendor: everyone gets a free card from the bin — never a dog', () => {
    const s = game(['kindVendor']);
    const gifts = s.players.map((p) => p.hand);
    for (const hand of gifts) {
      expect(hand).toHaveLength(1);
      expect(hand[0]!.kind).not.toBe('dog');
    }
  });

  it('Bargain Rush: the cheapest food (all tied ones) gets 1 dearer, never above 5', () => {
    let s = game(['seafoodFest', 'bargainRush']);
    expect(s.prices.fish).toBe(5); // round 1: all at 5, nothing changes
    s = patch(s, { prices: { ...s.prices, fish: 2, milk: 2, chicken: 4 } });
    s = finishRound(s);
    expect(s.prices).toMatchObject({ fish: 3, milk: 3, chicken: 4, snack: 5 });
  });

  it('Sleepy Dogs: the round’s first dog is asleep — whoever meets it; the next one is awake', () => {
    let s = skipToTrash(game(['sleepyDogs'])).state;
    const first = current(s);
    const fish = card('fish');
    s = patch(s, { trashDeck: [fish, card('dog'), ...s.trashDeck] });
    s = act(s, { type: 'dig', playerId: first }).state;
    const slept = act(s, { type: 'dig', playerId: first });
    expect(eventTypes(slept.events)).toContain('DOG_SLEPT');
    expect(slept.state.bag).toEqual([fish]);
    expect(current(slept.state)).toBe(first);
    s = act(slept.state, { type: 'stop', playerId: first }).state;
    // The next player's dog is wide awake.
    const second = current(s);
    s = patch(s, { trashDeck: [card('dog'), ...s.trashDeck] });
    const awake = act(s, { type: 'dig', playerId: second });
    expect(eventTypes(awake.events)).toContain('DOG_CAUGHT');
  });

  it('Gusty Wind: everyone with cards passes one to the next seat, chosen in secret', () => {
    let s = skipToTrash(game(['gustyWind'])).state;
    const [fish, milk] = [card('fish'), card('milk')];
    s = patch(s, {
      players: s.players.map((p) => ({
        ...p,
        hand: p.id === 'a' ? [fish] : p.id === 'b' ? [milk] : [],
      })),
    });
    s = stopAll(s).state;
    expect(s.phase).toBe('pass');
    expect(Object.keys(s.passes).sort()).toEqual(['a', 'b']);
    s = act(s, { type: 'passCard', playerId: 'a', cardId: fish.id }).state;
    // b sees that a has chosen, not what.
    const bView = getPlayerView(s, 'b');
    expect(bView.players.find((p) => p.id === 'a')).toMatchObject({ hasPassed: true });
    expect(bView.yourPass).toBeNull();
    expect(getPlayerView(s, 'a').yourPass).toBe(fish.id);
    expectError(s, { type: 'passCard', playerId: 'c', cardId: milk.id }, 'error.noPassNeeded');
    const done = act(s, { type: 'passCard', playerId: 'b', cardId: milk.id });
    expect(player(done.state, 'b').hand).toEqual([fish]);
    expect(player(done.state, 'c').hand).toEqual([milk]);
    expect(eventTypes(done.events)).toContain('CARDS_PASSED');
    expect(['eat', 'bidding']).toContain(done.state.phase);
  });

  it('Queue Flip: the lowest unique number picks first; clashes still come last', () => {
    const s = createGame({
      playerIds: ['a', 'b', 'c', 'd'],
      seed: 'flip',
      events: true,
      eventTop: ['queueFlip'],
    });
    const bid = bidAll(s, { a: 5, b: 1, c: 3, d: 3 });
    expect(bid.state.pickQueue.slice(0, 2)).toEqual(['b', 'a']);
  });

  it('Full Moon: spent powers come back (powers on)', () => {
    let s = game(['seafoodFest', 'fullMoon'], { powers: true });
    s = patch(s, { powers: { ...s.powers, b: { cat: 'korat', used: true } } });
    const next = finishRound(s);
    expect(next.powers!.b!.used).toBe(false);
  });

  it('Snack Sale: snack meals do not lower the price (powers off)', () => {
    let s = skipToTrash(game(['snackSale'])).state;
    s = patch(s, {
      players: s.players.map((p) => ({
        ...p,
        hand: p.id === 'a' ? cards('snack', 'snack', 'snack') : [],
      })),
    });
    s = stopAll(s).state;
    const ate = act(s, {
      type: 'eat',
      playerId: 'a',
      cardIds: player(s, 'a').hand.map((c) => c.id),
    });
    expect(ate.state.prices.snack).toBe(5);
  });
});

describe('whole games with events', () => {
  it.each([2, 3, 4])(
    'finish with every card accounted for (%i players, events and Market Mayhem)',
    (n) => {
      for (const powers of [false, true]) {
        for (let seed = 0; seed < 12; seed++) {
          const rng = createRng(`ev:${n}:${seed}`);
          const chosen = rng.shuffle([...CAT_IDS]).slice(0, n);
          const cats = powers
            ? Object.fromEntries(P.slice(0, n).map((id, i) => [id, chosen[i]!]))
            : undefined;
          let expected: number[] | null = null;
          const { final } = playRandomGame(
            `ev:${powers}:${seed}`,
            n,
            (state) => {
              const ids = allCardIds(state).sort((a, b) => a - b);
              expected ??= ids;
              expect(ids).toEqual(expected);
            },
            DEFAULT_CONFIG,
            cats,
            true,
          );
          expect(final.phase).toBe('gameOver');
        }
      }
    },
  );

  it('knows every event id', () => {
    expect(EVENT_IDS).toHaveLength(13);
  });
});
