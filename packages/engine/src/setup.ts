import { buildDeck } from './cards.ts';
import { DEFAULT_CONFIG, type GameConfig, validateConfig } from './config.ts';
import { cloneState, type Ctx, initialPrices, startRound } from './flow.ts';
import { marketSize } from './rules.ts';
import { createRng } from './rng.ts';
import type { GameState, PlayerId } from './types.ts';

export interface CreateGameOptions {
  /** 2–4 unique ids in seat order (clockwise). */
  readonly playerIds: readonly PlayerId[];
  readonly seed: number | string;
  readonly config?: GameConfig;
}

/** GAME_RULES §3 — returns a game already in round 1's bidding phase. */
export function createGame(options: CreateGameOptions): GameState {
  const config = options.config ?? DEFAULT_CONFIG;
  validateConfig(config);

  const { playerIds } = options;
  if (playerIds.length < config.minPlayers || playerIds.length > config.maxPlayers) {
    throw new Error(`need ${config.minPlayers}–${config.maxPlayers} players`);
  }
  if (new Set(playerIds).size !== playerIds.length) throw new Error('player ids must be unique');

  const rng = createRng(options.seed);
  const { food, hazards } = buildDeck(config, playerIds.length);

  // 1–3. Shuffle food + goldfish, deal the market deck, the rest (+ bones, dogs) becomes the bin.
  const shuffledFood = rng.shuffle(food);
  const marketCount = config.rounds * (playerIds.length + config.marketExtra);
  const marketDeck = shuffledFood.slice(0, marketCount);
  const trashDeck = rng.shuffle([...shuffledFood.slice(marketCount), ...hazards]);

  const base: GameState = {
    config,
    rng: 0,
    players: playerIds.map((id, seat) => ({
      id,
      seat,
      meowLeft: [...config.meowValues],
      hand: [],
      meals: [],
    })),
    round: 0,
    phase: 'bidding',
    tieOrder: [],
    prices: initialPrices(config.startPrice),
    marketDeck,
    market: [],
    trashDeck,
    discard: [],
    bids: {},
    revealedBids: null,
    clashed: [],
    pickQueue: [],
    turnOrder: [],
    turnIndex: 0,
    bag: [],
    pendingDog: null,
    pendingDiscards: {},
    result: null,
  };
  if (marketSize(base) * config.rounds !== marketDeck.length) {
    throw new Error('not enough food cards for the market deck');
  }

  const ctx: Ctx = { s: cloneState(base), rng, events: [] };
  startRound(ctx, 1);
  ctx.s.rng = rng.state;
  return ctx.s;
}
