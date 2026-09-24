import type { CardKind } from '@meow/engine';

// Shared drawing constants for the flat, thick-outlined style (docs/ART_DIRECTION.md).
// Colours always come from CSS variables so themes can swap them.

export const INK = 'var(--ink)';
export const STROKE = 3;

export const outline = {
  stroke: INK,
  strokeWidth: STROKE,
  strokeLinejoin: 'round',
  strokeLinecap: 'round',
} as const;

/** Tiny corner badge colour per kind (the art itself carries the shape). */
export const KIND_COLOR: Record<CardKind, string> = {
  fish: 'var(--fish)',
  chicken: 'var(--chicken)',
  shrimp: 'var(--shrimp)',
  milk: 'var(--milk)',
  snack: 'var(--snack)',
  goldfish: 'var(--gold)',
  bone: '#FFFDF6',
  dog: 'var(--danger)',
};
