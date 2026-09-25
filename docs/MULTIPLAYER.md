# Multiplayer — เล่นกับเพื่อน

## ประสบการณ์ผู้ใช้
1. กด "เล่นกับเพื่อน" → "สร้างห้อง" → ได้รหัสห้อง 4 ตัวอักษร (ไม่ใช้ตัวที่สับสน เช่น O/0, I/1) + ลิงก์ `/room/ABCD`
2. ปุ่ม "คัดลอกลิงก์" และปุ่มแชร์ของระบบ (Web Share API) — แชร์ทาง LINE ได้สะดวก
3. เพื่อนเปิดลิงก์ → ตั้งชื่อ + เลือกแมว → เข้าห้อง (ไม่ต้องสมัครสมาชิก)
4. เจ้าของห้องเห็นรายชื่อ เติมบอทในที่นั่งว่าง แล้วกด "เริ่มเกม" (ต้องมีอย่างน้อย 2 ที่นั่ง)
5. ระหว่างเกมมีอีโมจิ/สติกเกอร์แมวส่งหากันได้ (ชุดสำเร็จรูป ไม่มีแชทพิมพ์อิสระ — ปลอดภัยและไม่ต้องกรองคำ)

## สถาปัตยกรรม
- **Server-authoritative:** state จริงอยู่ใน Durable Object ของห้องเท่านั้น
- Client ส่ง `{ type: "action", action }` → server เรียก `applyAction` → ส่ง `getPlayerView` ให้ผู้เล่นแต่ละคนแยกกัน
- ช่วงประมูลพร้อมกัน: server เก็บเลขที่เลือกไว้ลับ แจ้งแค่ว่า "ใครเลือกแล้ว" จนกว่าจะครบทุกคนจึงเปิด
- บอทในห้องออนไลน์รันบน server
- ข้อความทุกประเภทมี schema ตรวจด้วย zod ทั้งสองฝั่ง

## ข้อความ (protocol — ของจริงอยู่ที่ `packages/protocol/src/schemas.ts`)
ทุกข้อความเป็น JSON และตรวจด้วย zod ทั้งสองฝั่ง (ข้อความผิดรูป/ใหญ่เกิน 4 KB ถูกทิ้ง) ·
schema ของเกมเทียบกับ type ของ engine ตอน compile — ถ้า engine เปลี่ยนแล้ว schema ไม่ตาม typecheck จะพัง

Client → Server
- `hello {name, cat, token?}` นั่งที่ว่าง / กลับที่นั่งเดิมด้วย token / ถ้าเต็มหรือเริ่มเกมแล้ว = ผู้ชม
- `action {action}` · `emote {id}` · `ping` · `updateMe {name, cat}` (ในห้องรอ) · `leave`
- หลังจบเกม: `ready {ready}` = อยากเล่นอีกรอบ (GAME_RULES §13) · `updateMe` ใช้ได้ทั้งห้องรอและหลังจบเกม
- เฉพาะเจ้าของห้อง (ห้องรอ หรือหลังจบเกม): `addBot {bot}` · `removeSeat {seatId}` (บอท หรือคนที่หลุดไปแล้ว) ·
  `setTurnSeconds {seconds}` · `start` (เกมแรก: ทุกคนที่อยู่ · เกมถัดไป: ต้องพร้อม ≥ 2 ที่นั่ง)

Server → Client
- `welcome {token, seatId}` (seatId null = ผู้ชม) · `room {room}` (ที่นั่ง สถานะ เจ้าของห้อง ตัวจับเวลา
  `gameNo` · ต่อที่นั่ง: `ready` `wins` (สกอร์ประจำห้อง) `sittingOut` = `watching` / `waiting` / null)
- `view {view, events, clocks}` = `getPlayerView` ของคนนั้น + เหตุการณ์ใหม่ + ใครกำลังถูกจับเวลาเหลือกี่ ms
- `emote {from, id}` · `error {key}` (i18n key ของ engine หรือ `room.error.*`) · `pong`

## ความทนทาน (ค่าทั้งหมดอยู่ที่ `packages/protocol/src/room.ts`)
- **รหัสห้อง:** 4 ตัวอักษรจาก `ABCDEFGHJKMNPQRSTUVWXYZ` (ไม่มี I L O และไม่มีตัวเลข) · ลิงก์ `/room/ABCD`
- **เชื่อมต่อใหม่:** token เก็บใน sessionStorage (`mnm.room.ABCD`) · รีเฟรชแท็บแล้วกลับเข้าที่นั่งเดิมเอง ·
  เน็ตหลุด client ต่อใหม่เอง (0.5 → 1 → 2 → 4 → 8 วิ) · ping ทุก 30 วิ ตอบโดยไม่ปลุกห้อง
- **ผู้เล่นหลุด:** รอ 60 วินาที แล้วบอท `careful` (ปกติ) เล่นแทนจนกว่าจะกลับมา · ในห้องรอ ที่นั่งของคนหลุดถูกคืนหลัง 60 วิ
- **ตัวจับเวลาต่อตา:** ค่าเริ่มต้น 45 วิ (เลือก ปิด/30/45/60/90 ในห้องรอ) · นับจากตอนที่จอแสดงเหตุการณ์ก่อนหน้าจบ ·
  ช่วงลงเลข/ทิ้งการ์ดจับเวลาทุกคนที่ยังไม่เลือก · หมดเวลา = บอท careful ตัดสินใจแทน**จนจบตานั้น**
  (คุ้ยถังทั้งตา) แล้วคืนให้คนเล่นตาถัดไป
- **จังหวะเกม:** server ไม่ต้องรอ client — มันคำนวณเวลาที่จอใช้แสดงเหตุการณ์ (`showTimeMs` ใช้ตาราง beat เดียวกับหน้าจอ)
  แล้วให้บอท/การลงใบเหมียวใบสุดท้ายอัตโนมัติรอจนเลยเวลานั้นก่อน + เวลาคิด 0.6–1.2 วิ
- เจ้าของห้องหลุด/ออก → โอนสิทธิ์ให้คนถัดไปที่ยังต่ออยู่ (ตามลำดับที่นั่ง)
- ห้องที่ไม่มีใครต่ออยู่ 30 นาที ลบทิ้ง (storage ถูกล้าง รหัสว่างใช้ใหม่ได้)
- **เล่นอีกรอบ** (GAME_RULES §13): หลังจบเกม status = `ended` ทำหน้าที่เป็นห้องรอ (เปลี่ยนแมว/บอท/ตัวจับเวลาได้)
  · เจ้าของห้องเริ่มได้เมื่อพร้อม ≥ 2 ที่นั่ง · คนที่ต่ออยู่แต่ไม่พร้อม = `sittingOut: watching` (ใช้โควตาผู้ชม)
  หรือ `waiting` ถ้าเต็ม (ไม่ได้รับ view) · seed ใหม่ทุกเกม · `wins` ติดกับที่นั่งของคนนั้น (= ตัวคน ผ่าน token)
- หน้าผลลัพธ์ค้าง 10 นาที (`RESULT_IDLE_MS`) โดยไม่มีใครทำอะไร = นับเป็นห้องว่าง (เริ่มนับ 30 นาที) ·
  ตอนลบห้อง คนที่ยังต่ออยู่ได้ `room.error.notFound` แล้วถูกปิดการเชื่อมต่อ
- จำกัด 30 ข้อความ / 10 วิ ต่อ connection · สติกเกอร์ 1 อัน / 1.5 วิ ต่อคน · ห้องละ 4 ที่นั่ง + ผู้ชมไม่เกิน 4
- ผู้ชมเห็น `getPlayerView(state, null)` (ไม่เห็นเลขที่ยังไม่เปิดของใคร) ส่งสติกเกอร์ไม่ได้

## Cloudflare ที่ใช้ (เช็กเอกสารล่าสุดเมื่อ 25 ก.ย. 2026)
- Durable Object ประกาศแบบใหม่ด้วย `exports: { GameRoom: { type: "durable-object", storage: "sqlite" } }`
  ใน `wrangler.jsonc` (แทน `migrations` แบบเก่า — ใช้ได้แบบใดแบบหนึ่ง และเปลี่ยนกลับไม่ได้หลัง deploy)
  · แพ็กเกจฟรีใช้ได้เฉพาะ Durable Object แบบ SQLite (ยืนยันจากหน้า pricing แล้ว)
- หน้าเว็บเป็น Static Assets ของ Worker ตัวเดียวกัน: `not_found_handling: "single-page-application"` +
  `run_worker_first: ["/api/*"]` → มีแค่ `/api/*` ที่รันโค้ด Worker
- WebSocket Hibernation API (`ctx.acceptWebSocket`, `webSocketMessage/Close`, `serializeAttachment` ≤ 16 KB,
  `setWebSocketAutoResponse` สำหรับ ping) — ห้องหลับได้ระหว่างรอ จึงแทบไม่เสียค่าใช้จ่าย
- Alarm ตัวเดียวต่อห้อง: เวลาที่เร็วที่สุดของ บอทถึงตา / หมดเวลา / หลุดครบ 60 วิ / ห้องว่างครบ 30 นาที ·
  เลื่อนได้แค่เร็วขึ้นและไม่ลบ (ทุก setAlarm/deleteAlarm = 1 แถวที่เขียน ซึ่งเป็นโควตาที่ตึงที่สุด — DEPLOY.md)
- state ทั้งห้องเก็บเป็นค่าเดียวใน `ctx.storage` (โหลดใหม่ใน constructor ทุกครั้งที่ห้องตื่น) · test ด้วย
  `@cloudflare/vitest-plugin` (รันใน workerd จริง รวมการ evict ห้องแล้วเล่นต่อ)
- type ของ Worker สร้างด้วย `wrangler types` (Cloudflare แนะนำแทน `@cloudflare/workers-types`)

## การพัฒนาในเครื่อง
client เรียก server ที่ origin เดียวกับหน้าเว็บเสมอ (`/api/...`) — ไม่มีการตั้ง URL ของ server
- **dev:** `npm run dev:server` (wrangler dev พอร์ต 8787) + `npm run dev` (Vite 5173 ส่งต่อ `/api` และ WebSocket
  ไปที่ 8787 ผ่าน proxy ใน `vite.config.ts`) แล้วเปิด http://localhost:5173 สองแท็บ (หรือหน้าต่างไม่ระบุตัวตน)
- **preview (เหมือนของจริง):** `npm run preview` = build หน้าเว็บ แล้วรัน Worker ตัวเดียวที่ http://localhost:8787
- `npm run test:e2e` = Playwright บน `npm run preview`: เปิด 2 browser context สร้างห้อง เข้าด้วยลิงก์ `/room/XXXX`
  เล่นจนจบเกม แล้วกลับห้องรอ

## Deploy
ขั้นตอนทั้งหมด (ภาษาไทย) + โควตาแพ็กเกจฟรี อยู่ที่ **`docs/DEPLOY.md`**
สรุป: Worker ตัวเดียว `meow-night-market` เสิร์ฟทั้งหน้าเว็บ (static assets, โหมด SPA) และ `/api/*` ·
deploy อัตโนมัติด้วย Workers Builds เมื่อ push ขึ้น `main` (ต้องผ่าน `npm run check` ก่อน)
