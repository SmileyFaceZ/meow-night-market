// Balance statistics: plays many bot-vs-bot games for every player count and bot
// line-up, then prints a Markdown report (Thai headings).
// Usage: npm run balance -- [--games 300] [--players 2,3,4] [--variants base,noB]
//                            [--difficulty normal] [--out file.md] [--brief]

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

/** Rule sets to compare (config may depend on the player count). `base` = GAME_RULES.md. */
const D = DEFAULT_CONFIG;
/** M: meow numbers 1..(players + 3) → 2 players 1–5, 3 players 1–6, 4 players 1–7. */
const wideMeow = (n: number) => Array.from({ length: n + 3 }, (_, i) => i + 1);
const VARIANTS: Record<string, { label: string; config: (players: number) => GameConfig }> = {
  base: { label: 'กติกาปัจจุบัน (D+E+R)', config: () => D },
  M: {
    label: 'M: เลขเหมียวตามจำนวนผู้เล่น (1–5/1–6/1–7)',
    config: (n) => ({ ...D, meowValues: wideMeow(n) }),
  },
  S: {
    label: 'S: ลำดับตัดสินเสมอรอบ 2+ แต้มน้อยก่อน',
    config: () => ({ ...D, tieOrderByScore: true }),
  },
  MS: {
    label: 'M+S',
    config: (n) => ({ ...D, meowValues: wideMeow(n), tieOrderByScore: true }),
  },
  Xt: {
    label: 'Xt: เลขเท่ากัน คนที่ได้เลือกของก่อน ต้องคุ้ยทีหลัง',
    config: () => ({ ...D, tieReverse: 'trash' }),
  },
  SXt: { label: 'S+Xt', config: () => ({ ...D, tieOrderByScore: true, tieReverse: 'trash' }) },
  SXtC4: {
    label: 'S+Xt + หมา 3 ตัวเฉพาะ 4 คน',
    config: (n) => ({
      ...D,
      tieOrderByScore: true,
      tieReverse: 'trash',
      dogCopies: n === 4 ? 3 : 4,
    }),
  },
  MC: {
    label: 'M+C (หมา 3 ตัว)',
    config: (n) => ({ ...D, meowValues: wideMeow(n), dogCopies: 3 }),
  },
  MSC: {
    label: 'M+S+C',
    config: (n) => ({ ...D, meowValues: wideMeow(n), tieOrderByScore: true, dogCopies: 3 }),
  },
};
const variantNames = values.variants.split(',');
for (const name of variantNames) {
  if (!VARIANTS[name]) {
    throw new Error(`unknown variant "${name}" (${Object.keys(VARIANTS).join(', ')})`);
  }
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
  personalities: BotPersonality[]; // by seat
  scores: number[]; // by seat
  meals: number[]; // by seat
  winShare: number[]; // by seat: 1/k for each of k winners
  firstTieSeat: number; // seat first in round 1's tie-break order
  rounds: number;
  roundsWithClash: number;
  clashedPlayers: number;
  digs: number;
  dogs: number;
  caught: number;
  trashTurns: number;
  gained: number;
  /** Cards gained per player-round, split by whether the player clashed that round. */
  clashRounds: number;
  clashGain: number;
  clashGainStall: number; // market pick + free draw
  cleanRounds: number;
  cleanGain: number;
  cleanGainStall: number;
  /** Of those cards, how many the same player eventually ate in a meal. */
  clashEaten: number;
  cleanEaten: number;
}

function playGame(config: GameConfig, lineup: BotPersonality[], seed: string): GameRecord {
  const seatRng = createRng(`seats:${seed}`);
  const personalities = seatRng.shuffle(lineup);
  const ids = personalities.map((_, i) => `p${i}`);
  let state = createGame({ playerIds: ids, seed, config });
  const botRng = createRng(`bots:${seed}`);

  const rec: GameRecord = {
    players: ids.length,
    personalities,
    scores: [],
    meals: [],
    winShare: [],
    firstTieSeat: ids.indexOf(state.tieOrder[0]!),
    rounds: 0,
    roundsWithClash: 0,
    clashedPlayers: 0,
    digs: 0,
    dogs: 0,
    caught: 0,
    trashTurns: 0,
    gained: 0,
    clashRounds: 0,
    clashGain: 0,
    clashGainStall: 0,
    cleanRounds: 0,
    cleanGain: 0,
    cleanGainStall: 0,
    clashEaten: 0,
    cleanEaten: 0,
  };

  // Per-round tally of cards gained, keyed by player id.
  let clashed = new Set<string>();
  let gain: Record<string, { total: number; stall: number }> = {};
  // Every card gained, tagged with who gained it and whether they had clashed that round.
  const gained: { playerId: string; cardId: number; clashed: boolean }[] = [];
  let pending: { playerId: string; cardId: number }[] = [];
  const add = (id: string, cardIds: number[], stall = false) => {
    const g = (gain[id] ??= { total: 0, stall: 0 });
    g.total += cardIds.length;
    if (stall) g.stall += cardIds.length;
    for (const cardId of cardIds) pending.push({ playerId: id, cardId });
  };
  const closeRound = () => {
    if (rec.rounds === 0) return;
    for (const g of pending) gained.push({ ...g, clashed: clashed.has(g.playerId) });
    pending = [];
    for (const id of ids) {
      const g = gain[id] ?? { total: 0, stall: 0 };
      if (clashed.has(id)) {
        rec.clashRounds++;
        rec.clashGain += g.total;
        rec.clashGainStall += g.stall;
      } else {
        rec.cleanRounds++;
        rec.cleanGain += g.total;
        rec.cleanGainStall += g.stall;
      }
    }
  };

  const onEvent = (e: GameEvent) => {
    switch (e.type) {
      case 'BIDS_REVEALED':
        rec.rounds++;
        clashed = new Set();
        gain = {};
        return;
      case 'BID_CLASH':
        rec.clashedPlayers += e.playerIds.length;
        for (const id of e.playerIds) clashed.add(id);
        return;
      case 'CARD_PICKED':
        add(e.playerId, [e.card.id], true);
        return;
      case 'CARD_DUG':
        rec.digs++;
        if (e.to === 'dog') rec.dogs++;
        if (e.to === 'hand') {
          rec.gained++;
          add(e.playerId, [e.card.id]);
        }
        return;
      case 'DOG_CAUGHT':
        rec.caught++;
        rec.trashTurns++;
        return;
      case 'BAG_KEPT':
        rec.trashTurns++;
        rec.gained += e.cards.length;
        add(
          e.playerId,
          e.cards.map((c) => c.id),
        );
        return;
      case 'ROUND_STARTED':
      case 'GAME_OVER':
        closeRound();
        return;
      default:
        return;
    }
  };

  while (state.phase !== 'gameOver') {
    const actors = pendingActors(state);
    const actor = actors[botRng.int(actors.length)]!;
    const seat = ids.indexOf(actor);
    const bot = personalities[seat]!;
    const action = chooseBotAction(bot, DIFFICULTY, getPlayerView(state, actor), botRng);
    if (!action) throw new Error(`bot ${actor} had no action in ${state.phase}`);
    const result = applyAction(state, action);
    if (!result.ok) throw new Error(`bot ${actor} (${bot}) ${action.type}: ${result.error}`);
    state = result.state;
    if (result.events.some((e) => e.type === 'BID_CLASH')) rec.roundsWithClash++;
    result.events.forEach(onEvent);
  }

  const eatenBy = new Map<number, string>();
  for (const p of state.players)
    for (const m of p.meals) for (const c of m.cards) eatenBy.set(c.id, p.id);
  for (const g of gained) {
    if (eatenBy.get(g.cardId) !== g.playerId) continue;
    if (g.clashed) rec.clashEaten++;
    else rec.cleanEaten++;
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
  fairShare: number;
  seatWin: number[]; // by seat index
  firstTieWin: number; // player first in round 1's tie-break order
  clashGain: number;
  clashGainStall: number;
  cleanGain: number;
  cleanGainStall: number;
  clashEaten: number;
  cleanEaten: number;
  byBot: Record<string, { seats: number; wins: number; score: number; meals: number }>;
}

function summarize(records: GameRecord[]): Summary {
  const n = records[0]!.players;
  let seats = 0;
  let scoreSum = 0;
  let mealSum = 0;
  let zero = 0;
  let winnerSum = 0;
  let firstTieWins = 0;
  const seatWin = Array<number>(n).fill(0);
  const byBot: Summary['byBot'] = {};
  const sum = (key: keyof GameRecord) => records.reduce((acc, r) => acc + (r[key] as number), 0);

  for (const r of records) {
    winnerSum += Math.max(...r.scores);
    firstTieWins += r.winShare[r.firstTieSeat]!;
    for (let seat = 0; seat < n; seat++) {
      seats++;
      scoreSum += r.scores[seat]!;
      mealSum += r.meals[seat]!;
      if (r.scores[seat] === 0) zero++;
      seatWin[seat]! += r.winShare[seat]!;
      const bot = (byBot[r.personalities[seat]!] ??= { seats: 0, wins: 0, score: 0, meals: 0 });
      bot.seats++;
      bot.wins += r.winShare[seat]!;
      bot.score += r.scores[seat]!;
      bot.meals += r.meals[seat]!;
    }
  }
  const digs = sum('digs');
  const turns = sum('trashTurns');
  const clashRounds = sum('clashRounds');
  const cleanRounds = sum('cleanRounds');
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
    fairShare: 1 / n,
    seatWin: seatWin.map((w) => w / records.length),
    firstTieWin: firstTieWins / records.length,
    clashGain: sum('clashGain') / clashRounds,
    clashGainStall: sum('clashGainStall') / clashRounds,
    cleanGain: sum('cleanGain') / cleanRounds,
    cleanGainStall: sum('cleanGainStall') / cleanRounds,
    clashEaten: sum('clashEaten') / clashRounds,
    cleanEaten: sum('cleanEaten') / cleanRounds,
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
  '| ผู้เล่น | เกม | แต้มผู้ชนะ | แต้มเฉลี่ย | มื้อ/คน/เกม | จบ 0 แต้ม | รอบที่มีชน | ชน ต่อคนต่อรอบ | เจอหมา/คุ้ย | โดนไล่/คุ้ย | คุ้ย/ตา | ได้การ์ด/ตาคุ้ย | ได้การ์ด/รอบ: ไม่ชน vs ชน (จากแผง+จั่วฟรี) | ได้การ์ดที่ได้กินจริง/รอบ: ไม่ชน vs ชน | ชนะตามที่นั่ง (ยุติธรรม) | ลำดับเสมอที่ 1 ในรอบแรกชนะ |';
const SUMMARY_SEP = '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|';
const summaryRow = (label: string, s: Summary) =>
  `| ${label} | ${s.games} | ${f1(s.winnerAvg)} | ${f1(s.scoreAvg)} | ${f2(s.mealsPerPlayer)} ${mark(s.mealsPerPlayer >= 2 && s.mealsPerPlayer <= 4)} | ${pct(s.zeroRate)} ${mark(s.zeroRate <= 0.1)} | ${pct(s.clashRoundRate)} | ${pct(s.clashPlayerRate)} | ${pct(s.dogPerDig)} | ${pct(s.caughtPerDig)} | ${f2(s.digsPerTurn)} | ${f2(s.gainedPerTurn)} | ${f2(s.cleanGain)} vs ${f2(s.clashGain)} (${f2(s.cleanGainStall)} vs ${f2(s.clashGainStall)}) ${mark(s.cleanGain > s.clashGain)} | ${f2(s.cleanEaten)} vs ${f2(s.clashEaten)} ${mark(s.cleanEaten > s.clashEaten * 1.1)} | ${s.seatWin.map(pct).join(' / ')} (${pct(s.fairShare)}) | ${pct(s.firstTieWin)} |`;

const started = performance.now();
out(`# รายงานสมดุลเกม (บอทระดับ ${DIFFICULTY}, ${GAMES} เกมต่อไลน์อัป)`);
out();
out('ย่อชื่อบอท: ส้ม = greedy · ดำ = sly · ขาว = careful · สลับที่นั่งแบบสุ่มทุกเกม');
out('เป้าหมาย: มื้อ/คน/เกม 2–4 · จบด้วย 0 แต้มไม่เกิน 10% · คนไม่ชนได้การ์ดต่อรอบมากกว่าคนชน');

const comparison: [string, [number, Summary][]][] = [];
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
        recs.push(playGame(config(n), lineup, `${values.seed}:${n}:${lineup.join('-')}:${i}`));
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
  }

  out();
  out('### สรุปตามจำนวนผู้เล่น');
  out();
  out(SUMMARY_HEAD);
  out(SUMMARY_SEP);
  for (const [n, s] of perCount) out(summaryRow(`${n} คน`, s));
  comparison.push([variant, perCount]);
  out();
  out('### อัตราชนะตามนิสัยบอท (ทุกไลน์อัปรวมกัน)');
  out();
  out('| ผู้เล่น | ส้ม (greedy) | ดำ (sly) | ขาว (careful) | ห่างสุด | ค่ายุติธรรม |');
  out('|---|---|---|---|---|---|');
  for (const [n, s] of perCount) {
    const rates = BOT_PERSONALITIES.map((p) => s.byBot[p]!.wins / s.byBot[p]!.seats);
    const spread = Math.max(...rates) - Math.min(...rates);
    out(
      `| ${n} คน | ${rates.map(pct).join(' | ')} | ${(spread * 100).toFixed(1)} จุด ${mark(spread <= 0.1)} | ${pct(1 / n)} |`,
    );
  }
  if (!values.brief) for (const l of detail) out(l);
}

if (variantNames.length > 1) {
  out();
  out('## เทียบทุกตัวเลือก');
  out();
  out(
    '| ตัวเลือก | ผู้เล่น | มื้อ/คน/เกม | จบ 0 แต้ม | รอบที่มีชน | ชนต่อคนต่อรอบ | ได้กินจริง ไม่ชน vs ชน | ลำดับที่ 1 รอบแรกชนะ | บอทห่างสุด |',
  );
  out('|---|---|---|---|---|---|---|---|---|');
  for (const [variant, rows] of comparison) {
    for (const [n, s] of rows) {
      const mealsOk =
        n === 4 ? s.mealsPerPlayer >= 1.8 : s.mealsPerPlayer >= 2 && s.mealsPerPlayer <= 4;
      const rates = BOT_PERSONALITIES.map((p) => s.byBot[p]!.wins / s.byBot[p]!.seats);
      const spread = Math.max(...rates) - Math.min(...rates);
      out(
        `| ${variant} | ${n} | ${f2(s.mealsPerPlayer)} ${mark(mealsOk)} | ${pct(s.zeroRate)} ${mark(s.zeroRate <= 0.1)} | ${pct(s.clashRoundRate)} | ${pct(s.clashPlayerRate)} | ${f2(s.cleanEaten)} vs ${f2(s.clashEaten)} ${mark(n === 2 || s.cleanEaten > s.clashEaten)} | ${pct(s.firstTieWin)} ${mark(s.firstTieWin <= s.fairShare + 0.03)} | ${(spread * 100).toFixed(1)} ${mark(spread <= 0.1)} |`,
      );
    }
  }
}

out();
out(`_ใช้เวลา ${((performance.now() - started) / 1000).toFixed(1)} วินาที_`);

const report = lines.join('\n') + '\n';
console.log(report);
if (values.out) writeFileSync(values.out, report);
