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
│     │  ├─ config.ts        # ค่าคงที่ทั้งหมดของเกม
│     │  ├─ types.ts         # GameState, Action, PlayerView, Card
│     │  ├─ rng.ts           # seeded RNG (เช่น mulberry32) — ห้ามใช้ Math.random
│     │  ├─ setup.ts         # createGame(options, seed)
│     │  ├─ actions.ts       # applyAction(state, action) → state | error
│     │  ├─ view.ts          # getPlayerView(state, playerId)
│     │  ├─ scoring.ts
│     │  └─ bots/            # greedy.ts, sly.ts, careful.ts
│     └─ test/
├─ apps/
│  ├─ web/
│  │  └─ src/
│  │     ├─ art/            # SVG components ของการ์ด แมว หมา ฉาก
│  │     ├─ components/     # Card, Hand, MarketStall, TrashBin, PriceTags, PlayerBadge ...
│  │     ├─ screens/        # Home, Lobby, Game, Result, Tutorial, Settings
│  │     ├─ game/           # adapters: LocalController, OnlineController (interface เดียวกัน)
│  │     ├─ i18n/           # th.json, en.json
│  │     └─ styles/
│  └─ server/               # Worker + Durable Object "GameRoom"
```

## หลักการสำคัญ
- **GameController interface** เดียวกันสำหรับทุกโหมด: `getView()`, `dispatch(action)`, `subscribe(cb)`
  - `LocalController` รัน engine ในเบราว์เซอร์ (โหมดเดี่ยว / เครื่องเดียว) และขับบอท
  - `OnlineController` ส่ง action ไป server และรับ view กลับ
  → หน้าจอเกมไม่ต้องรู้ว่าเล่นโหมดไหน
- **Action** ทุกตัวมี `type`, `playerId` — engine ตรวจสิทธิ์และความถูกต้องทุกครั้ง คืน error ที่อ่านได้ (เป็น i18n key)
- **Phase machine:** `lobby → bidding → bidReveal → trash → eat → (discardExcess) → nextRound | gameOver`
- **Event log:** engine คืน events (เช่น `BID_CLASH`, `DOG_CAUGHT`, `MEAL_EATEN`) เพื่อให้ UI เล่นแอนิเมชันตามลำดับ
- **บันทึกเกม:** โหมดเดี่ยวบันทึก state ลง localStorage (try/catch) เล่นต่อได้หลังปิดเว็บ
- **PWA:** เพิ่ม manifest + service worker ในเฟสหลัง ให้ติดตั้งบนมือถือและเล่นโหมดเดี่ยวแบบออฟไลน์ได้

## Testing ที่ต้องมี
- ทุกข้อใน GAME_RULES.md มี unit test
- Property test: เล่นเกมสุ่มด้วยบอท 1,000 เกม ต้องไม่มี error, จำนวนการ์ดรวมคงที่, จบเกมเสมอ
- Determinism test: seed เดิม + action เดิม = state เดิม
- สถิติสมดุล (script แยก): อัตราชนะของบอทแต่ละนิสัย, แต้มเฉลี่ย, ความยาวเกม — ใช้ปรับค่าใน config.ts
