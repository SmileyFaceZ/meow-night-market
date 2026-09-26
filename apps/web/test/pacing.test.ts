import { EVENT_IDS, POWER_IDS } from '@meow/engine';
import { EVENT_TEXT, POPUP_TEXT, POWER_TEXT } from '@meow/protocol';
import { describe, expect, it } from 'vitest';
import en from '../src/i18n/en.json';
import th from '../src/i18n/th.json';

// The online server paces popups by how much text they show (DECISIONS 051), but it has
// no dictionaries: @meow/protocol keeps character counts. They must match the real strings.

type Tree = { [key: string]: string | Tree };
const lookup = (dict: Tree, key: string) =>
  key.split('.').reduce<string | Tree>((node, part) => (node as Tree)[part]!, dict) as string;
/** Fixed characters of a template (placeholders removed). */
const chars = (text: string) => text.replace(/{{[^}]*}}/g, '').trim().length;
const both = (key: string) => [chars(lookup(th, key)), chars(lookup(en, key))];

describe('popup reading times follow the real strings', () => {
  it('fixed popup texts', () => {
    for (const key of Object.keys(POPUP_TEXT)) {
      expect(POPUP_TEXT[key], `${key} — update POPUP_TEXT in pacing.ts`).toEqual(both(key));
    }
  });

  it('every event (name + description) and power name', () => {
    for (const id of EVENT_IDS) {
      const [thName, enName] = both(`eventName.${id}`);
      const [thDesc, enDesc] = both(`eventDesc.${id}`);
      expect(EVENT_TEXT[id], `EVENT_TEXT.${id}`).toEqual([thName! + thDesc!, enName! + enDesc!]);
    }
    for (const id of POWER_IDS) {
      expect(POWER_TEXT[id], `POWER_TEXT.${id}`).toEqual(both(`powerName.${id}`));
    }
  });
});
