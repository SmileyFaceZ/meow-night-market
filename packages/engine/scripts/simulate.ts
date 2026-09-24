// Plays one full game with random-move bots and prints a readable Thai log.
// Usage: npm run simulate -- [--seed <text|number>] [--players 2-4]
// (Phase 1 tool — the real bot personalities arrive in Phase 2.)

import { parseArgs } from 'node:util';
import {
  applyAction,
  type Card,
  type CardKind,
  chooseRandomAction,
  createGame,
  createRng,
  type GameEvent,
  getPlayerView,
  pendingActors,
} from '../src/index.ts';

const { values } = parseArgs({
  options: {
    seed: { type: 'string', default: 'meow' },
    players: { type: 'string', default: '3' },
  },
});
const seed = values.seed;
const playerCount = Number(values.players);

const CATS = ['แมวส้ม', 'แมวดำ', 'แมวขาว', 'แมวสามสี'];
const ids = CATS.slice(0, playerCount);
const CARD_TH: Record<CardKind, string> = {
  fish: 'ปลา',
  chicken: 'ไก่',
  shrimp: 'กุ้ง',
  milk: 'นม',
  snack: 'ขนม',
  goldfish: 'ปลาทองคำ',
  bone: 'กระดูก',
  dog: 'หมายาม',
};
const cardName = (c: Card) => CARD_TH[c.kind];
const list = (cs: readonly Card[]) => (cs.length ? cs.map(cardName).join(', ') : '—');

let state = createGame({ playerIds: ids, seed });
const botRng = createRng(`bots:${seed}`);

console.log(`🐾 แมวตลาดโต้รุ่ง — จำลองเกม seed="${seed}" ผู้เล่น ${playerCount} ตัว (บอทสุ่ม)`);
printRoundStart(state.round, state.tieOrder, state.market);

function printRoundStart(round: number, tieOrder: readonly string[], market: readonly Card[]) {
  console.log(`\n══════ รอบที่ ${round} ══════`);
  console.log(`ลำดับตัดสินเสมอ: ${tieOrder.join(' → ')}`);
  console.log(`แผงตลาด: ${list(market)}`);
  console.log(
    `ราคา: ${Object.entries(state.prices)
      .map(([f, p]) => `${CARD_TH[f as CardKind]} ${p}`)
      .join(' · ')}`,
  );
}

function log(event: GameEvent) {
  switch (event.type) {
    case 'ROUND_STARTED':
      return printRoundStart(event.round, event.tieOrder, event.market);
    case 'BIDS_REVEALED':
      return console.log(
        `เปิดเสียงเหมียว! ${Object.entries(event.bids)
          .map(([id, v]) => `${id}=${v}`)
          .join('  ')}`,
      );
    case 'BID_CLASH':
      return console.log(
        `  💥 ชนกัน! เลข ${event.value}: ${event.playerIds.join(', ')} ได้เลือกทีหลัง`,
      );
    case 'CARD_PICKED':
      return console.log(`  ${event.playerId} หยิบ ${cardName(event.card)}`);
    case 'CLASH_DRAW':
      return console.log(
        event.card.kind === 'dog'
          ? `  🎁 ${event.playerId} จั่วฟรีได้หมายาม — ไม่เป็นไร หมากลับเข้าถัง`
          : `  🎁 ${event.playerId} ชนแล้วจั่วฟรีได้ ${cardName(event.card)}`,
      );
    case 'TURN_SKIPPED':
      return console.log(`  ${event.playerId} ไม่มีชุดให้กิน ข้ามตา`);
    case 'MARKET_CLEARED':
      return console.log(`  ของเหลือบนแผงไปกองทิ้ง: ${list(event.cards)}`);
    case 'PHASE_STARTED':
      if (event.phase === 'trash')
        return console.log(`\n🗑️  คุ้ยถังขยะ — ลำดับ: ${event.turnOrder.join(' → ')}`);
      if (event.phase === 'eat')
        return console.log(`\n🍽️  เวลากิน — ลำดับ: ${event.turnOrder.join(' → ')}`);
      if (event.phase === 'discard')
        return console.log(`\n✋ มือเกิน ต้องทิ้ง: ${event.turnOrder.join(', ')}`);
      return;
    case 'TRASH_RESHUFFLED':
      return console.log(`  ♻️  สับกองทิ้ง ${event.count} ใบกลับเข้าถังขยะ`);
    case 'CARD_DUG':
      if (event.to === 'hand')
        return console.log(`  ${event.playerId} คุ้ยได้ กระดูก 🦴 (เก็บเข้ามือ)`);
      if (event.to === 'bag')
        return console.log(`  ${event.playerId} คุ้ยได้ ${cardName(event.card)}`);
      return;
    case 'DOG_APPEARED':
      return console.log(
        `  🐕 โฮ่ง! หมายามโผล่มาหา ${event.playerId}${event.canThrowBone ? ' (มีกระดูก)' : ''}`,
      );
    case 'BONE_THROWN':
      return console.log(`  🦴 ${event.playerId} โยนกระดูก รอดตัว!`);
    case 'DOG_CAUGHT':
      return console.log(`  😱 ${event.playerId} โดนไล่! ทิ้งของในถุง: ${list(event.lost)}`);
    case 'BAG_KEPT':
      return console.log(
        `  ✅ ${event.playerId} พอแล้ว เก็บ ${event.cards.length} ใบ: ${list(event.cards)}`,
      );
    case 'MEAL_EATEN': {
      const { meal } = event;
      const kind = meal.big ? 'มื้อใหญ่' : 'มื้อ';
      return console.log(
        `  😋 ${event.playerId} กิน${CARD_TH[meal.food]}${kind} (${list(meal.cards)}) +${meal.points}  ราคา ${meal.price}→${event.newPrice}`,
      );
    }
    case 'CARDS_DISCARDED':
      return console.log(`  ${event.playerId} ทิ้ง: ${list(event.cards)}`);
    case 'GAME_OVER': {
      console.log('\n🏁 ตลาดวาย! สรุปแต้ม');
      for (const s of [...event.result.scores].sort((a, b) => b.total - a.total)) {
        const bonus = s.varietyBonus ? ` + แมวกินเก่ง ${s.varietyBonus}` : '';
        const crown = event.result.winners.includes(s.playerId) ? ' 👑' : '';
        console.log(
          `  ${s.playerId.padEnd(8)} ${String(s.total).padStart(3)} แต้ม  (มื้อ ${s.mealPoints}${bonus}, กิน ${s.foodTypes} ชนิด, เหลือในมือ ${s.handCount})${crown}`,
        );
      }
      return;
    }
    default:
      return;
  }
}

let actions = 0;
while (state.phase !== 'gameOver') {
  const actors = pendingActors(state);
  const actor = actors[botRng.int(actors.length)]!;
  const action = chooseRandomAction(getPlayerView(state, actor), botRng);
  if (!action) throw new Error(`no action for ${actor}`);
  const result = applyAction(state, action);
  if (!result.ok) throw new Error(`${action.type} by ${actor}: ${result.error}`);
  state = result.state;
  actions++;
  result.events.forEach(log);
}
console.log(`\n(${actions} แอคชัน)`);
