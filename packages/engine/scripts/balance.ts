// Balance statistics: plays many bot-vs-bot games for every player count and bot
// line-up, then prints a Markdown report (Thai headings).
// Usage: npm run balance -- [--games 300] [--players 2,3,4] [--variants base,A,B]
//                            [--difficulty normal] [--out docs/BALANCE.md] [--brief]

import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import {
  applyAction,
  BOT_PERSONALITIES,
  type BotDifficulty,
  type BotPersonality,
  chooseBotAction,
  createGame,
  createRng,
  DEFAULT_CONFIG,
  type GameConfig,
  type GameEvent,
  getPlayerView,
  pendingActors,
} from '../src/index.ts';

// ── options ──────────────────────────────────────────────────────────────────

const { values } = parseArgs({
  options: {
    games: { type: 'string', default: '300' },
    players: { type: 'string', default: '2,3,4' },
    variants: { type: 'string', default: 'base' },
    difficulty: { type: 'string', default: 'normal' },
    seed: { type: 'string', default: 'balance' },
    out: { type: 'string' },
    brief: { type: 'boolean', default: false },
  },
});
const GAMES = Number(values.games);
const PLAYER_COUNTS = values.players.split(',').map(Number);
const DIFFICULTY = values.difficulty as BotDifficulty;

/** Config variants to compare. Only `base` is the real rule set (docs/GAME_RULES.md). */
const D = DEFAULT_CONFIG;
const FOUR_FOODS = ['fish', 'chicken', 'shrimp', 'milk'] as const;
const VARIANTS: Record<string, { label: string; config: GameConfig }> = {
  base: { label: 'กติกาปัจจุบัน', config: DEFAULT_CONFIG },
  // Options proposed by the user
  A: { label: 'A: ของเหลือจากแผงสับเข้าถังขยะ', config: { ...D, leftoverMarketToTrash: true } },
  B: { label: 'B: คนที่ชนกันจั่วถังฟรี 1 ใบ', config: { ...D, clashConsolationDraws: 1 } },
  C: { label: 'C: หมา 3 ตัว', config: { ...D, dogCopies: 3 } },
  // Extra options found while analysing (see report)
  D: { label: 'D: สับกองทิ้งกลับเข้าถังทุกรอบ', config: { ...D, recycleDiscardEachRound: true } },
  E: {
    label: 'E: คนที่ชนกันยังได้เลือกของ (หลังคนไม่ชน)',
    config: { ...D, clashedPickLast: true },
  },
  F: { label: 'F: แผงตลาด = ผู้เล่น + 2', config: { ...D, marketExtra: 2 } },
  G: {
    label: 'G: อาหาร 4 ชนิด ชนิดละ 10 (ตัดขนม)',
    config: { ...D, foodTypes: FOUR_FOODS, foodCopies: 10 },
  },
  // Combinations
  AB: { label: 'A+B', config: { ...D, leftoverMarketToTrash: true, clashConsolationDraws: 1 } },
  AE: { label: 'A+E', config: { ...D, leftoverMarketToTrash: true, clashedPickLast: true } },
  DE: { label: 'D+E', config: { ...D, recycleDiscardEachRound: true, clashedPickLast: true } },
  BD: { label: 'B+D', config: { ...D, recycleDiscardEachRound: true, clashConsolationDraws: 1 } },
  ABC: {
    label: 'A+B+C',
    config: { ...D, leftoverMarketToTrash: true, clashConsolationDraws: 1, dogCopies: 3 },
  },
  ADE: {
    label: 'A+D+E',
    config: {
      ...D,
      leftoverMarketToTrash: true,
      recycleDiscardEachRound: true,
      clashedPickLast: true,
    },
  },
  BDE: {
    label: 'B+D+E',
    config: {
      ...D,
      recycleDiscardEachRound: true,
      clashedPickLast: true,
      clashConsolationDraws: 1,
    },
  },
  CDE: {
    label: 'C+D+E',
    config: { ...D, recycleDiscardEachRound: true, clashedPickLast: true, dogCopies: 3 },
  },
  T: { label: 'T: เลขเท่ากัน คนแต้มน้อยได้ก่อน', config: { ...D, clashTieBreak: 'lowestScore' } },
  R: { label: 'R: เลขเท่ากัน สุ่มลำดับใหม่ทุกรอบ', config: { ...D, clashTieBreak: 'random' } },
  DER: {
    label: 'D+E+R',
    config: { ...D, recycleDiscardEachRound: true, clashedPickLast: true, clashTieBreak: 'random' },
  },
  BDER: {
    label: 'B+D+E+R',
    config: {
      ...D,
      recycleDiscardEachRound: true,
      clashedPickLast: true,
      clashConsolationDraws: 1,
      clashTieBreak: 'random',
    },
  },
  DET: {
    label: 'D+E+T',
    config: {
      ...D,
      recycleDiscardEachRound: true,
      clashedPickLast: true,
      clashTieBreak: 'lowestScore',
    },
  },
  BDET: {
    label: 'B+D+E+T',
    config: {
      ...D,
      recycleDiscardEachRound: true,
      clashedPickLast: true,
      clashConsolationDraws: 1,
      clashTieBreak: 'lowestScore',
    },
  },
  DEG: {
    label: 'D+E+G',
    config: {
      ...D,
      recycleDiscardEachRound: true,
      clashedPickLast: true,
      foodTypes: FOUR_FOODS,
      foodCopies: 10,
    },
  },
};
const variantNames = values.variants.split(',');
for (const name of variantNames) {
  if (!VARIANTS[name])
    throw new Error(`unknown variant "${name}" (${Object.keys(VARIANTS).join(', ')})`);
}

// ── line-ups: every multiset of personalities of size n ─────────────────────

function lineups(n: number, from = 0): BotPersonality[][] {
  if (n === 0) return [[]];
  const out: BotPersonality[][] = [];
  for (let i = from; i < BOT_PERSONALITIES.length; i++) {
    for (const rest of lineups(n - 1, i)) out.push([BOT_PERSONALITIES[i]!, ...rest]);
  }
  return out;
}
const SHORT: Record<BotPersonality, string> = { greedy: 'ส้ม', sly: 'ดำ', careful: 'ขาว' };
const lineupName = (l: readonly BotPersonality[]) => l.map((p) => SHORT[p]).join('+');

// ── one game ─────────────────────────────────────────────────────────────────

interface GameRecord {
  players: number;
  lineup: string;
  personalities: BotPersonality[]; // by seat
  scores: number[]; // by seat
  meals: number[]; // by seat
  winShare: number[]; // by seat: 1/k for each of k winners
  startSeat: number;
  rounds: number;
  roundsWithClash: number;
  clashedPlayers: number;
  digs: number;
  dogs: number;
  caught: number;
  trashTurns: number;
  gained: number;
  actions: number;
}

function playGame(config: GameConfig, lineup: BotPersonality[], seed: string): GameRecord {
  const seatRng = createRng(`seats:${seed}`);
  const personalities = seatRng.shuffle(lineup);
  const ids = personalities.map((_, i) => `p${i}`);
  let state = createGame({ playerIds: ids, seed, config });
  const botRng = createRng(`bots:${seed}`);

  const rec: GameRecord = {
    players: ids.length,
    lineup: lineupName(lineup),
    personalities,
    scores: [],
    meals: [],
    winShare: [],
    startSeat: state.firstStartSeat,
    rounds: 0,
    roundsWithClash: 0,
    clashedPlayers: 0,
    digs: 0,
    dogs: 0,
    caught: 0,
    trashTurns: 0,
    gained: 0,
    actions: 0,
  };

  const onEvent = (e: GameEvent) => {
    switch (e.type) {
      case 'BIDS_REVEALED':
        rec.rounds++;
        return;
      case 'BID_CLASH':
        rec.clashedPlayers += e.playerIds.length;
        return;
      case 'CARD_DUG':
        rec.digs++;
        if (e.to === 'dog') rec.dogs++;
        if (e.to === 'hand') rec.gained++;
        return;
      case 'DOG_CAUGHT':
        rec.caught++;
        rec.trashTurns++;
        return;
      case 'BAG_KEPT':
        rec.trashTurns++;
        rec.gained += e.cards.length;
        return;
      default:
        return;
    }
  };

  while (state.phase !== 'gameOver') {
    const actors = pendingActors(state);
    const actor = actors[botRng.int(actors.length)]!;
    const seat = ids.indexOf(actor);
    const action = chooseBotAction(
      personalities[seat]!,
      DIFFICULTY,
      getPlayerView(state, actor),
      botRng,
    );
    if (!action) throw new Error(`bot ${actor} had no action in ${state.phase}`);
    const result = applyAction(state, action);
    if (!result.ok)
      throw new Error(`bot ${actor} (${personalities[seat]}) ${action.type}: ${result.error}`);
    state = result.state;
    rec.actions++;
    let clashThisRound = false;
    for (const e of result.events) {
      onEvent(e);
      if (e.type === 'BID_CLASH') clashThisRound = true;
    }
    if (clashThisRound) rec.roundsWithClash++;
  }

  const result = state.result!;
  rec.scores = result.scores.map((s) => s.total);
  rec.meals = state.players.map((p) => p.meals.length);
  rec.winShare = state.players.map((p) =>
    result.winners.includes(p.id) ? 1 / result.winners.length : 0,
  );
  return rec;
}

// ── aggregation ──────────────────────────────────────────────────────────────

interface Summary {
  games: number;
  winnerAvg: number;
  scoreAvg: number;
  mealsPerPlayer: number;
  zeroRate: number;
  clashRoundRate: number;
  clashPlayerRate: number;
  caughtPerDig: number;
  dogPerDig: number;
  gainedPerTurn: number;
  digsPerTurn: number;
  startWinRate: number;
  fairShare: number;
  seatOffsetWin: number[]; // by seats clockwise from the round-1 start player
  byBot: Record<string, { seats: number; wins: number; score: number; meals: number }>;
}

function summarize(records: GameRecord[]): Summary {
  const n = records[0]!.players;
  let seats = 0;
  let scoreSum = 0;
  let mealSum = 0;
  let zero = 0;
  let winnerSum = 0;
  let startWins = 0;
  const seatOffsetWin = Array<number>(n).fill(0);
  const byBot: Summary['byBot'] = {};
  const sum = (key: keyof GameRecord) => records.reduce((acc, r) => acc + (r[key] as number), 0);

  for (const r of records) {
    winnerSum += Math.max(...r.scores);
    startWins += r.winShare[r.startSeat]!;
    for (let seat = 0; seat < n; seat++) {
      seats++;
      scoreSum += r.scores[seat]!;
      mealSum += r.meals[seat]!;
      if (r.scores[seat] === 0) zero++;
      seatOffsetWin[(seat - r.startSeat + n) % n]! += r.winShare[seat]!;
      const bot = (byBot[r.personalities[seat]!] ??= { seats: 0, wins: 0, score: 0, meals: 0 });
      bot.seats++;
      bot.wins += r.winShare[seat]!;
      bot.score += r.scores[seat]!;
      bot.meals += r.meals[seat]!;
    }
  }
  const digs = sum('digs');
  const turns = sum('trashTurns');
  return {
    games: records.length,
    winnerAvg: winnerSum / records.length,
    scoreAvg: scoreSum / seats,
    mealsPerPlayer: mealSum / seats,
    zeroRate: zero / seats,
    clashRoundRate: sum('roundsWithClash') / sum('rounds'),
    clashPlayerRate: sum('clashedPlayers') / (sum('rounds') * n),
    caughtPerDig: sum('caught') / digs,
    dogPerDig: sum('dogs') / digs,
    gainedPerTurn: sum('gained') / turns,
    digsPerTurn: digs / turns,
    startWinRate: startWins / records.length,
    fairShare: 1 / n,
    seatOffsetWin: seatOffsetWin.map((w) => w / records.length),
    byBot,
  };
}

// ── report ───────────────────────────────────────────────────────────────────

const f1 = (x: number) => x.toFixed(1);
const f2 = (x: number) => x.toFixed(2);
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const mark = (ok: boolean) => (ok ? '✅' : '❌');

const lines: string[] = [];
const out = (s = '') => lines.push(s);

const SUMMARY_HEAD =
  '| ผู้เล่น | เกม | แต้มผู้ชนะ | แต้มเฉลี่ย | มื้อ/คน/เกม | จบ 0 แต้ม | รอบที่มีชน | ชน ต่อคนต่อรอบ | เจอหมา/คุ้ย | โดนไล่/คุ้ย | คุ้ย/ตา | ได้การ์ด/ตา | ผู้เริ่มเกมชนะ (ค่ายุติธรรม) |';
const SUMMARY_SEP = '|---|---|---|---|---|---|---|---|---|---|---|---|---|';
const summaryRow = (label: string, s: Summary) =>
  `| ${label} | ${s.games} | ${f1(s.winnerAvg)} | ${f1(s.scoreAvg)} | ${f2(s.mealsPerPlayer)} ${mark(s.mealsPerPlayer >= 2 && s.mealsPerPlayer <= 4)} | ${pct(s.zeroRate)} ${mark(s.zeroRate <= 0.1)} | ${pct(s.clashRoundRate)} | ${pct(s.clashPlayerRate)} | ${pct(s.dogPerDig)} | ${pct(s.caughtPerDig)} | ${f2(s.digsPerTurn)} | ${f2(s.gainedPerTurn)} | ${pct(s.startWinRate)} (${pct(s.fairShare)}) |`;

const started = performance.now();
out(`# รายงานสมดุลเกม (บอทระดับ ${DIFFICULTY}, ${GAMES} เกมต่อไลน์อัป)`);
out();
out('ย่อชื่อบอท: ส้ม = greedy · ดำ = sly · ขาว = careful · สลับที่นั่งแบบสุ่มทุกเกม');
out('เป้าหมาย: มื้อ/คน/เกม 2–4 · จบด้วย 0 แต้มไม่เกิน 10%');

const overall: Record<string, Summary[]> = {};
for (const variant of variantNames) {
  const { label, config } = VARIANTS[variant]!;
  out();
  out(`## ${label} (\`${variant}\`)`);
  const perCount: [number, Summary][] = [];
  const detail: string[] = [];

  for (const n of PLAYER_COUNTS) {
    const all: GameRecord[] = [];
    detail.push(
      '',
      `### ${n} ผู้เล่น — แยกตามไลน์อัป`,
      '',
      SUMMARY_HEAD.replace('ผู้เล่น', 'ไลน์อัป'),
      SUMMARY_SEP,
    );
    for (const lineup of lineups(n)) {
      const recs: GameRecord[] = [];
      for (let i = 0; i < GAMES; i++) {
        recs.push(playGame(config, lineup, `${values.seed}:${n}:${lineup.join('-')}:${i}`));
      }
      all.push(...recs);
      detail.push(summaryRow(lineupName(lineup), summarize(recs)));
    }
    const s = summarize(all);
    perCount.push([n, s]);

    detail.push('', `**${n} ผู้เล่น — แยกตามนิสัยบอท (ทุกไลน์อัปรวมกัน)**`, '');
    detail.push(
      '| บอท | ที่นั่ง | อัตราชนะ (ค่ายุติธรรม) | แต้มเฉลี่ย | มื้อ/เกม |',
      '|---|---|---|---|---|',
    );
    for (const p of BOT_PERSONALITIES) {
      const b = s.byBot[p]!;
      detail.push(
        `| ${SHORT[p]} (${p}) | ${b.seats} | ${pct(b.wins / b.seats)} (${pct(1 / n)}) | ${f1(b.score / b.seats)} | ${f2(b.meals / b.seats)} |`,
      );
    }
    detail.push(
      '',
      `อัตราชนะตามตำแหน่งที่นั่งนับจากผู้เริ่มเกม (0 = ผู้เริ่มเกม): ${s.seatOffsetWin.map((w, i) => `${i}: ${pct(w)}`).join(' · ')}`,
    );
  }

  out();
  out('### สรุปตามจำนวนผู้เล่น');
  out();
  out(SUMMARY_HEAD);
  out(SUMMARY_SEP);
  for (const [n, s] of perCount) out(summaryRow(`${n} คน`, s));
  overall[variant] = perCount.map(([, s]) => s);
  if (!values.brief) for (const l of detail) out(l);
}

out();
out(`_ใช้เวลา ${((performance.now() - started) / 1000).toFixed(1)} วินาที_`);

const report = lines.join('\n') + '\n';
console.log(report);
if (values.out) writeFileSync(values.out, report);
