// Cat powers (GAME_RULES §14). One power per cat, usable once per game.
// Which power is usable when is decided here, so actions, views and bots agree.

import { findMealOptions, isFood } from './cards.ts';
import type { FoodType } from './config.ts';
import { currentPlayer } from './rules.ts';
import type { Card, CardId, GameState, PlayerId } from './types.ts';

export const CAT_IDS = [
  'orange',
  'black',
  'white',
  'calico',
  'korat',
  'siamese',
  'tabby',
  'chubby',
] as const;
export type CatId = (typeof CAT_IDS)[number];

export const POWER_IDS = [
  'keenNose',
  'secondThought',
  'scavenger',
  'luckySwap',
  'goodLuck',
  'extraOrder',
  'haggle',
  'bigAppetite',
] as const;
export type PowerId = (typeof POWER_IDS)[number];

export const CAT_POWER: Readonly<Record<CatId, PowerId>> = {
  orange: 'keenNose',
  black: 'secondThought',
  white: 'scavenger',
  calico: 'luckySwap',
  korat: 'goodLuck',
  siamese: 'extraOrder',
  tabby: 'haggle',
  chubby: 'bigAppetite',
};

/** What a player asks for when using their power (the payload depends on the power). */
export type PowerUse =
  | { readonly power: 'keenNose' }
  | { readonly power: 'secondThought'; readonly value: number }
  | { readonly power: 'scavenger'; readonly cardId: CardId }
  | { readonly power: 'luckySwap'; readonly cardId: CardId }
  | { readonly power: 'goodLuck' }
  | { readonly power: 'extraOrder' }
  | { readonly power: 'haggle'; readonly food: FoodType }
  | { readonly power: 'bigAppetite'; readonly cardIds: readonly CardId[] };

export interface PowerState {
  readonly cat: CatId;
  readonly used: boolean;
}

/** A moment where the game waits for one player to use a power or let it pass. */
export interface PowerWindow {
  readonly playerId: PlayerId;
  readonly power: 'luckySwap' | 'secondThought';
}

/** Keen Nose: the top of the bin as the sniffer knows it (secret to everyone else). */
export interface Peek {
  readonly playerId: PlayerId;
  /** Known top cards, in draw order. */
  readonly cards: readonly Card[];
  /** False while choosing which card (if any) goes to the bottom. */
  readonly decided: boolean;
}

type PowerView = Pick<
  GameState,
  | 'powers'
  | 'powerWindow'
  | 'peek'
  | 'phase'
  | 'players'
  | 'pickQueue'
  | 'turnOrder'
  | 'turnIndex'
  | 'digCount'
  | 'pendingDog'
  | 'discard'
  | 'prices'
  | 'config'
  | 'round'
  | 'market'
  | 'extraOrder'
  | 'revealedBids'
  | 'trashDeck'
>;

/** The player's power, if it is still unused (null in classic games). */
export function unusedPower(s: Pick<GameState, 'powers'>, playerId: PlayerId): PowerId | null {
  const p = s.powers?.[playerId];
  return p && !p.used ? CAT_POWER[p.cat] : null;
}

/** The first food (or goldfish) card from the top of the bin — dogs and bones stay put. */
export function topFoodInBin(trashDeck: readonly Card[]): Card | null {
  return trashDeck.find((c) => isFood(c.kind) || c.kind === 'goldfish') ?? null;
}

/** Cards Scavenger may take from the discard pile: food and golden fish. */
export function scavengeable(discard: readonly Card[]): Card[] {
  return discard.filter((c) => isFood(c.kind) || c.kind === 'goldfish');
}

/** Big Appetite: every pair of one food (no golden fish) the player could eat. */
export function pairOptions(hand: readonly Card[]): { food: FoodType; cardIds: CardId[] }[] {
  const out: { food: FoodType; cardIds: CardId[] }[] = [];
  for (const card of hand) {
    if (!isFood(card.kind) || out.some((o) => o.food === card.kind)) continue;
    const same = hand.filter((c) => c.kind === card.kind);
    if (same.length >= 2) out.push({ food: card.kind, cardIds: [same[0]!.id, same[1]!.id] });
  }
  return out;
}

/** Second Thought: bids one away from the revealed one that are still in hand. */
export function secondThoughtValues(s: PowerView, playerId: PlayerId): number[] {
  const bid = s.revealedBids?.[playerId];
  const player = s.players.find((p) => p.id === playerId);
  if (bid === undefined || !player) return [];
  return [bid - 1, bid + 1].filter((v) => player.meowLeft.includes(v));
}

const isCurrent = (s: PowerView, playerId: PlayerId) => currentPlayer(s as GameState) === playerId;

/** Food eaten by this player already this round (Haggle is only before the first meal). */
const ateThisRound = (s: PowerView, playerId: PlayerId) =>
  s.players.find((p) => p.id === playerId)?.meals.some((m) => m.round === s.round) ?? false;

/**
 * Can `playerId` use their power right now (ignoring the payload)? Windows and peeks
 * are handled first: while one is open, only its owner may act, and only on it.
 */
export function canUsePowerNow(s: PowerView, playerId: PlayerId): boolean {
  const power = unusedPower(s, playerId);
  if (!power) return false;
  if (s.powerWindow) return s.powerWindow.playerId === playerId && s.powerWindow.power === power;
  if (s.peek) return false;
  if (!isCurrent(s, playerId)) return false;
  switch (power) {
    case 'keenNose':
      return s.phase === 'trash' && s.digCount === 0 && !s.pendingDog && s.trashDeck.length > 0;
    case 'goodLuck':
      return s.phase === 'trash' && s.pendingDog !== null;
    case 'extraOrder':
      return s.phase === 'pick' && s.extraOrder === null && s.market.length >= 2;
    case 'scavenger':
      return s.phase === 'eat' && scavengeable(s.discard).length > 0;
    case 'haggle':
      return (
        s.phase === 'eat' &&
        !ateThisRound(s, playerId) &&
        Object.values(s.prices).some((p) => p < s.config.startPrice)
      );
    case 'bigAppetite': {
      const hand = s.players.find((p) => p.id === playerId)?.hand ?? [];
      return s.phase === 'eat' && pairOptions(hand).length > 0;
    }
    // Only inside their windows.
    case 'luckySwap':
    case 'secondThought':
      return false;
  }
}

/**
 * Feast Time turns are skipped when there is nothing to do (§6). With powers, "something
 * to do" includes a meal Big Appetite allows and a card Scavenger could take.
 */
export function hasEatingChoice(s: PowerView, playerId: PlayerId): boolean {
  const hand = s.players.find((p) => p.id === playerId)?.hand ?? [];
  if (findMealOptions(hand, s.config).length > 0) return true;
  const power = unusedPower(s, playerId);
  if (power === 'bigAppetite') return pairOptions(hand).length > 0;
  if (power === 'scavenger') return scavengeable(s.discard).length > 0;
  return false;
}

/** Is this the pair Big Appetite may eat? (2 cards, one food, no golden fish.) */
export function isAppetitePair(cards: readonly Card[]): FoodType | null {
  if (cards.length !== 2) return null;
  const [a, b] = cards as [Card, Card];
  return isFood(a.kind) && a.kind === b.kind ? a.kind : null;
}
