import { type Card, type CardKind, FOOD_TYPES } from '@meow/engine';

const KIND_ORDER: readonly CardKind[] = [...FOOD_TYPES, 'goldfish', 'bone', 'dog'];

/** Hand sorted by kind, then grouped into stacks for compact display. */
export function groupCards(cards: readonly Card[]): { kind: CardKind; cards: Card[] }[] {
  return KIND_ORDER.map((kind) => ({ kind, cards: cards.filter((c) => c.kind === kind) })).filter(
    (g) => g.cards.length > 0,
  );
}

export function sortCards(cards: readonly Card[]): Card[] {
  return groupCards(cards).flatMap((g) => g.cards);
}
