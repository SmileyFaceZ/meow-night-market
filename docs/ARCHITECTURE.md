# Architecture

## Stack
- **Monorepo** npm workspaces
- **Client:** Vite + React + TypeScript, Tailwind CSS, Framer Motion, Zustand (UI state เท่านั้น)
- **Engine:** TypeScript ล้วน ใช้ร่วมกันระหว่าง client และ server
- **Server:** Cloudflare Workers + Durable Objects (1 ห้อง = 1 Durable Object) ผ่าน WebSocket
- **Test:** Vitest (engine, bots), Playwright (smoke test ฝั่งเว็บ)
- **Hosting:** Cloudflare Pages (client) + Workers (server) — มี free tier

## โครงสร้างโฟลเดอร์
```
/
├─ CLAUDE.md
├─ docs/
├─ packages/
│  └─ engine/
│     ├─ src/
│     │  ├─ config.ts        # ค่าสมดุลทั้งหมด: กติกา (DEFAULT_CONFIG) + บอท (BOT_TUNING) — ไฟล์เดียว
│     │  ├─ types.ts         # GameState, Action, GameEvent, Card, ERROR_KEYS
│     │  ├─ rng.ts           # seeded RNG (mulberry32) — ห้ามใช้ Math.random
│     │  ├─ setup.ts         # createGame({ playerIds, seed, config? })
│     │  ├─ actions.ts       # applyAction(state, action) → { ok, state, events } | { ok: false, error }
│     │  ├─ flow.ts          # การเปลี่ยนช่วง/รอบ (ภายใน)
│     │  ├─ rules.ts         # ลำดับตา (ตามเลข + ลำดับตัดสินเสมอ) ใครต้องเล่นตอนนี้ (pendingActors)
│     │  ├─ cards.ts         # สร้างสำรับ ตรวจมื้อ (checkMeal) หามื้อที่กินได้ (findMealOptions)
│     │  ├─ view.ts          # getPlayerView(state, playerId | null)  (null = ผู้ชม)
│     │  ├─ scoring.ts
│     │  └─ bots/            # index.ts (chooseBotAction), common.ts, greedy/sly/careful.ts, random.ts (ใช้ทดสอบ)
│     ├─ scripts/simulate.ts # npm run simulate — log เกมภาษาไทยในเทอร์มินัล
│     ├─ scripts/balance.ts  # npm run balance — รายงานสถิติสมดุล (docs/BALANCE.md)
│     └─ test/
├─ apps/
│  ├─ web/
│  │  ├─ src/
│  │  │  ├─ art/            # SVG: CardArt (ทุกการ์ด), CatArt (4 สี × 4 อารมณ์), BackArt (หลังการ์ด, ถังขยะ), style.ts
│  │  │  ├─ components/     # cards (GameCard, MeowCard, CardBack), board (PlayerBadge, PriceTags, MarketStall,
│  │  │  │                  #   TrashArea, HandView, EventFeed), ui (Button, Modal)
│  │  │  ├─ screens/        # Home, Setup, Game, Result (Lobby, Tutorial เฟสหลัง)
│  │  │  ├─ game/           # types (GameController), LocalController, save, setup, hooks
│  │  │  ├─ i18n/           # th.json, en.json, index.ts
│  │  │  └─ styles/
│  │  └─ test/              # i18n, controller + save/resume
│  └─ server/               # Worker + Durable Object "GameRoom"
```

## Tooling
- TypeScript 6.0 (strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`) — `tsconfig.base.json` ที่ราก
- แพ็กเกจภายใน (`@meow/engine`) ใช้เป็นซอร์ส `.ts` ตรงๆ (`exports` ชี้ `src/index.ts`) ไม่มีขั้น build แยก
- ความบริสุทธิ์ของ engine ตรวจอัตโนมัติ: `packages/engine/tsconfig.src.json` (ไม่มี lib DOM/Node)
  + ESLint ห้าม `Math.random`, `Date`, DOM globals, timers และ import `react`/`node:*`
- Vitest รันทุก workspace จากรากด้วย `test.projects` (`vitest.config.ts`) แต่ละ workspace มี `vitest.config.ts` ของตัวเอง

## หลักการสำคัญ
- **GameController interface** เดียวกันสำหรับทุกโหมด: `getView()`, `dispatch(action)`, `subscribe(cb)`
  - `LocalController` รัน engine ในเบราว์เซอร์ (โหมดเดี่ยว / เครื่องเดียว) และขับบอท
  - `OnlineController` ส่ง action ไป server และรับ view กลับ
  → หน้าจอเกมไม่ต้องรู้ว่าเล่นโหมดไหน
- **Action** ทุกตัวมี `type`, `playerId` — engine ตรวจสิทธิ์และความถูกต้องทุกครั้ง คืน error ที่อ่านได้ (เป็น i18n key)
- **Phase machine (engine):** `bidding → pick → trash → eat → (discard) → รอบถัดไป | gameOver`
  - `pick` = เปิดเลขแล้วทุกคนหยิบของ (คนไม่ชนก่อน แล้วคนที่ชน) · `discard` = ทิ้งการ์ดเกิน (ข้ามถ้าไม่มีใครเกิน และข้ามในรอบสุดท้าย)
  - ช่วงกิน: engine ข้ามตาคนที่ไม่มีชุดกินได้เอง (`TURN_SKIPPED`)
  - `lobby` อยู่นอก engine (server/หน้าจอ) · `pendingActors(state)` บอกว่ากำลังรอใครอยู่
- **Event log:** engine คืน events (เช่น `BID_CLASH`, `DOG_CAUGHT`, `MEAL_EATEN`) เพื่อให้ UI เล่นแอนิเมชันตามลำดับ
  - **ทุก event เป็นข้อมูลเปิด** ส่งให้ทุกคนได้ (เช่น `BID_PLACED` ไม่มีเลข, `DISCARD_CHOSEN` ไม่มีการ์ด)
- **บันทึกเกม:** โหมดเดี่ยวบันทึก state ลง localStorage (try/catch) เล่นต่อได้หลังปิดเว็บ
- **PWA:** เพิ่ม manifest + service worker ในเฟสหลัง ให้ติดตั้งบนมือถือและเล่นโหมดเดี่ยวแบบออฟไลน์ได้

## Testing ที่ต้องมี
- ทุกข้อใน GAME_RULES.md มี unit test
- Property test: เล่นเกมสุ่มด้วยบอท 1,000 เกม ต้องไม่มี error, จำนวนการ์ดรวมคงที่, จบเกมเสมอ
- Determinism test: seed เดิม + action เดิม = state เดิม
- สถิติสมดุล (`npm run balance`): อัตราชนะของบอทแต่ละนิสัย, แต้มเฉลี่ย, มื้อ, การชน, ความเสี่ยงคุ้ย ฯลฯ — ใช้ปรับค่าใน `config.ts`
  เพิ่มตัวเลือกทดลองได้ที่ `VARIANTS` ใน `scripts/balance.ts` (แค่ใส่ config คนละชุด)
