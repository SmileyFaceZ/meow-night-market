import { BOT_PERSONALITIES, ERROR_KEYS, FOOD_TYPES } from '@meow/engine';
import { describe, expect, it } from 'vitest';
import en from '../src/i18n/en.json';
import th from '../src/i18n/th.json';

type Tree = { [key: string]: string | Tree };

function flatten(tree: Tree, prefix = ''): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') out.set(path, value);
    else for (const [k, v] of flatten(value, path)) out.set(k, v);
  }
  return out;
}

const placeholders = (text: string) =>
  [...text.matchAll(/{{\s*(\w+)\s*}}/g)].map((m) => m[1]).sort();

const thKeys = flatten(th);
const enKeys = flatten(en);

describe('i18n dictionaries (docs/I18N.md)', () => {
  it('th.json and en.json have exactly the same keys', () => {
    expect([...enKeys.keys()].sort()).toEqual([...thKeys.keys()].sort());
  });

  it('no translation is empty', () => {
    for (const [key, value] of [...thKeys, ...enKeys]) {
      expect(value.trim(), key).not.toBe('');
    }
  });

  it('both languages use the same {{placeholders}} for each key', () => {
    for (const [key, value] of thKeys) {
      expect(placeholders(enKeys.get(key) ?? ''), key).toEqual(placeholders(value));
    }
  });

  it('glossary terms match docs/I18N.md', () => {
    const glossary: Record<string, [string, string]> = {
      'game.title': ['แมวตลาดโต้รุ่ง', 'Meow Night Market'],
      'phase.bidding': ['แย่งแผงอาหาร', 'Stall Scramble'],
      'phase.trash': ['คุ้ยถังขยะ', 'Trash Dig'],
      'phase.eat': ['เวลากิน', 'Feast Time'],
      'card.goldfish': ['ปลาทองคำ', 'Golden Fish'],
      'card.dog': ['หมายาม', 'Guard Dog'],
      'term.clash': ['ชนกัน!', 'Clash!'],
      'term.bigMeal': ['มื้อใหญ่', 'Big Feast'],
      'bonus.variety': ['แมวกินเก่ง', 'Foodie Bonus'],
      'bot.greedy': ['แมวส้มตะกละ', 'Greedy Ginger'],
      'bot.sly': ['แมวดำเจ้าเล่ห์', 'Sly Shadow'],
      'bot.careful': ['แมวขาวขี้ระวัง', 'Careful Snowy'],
    };
    for (const [key, [thText, enText]] of Object.entries(glossary)) {
      expect(thKeys.get(key), key).toBe(thText);
      expect(enKeys.get(key), key).toBe(enText);
    }
  });

  it('translates every error key, phase, card and bot the engine can produce', () => {
    const phases = ['bidding', 'pick', 'trash', 'eat', 'discard', 'gameOver'];
    const needed = [
      ...ERROR_KEYS,
      ...phases.map((p) => `phase.${p}`),
      ...[...FOOD_TYPES, 'goldfish', 'bone', 'dog'].map((k) => `card.${k}`),
      ...BOT_PERSONALITIES.flatMap((b) => [`bot.${b}`, `botDesc.${b}`]),
    ];
    for (const key of needed) {
      expect(thKeys.has(key), key).toBe(true);
      expect(enKeys.has(key), key).toBe(true);
    }
  });
});
