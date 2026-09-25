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
- เฉพาะเจ้าของห้อง: `addBot {bot}` · `removeSeat {seatId}` (บอท หรือคนที่หลุดไปแล้ว) · `setTurnSeconds {seconds}` ·
  `start` · `backToLobby` (หลังจบเกม = เล่นอีกรอบ)

Server → Client
- `welcome {token, seatId}` (seatId null = ผู้ชม) · `room {room}` (ที่นั่ง สถานะ เจ้าของห้อง ตัวจับเวลา)
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
- จำกัด 30 ข้อความ / 10 วิ ต่อ connection · สติกเกอร์ 1 อัน / 1.5 วิ ต่อคน · ห้องละ 4 ที่นั่ง + ผู้ชมไม่เกิน 4
- ผู้ชมเห็น `getPlayerView(state, null)` (ไม่เห็นเลขที่ยังไม่เปิดของใคร) ส่งสติกเกอร์ไม่ได้

## Cloudflare ที่ใช้ (เช็กเอกสารล่าสุดเมื่อ 25 ก.ย. 2026)
- Durable Object ประกาศแบบใหม่ด้วย `exports: { GameRoom: { type: "durable-object", storage: "sqlite" } }`
  ใน `wrangler.jsonc` (แทน `migrations` แบบเก่า — ใช้ได้แบบใดแบบหนึ่ง และเปลี่ยนกลับไม่ได้หลัง deploy)
  · เอกสารหน้านั้นไม่ได้บอกว่าแพ็กเกจฟรีต้องใช้ SQLite — เลือก SQLite ไว้ และจะเช็กอีกครั้งก่อน deploy ในเฟส 7
- WebSocket Hibernation API (`ctx.acceptWebSocket`, `webSocketMessage/Close`, `serializeAttachment` ≤ 16 KB,
  `setWebSocketAutoResponse` สำหรับ ping) — ห้องหลับได้ระหว่างรอ จึงแทบไม่เสียค่าใช้จ่าย
- Alarm ตัวเดียวต่อห้อง: ตั้งเป็นเวลาที่เร็วที่สุดของ บอทถึงตา / หมดเวลา / หลุดครบ 60 วิ / ห้องว่างครบ 30 นาที
- state ทั้งห้องเก็บเป็นค่าเดียวใน `ctx.storage` (โหลดใหม่ใน constructor ทุกครั้งที่ห้องตื่น) · test ด้วย
  `@cloudflare/vitest-plugin` (รันใน workerd จริง รวมการ evict ห้องแล้วเล่นต่อ)
- type ของ Worker สร้างด้วย `wrangler types` (Cloudflare แนะนำแทน `@cloudflare/workers-types`)

## การพัฒนาในเครื่อง
`npm run dev:server` (wrangler dev พอร์ต 8787) + `npm run dev` แล้วเปิดสองแท็บ (หรือหน้าต่างไม่ระบุตัวตน) เพื่อทดสอบสองผู้เล่น
· client หา server จาก `VITE_SERVER_URL` ถ้าไม่ตั้ง: ตอน dev ใช้ `http://<host>:8787` ตอน build ใช้ origin เดียวกับหน้าเว็บ
· `npm run test:e2e` = Playwright เปิด 2 browser context สร้างห้อง เข้าด้วยลิงก์ เล่นจนจบเกม แล้วกลับห้องรอ

## Deploy (ให้ Claude Code เช็กเอกสาร Cloudflare ล่าสุดก่อนทำ)
1. สมัครบัญชี Cloudflare (ฟรี) และล็อกอิน `npx wrangler login` — **ผู้ใช้ต้องทำขั้นตอนล็อกอินเอง**
2. Deploy server: `wrangler deploy` ใน `apps/server`
3. Deploy client: Cloudflare Pages เชื่อมกับ GitHub repo (build: `npm run build -w apps/web`, output: `apps/web/dist`) — push แล้ว deploy อัตโนมัติ
4. ตั้ง env `VITE_SERVER_URL` ให้ client ชี้ไป Worker
5. ตั้ง SPA fallback ให้ `/room/*` เปิด index.html
6. (ทางเลือก) ผูกโดเมนของตัวเอง
7. เขียนขั้นตอนทั้งหมดเป็นภาษาไทยไว้ใน `docs/DEPLOY.md` ให้ผู้ใช้ทำตามได้เอง

> **ทางเลือกที่พบตอนเช็กเอกสาร (ให้ผู้ใช้ตัดสินในเฟส 7):** Workers รองรับไฟล์เว็บในตัว (Static Assets,
> `assets.not_found_handling: "single-page-application"`) จึงรวมหน้าเว็บ + server เป็น Worker เดียวได้ —
> โดเมนเดียว ไม่ต้องตั้ง `VITE_SERVER_URL`/CORS และ `/room/*` เปิด index.html ให้เอง (client รองรับแล้ว: ไม่ตั้ง URL = origin เดียวกัน)
