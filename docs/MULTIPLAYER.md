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

## ข้อความ (protocol ร่าง)
Client → Server: `join {name, cat, token?}` · `action {action}` · `emote {id}` · `ping`
Server → Client: `welcome {playerId, token}` · `view {view, events}` · `lobby {seats}` · `error {key}` · `emote {from,id}`

## ความทนทาน
- **เชื่อมต่อใหม่:** client เก็บ `token` ไว้ใน sessionStorage รีเฟรชหรือเน็ตหลุดแล้วกลับเข้าที่นั่งเดิมได้
- **ผู้เล่นหลุด:** รอ 60 วินาที แล้วให้บอท `careful` เล่นแทนชั่วคราว จนกว่าจะกลับมา
- **ตัวจับเวลาต่อตา:** 45 วินาที (ตั้งค่าได้ในห้อง) หมดเวลาให้บอทตัดสินใจแทนตานั้น
- เจ้าของห้องหลุด → โอนสิทธิ์ให้คนถัดไป
- ห้องที่ไม่มีใครอยู่ 30 นาที ลบทิ้ง
- จำกัดอัตราข้อความต่อ connection กันสแปม, จำกัดห้องละ 4 ที่นั่ง + ผู้ชมไม่เกิน 4

## การพัฒนาในเครื่อง
`npm run dev:server` (wrangler dev) + `npm run dev` แล้วเปิดสองแท็บเพื่อทดสอบสองผู้เล่น
เขียน Playwright test ที่เปิด 2 browser context เล่นจนจบเกม

## Deploy (ให้ Claude Code เช็กเอกสาร Cloudflare ล่าสุดก่อนทำ)
1. สมัครบัญชี Cloudflare (ฟรี) และล็อกอิน `npx wrangler login` — **ผู้ใช้ต้องทำขั้นตอนล็อกอินเอง**
2. Deploy server: `wrangler deploy` ใน `apps/server`
3. Deploy client: Cloudflare Pages เชื่อมกับ GitHub repo (build: `npm run build -w apps/web`, output: `apps/web/dist`) — push แล้ว deploy อัตโนมัติ
4. ตั้ง env `VITE_SERVER_URL` ให้ client ชี้ไป Worker
5. ตั้ง SPA fallback ให้ `/room/*` เปิด index.html
6. (ทางเลือก) ผูกโดเมนของตัวเอง
7. เขียนขั้นตอนทั้งหมดเป็นภาษาไทยไว้ใน `docs/DEPLOY.md` ให้ผู้ใช้ทำตามได้เอง
