import { BOT_DIFFICULTIES, BOT_PERSONALITIES, type BotPersonality } from '@meow/engine';
import { type BotSeat, CAT_COLORS, type CatColor, NAME_MAX_LENGTH, type SeatInfo } from './types';

export interface SoloSetup {
  readonly name: string;
  readonly cat: CatColor;
  readonly bots: readonly BotSeat[];
}

const SETUP_KEY = 'mnm.setup.v1';

/** Each bot personality has its own cat colour (matching its name). */
export const BOT_CAT: Record<BotPersonality, CatColor> = {
  greedy: 'orange',
  sly: 'black',
  careful: 'white',
};

export const DEFAULT_SETUP: SoloSetup = {
  name: '',
  cat: 'calico',
  bots: [
    { personality: 'greedy', difficulty: 'normal' },
    { personality: 'careful', difficulty: 'normal' },
  ],
};

export function loadSetup(): SoloSetup {
  try {
    const raw = localStorage.getItem(SETUP_KEY);
    if (!raw) return DEFAULT_SETUP;
    const data = JSON.parse(raw) as SoloSetup;
    if (!Array.isArray(data.bots)) return DEFAULT_SETUP;
    const bots = data.bots as readonly Partial<BotSeat>[];
    const valid =
      typeof data.name === 'string' &&
      (CAT_COLORS as readonly string[]).includes(data.cat) &&
      bots.length >= 1 &&
      bots.length <= 3 &&
      bots.every(
        (b) =>
          (BOT_PERSONALITIES as readonly unknown[]).includes(b.personality) &&
          (BOT_DIFFICULTIES as readonly unknown[]).includes(b.difficulty),
      );
    return valid ? { ...data, name: data.name.slice(0, NAME_MAX_LENGTH) } : DEFAULT_SETUP;
  } catch {
    return DEFAULT_SETUP;
  }
}

export function storeSetup(setup: SoloSetup): void {
  try {
    localStorage.setItem(SETUP_KEY, JSON.stringify(setup));
  } catch {
    // ignore
  }
}

export function seatsFromSetup(setup: SoloSetup): SeatInfo[] {
  return [
    { id: 'p0', name: setup.name.trim() || null, cat: setup.cat, bot: null },
    ...setup.bots.map((bot, i) => ({
      id: `p${i + 1}`,
      name: null,
      cat: BOT_CAT[bot.personality],
      bot,
    })),
  ];
}
