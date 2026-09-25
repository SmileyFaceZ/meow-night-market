# DEPLOY.md — ปล่อยเกมขึ้น Cloudflare

> เช็กกับเอกสาร Cloudflare ล่าสุดเมื่อ 25 ก.ย. 2026 (ตัวเลขโควตาอาจเปลี่ยน — ดูลิงก์ท้ายไฟล์)

## ภาพรวม
เกมทั้งเกมเป็น **Cloudflare Worker ตัวเดียว** ชื่อ `meow-night-market` (`apps/server/wrangler.jsonc`)
- **หน้าเว็บ** = ไฟล์ static จาก `apps/web/dist` (Workers Static Assets) — โหลดฟรีไม่จำกัด ไม่นับโควตา
- **ห้องออนไลน์** = `/api/*` เท่านั้นที่ปลุก Worker → Durable Object `GameRoom` (ห้องละ 1 ตัว, SQLite)
- ลิงก์ห้อง `/room/ABCD` ไม่ตรงกับไฟล์ไหน → ได้ `index.html` (โหมด single-page-application) แล้วหน้าเว็บจัดการต่อ
- โดเมนเดียวกันทั้งหมด → ไม่มี CORS ไม่ต้องตั้ง URL ของ server
- **Deploy อัตโนมัติ:** push ขึ้น `main` บน GitHub → Workers Builds รัน lint + typecheck + test →
  ถ้าผ่านทั้งหมดค่อย build และ deploy (ถ้า test ไม่ผ่าน ของเดิมบนเว็บยังอยู่)

## สิ่งที่คุณต้องทำเอง (ครั้งเดียว)

### 1. สมัคร Cloudflare
1. ไปที่ https://dash.cloudflare.com/sign-up สมัครด้วยอีเมล (แพ็กเกจฟรี ไม่ต้องใส่บัตร) แล้วยืนยันอีเมล
2. ถ้าเป็นบัญชีใหม่ ครั้งแรกที่เข้า **Workers & Pages** ระบบจะให้ตั้งชื่อ subdomain ของ `workers.dev`
   (เช่น `smiley`) → เว็บจะอยู่ที่ `https://meow-night-market.<subdomain>.workers.dev`

### 2. ให้แน่ใจว่าโค้ดล่าสุดอยู่บน GitHub
repo: `https://github.com/SmileyFaceZ/meow-night-market` (branch `main`)
```bash
git push origin main
```

### 3. สร้าง Worker จาก repo (Workers Builds)
1. Cloudflare dashboard → **Workers & Pages** → **Create application**
2. ข้าง **Import a repository** กด **Get started**
3. เชื่อม GitHub: กด **Connect GitHub** → ติดตั้งแอป Cloudflare บน GitHub
   → เลือก **Only select repositories** → เลือก `meow-night-market` (ให้สิทธิ์เฉพาะ repo นี้พอ)
4. เลือก repo `meow-night-market` แล้วตั้งค่าตามนี้ **ทุกช่อง**:

   | ช่อง | ใส่ |
   | --- | --- |
   | Project name / Worker name | `meow-night-market` ← **ต้องตรงกับ `name` ใน wrangler.jsonc** ไม่งั้น build ล้ม |
   | Production branch | `main` |
   | Build command | `npm run check` (lint + typecheck + test ทั้งหมด) |
   | Deploy command | `npm run deploy` (build หน้าเว็บ + `wrangler deploy`) |
   | Root directory | เว้นว่าง / `/` (ต้องเป็นรากของ repo เพราะเป็น npm workspaces) |
   | API token | ปล่อยให้ Cloudflare สร้างให้ (Create new token) |
   | Build variables | ไม่ต้องใส่ (Node 24 อ่านจาก `.nvmrc` เอง) |

5. กด **Save and Deploy** → รอ build ครั้งแรก (ติดตั้ง + test + deploy — คาดว่าไม่กี่นาที)
   ดู log ได้ที่ Worker → **Deployments** → **View build history**
6. **ปิด preview build** (branch อื่นที่ไม่ใช่ main): Worker → **Settings** → **Build** → **Branch control**
   → เอาเครื่องหมายออกจาก **Enable Preview Builds**
   (เหตุผล: คำสั่ง preview ตั้งต้นรันที่รากของ repo ซึ่งไม่มี wrangler config — ถ้าอยากได้ในอนาคต
   ตั้ง Preview command เป็น `npm run build && npx wrangler preview --config apps/server/wrangler.jsonc`)

### 4. ตรวจว่าใช้ได้
1. เปิด `https://meow-night-market.<subdomain>.workers.dev` → หน้าแรกขึ้น
2. `…/api/health` ต้องได้ `ok`
3. มือถือ 1 เครื่อง + คอม 1 เครื่อง: สร้างห้อง → ส่งลิงก์ `/room/XXXX` ให้อีกเครื่อง → เล่นจนจบ
4. ลองรีเฟรชกลางเกม → ต้องกลับที่นั่งเดิม

หลังจากนี้ **ทุกครั้งที่ push ขึ้น `main` จะ deploy เอง** — ใน GitHub จะเห็นเครื่องหมาย ✓/✗ ของ build ที่ commit

### (ทางเลือก) deploy เองจากเครื่อง
```bash
npx wrangler login
```
```bash
npm run deploy
```
(ล็อกอินต้องทำเองในเบราว์เซอร์ — Claude ไม่ทำขั้นตอนนี้)

### (ทางเลือก) โดเมนของตัวเอง
ต้องมีโดเมนที่ใช้ DNS ของ Cloudflare ก่อน → Worker → **Settings** → **Domains & Routes** → **Add** → **Custom domain**

## โควตาแพ็กเกจฟรี (Workers Free) และเล่นได้กี่เกมต่อวัน

### ตัวเลขจาก Cloudflare (ต่อวัน, รีเซ็ต 00:00 UTC = **07:00 เวลาไทย**)
| อย่าง | โควตาฟรี | เกมเราใช้ตรงไหน |
| --- | --- | --- |
| Worker requests | 100,000 / วัน | สร้างห้อง + เปิด WebSocket (ไฟล์หน้าเว็บ **ไม่นับ**) |
| Durable Object requests | 100,000 / วัน | ต่อ WebSocket, alarm แต่ละครั้ง, ข้อความขาเข้า (**20 ข้อความ = 1 request**) |
| Durable Object duration | 13,000 GB-s / วัน | เวลาที่ห้องตื่นอยู่ (128 MB × วินาที) — ห้องที่หลับ (Hibernation) ไม่นับ |
| SQLite rows written | 100,000 / วัน | บันทึกห้องทุกครั้งที่ state เปลี่ยน + ตั้ง alarm (1 แถว/ครั้ง) |
| SQLite rows read | 5,000,000 / วัน | โหลดห้องตอนตื่น — เหลือเฟือ |
| พื้นที่เก็บ | 5 GB (รวม) | ห้องละไม่กี่สิบ KB และลบทิ้งหลังว่าง 30 นาที |
| CPU ต่อ request | 10 ms | การจัดการข้อความหนึ่งครั้งใช้น้อยกว่านี้มาก |

- Durable Object บนแพ็กเกจฟรีต้องเป็นแบบ **SQLite** เท่านั้น (เราใช้แบบนี้อยู่แล้ว)
- ใช้เกินโควตา = คำขอประเภทนั้นล้มจนถึง 07:00 — **หน้าเว็บ + เล่นคนเดียว + ส่งเครื่องยังเล่นได้ปกติ**
  (ทำงานในเบราว์เซอร์ล้วน) มีแค่ **ห้องออนไลน์** ที่ใช้ไม่ได้ชั่วคราว

### ประเมินต่อเกม (`npm run usage`)
สคริปต์ `apps/server/scripts/estimate-usage.ts` เล่นเกมจริงผ่านตรรกะห้อง (คนตัดสินใจแบบบอท careful,
คิด 2–6 วิต่อตา, ping ทุก 30 วิ) 20 เกมต่อแบบโต๊ะ แล้วนับตามกติกาคิดเงินของ Cloudflare:

| โต๊ะ | DO requests | rows written | เกม/วัน ก่อนโควตาแรกหมด |
| --- | --- | --- | --- |
| คน 2 | ~16 | ~86 | **~1,150** |
| คน 4 | ~23 | ~123 | **~810** |
| คน 2 + บอท 1 | ~40 | ~143 | **~700** |
| คน 3 + บอท 1 | ~43 | ~164 | **~600** |
| คน 1 + บอท 3 | ~85 | ~210 | **~480** |

- **โควตาที่หมดก่อนเสมอ = rows written** (บันทึกห้อง + ตั้ง alarm) ตัวอื่นเหลืออีกหลายเท่า:
  DO requests พอ ~1,200–6,400 เกม, Worker requests ~20,000+ เกม,
  duration ~35,000+ เกม (สมมติห้องตื่น 25 ms ต่อเหตุการณ์ — ถ้าจริงช้ากว่านี้ 10 เท่าก็ยังไม่ใช่ตัวจำกัด)
- **สรุป: ประมาณ 500–1,000 เกมออนไลน์ต่อวัน** (ยิ่งมีบอทมาก ยิ่งกินโควตา เพราะบอทแต่ละตาต้องใช้ alarm + บันทึก 1 ครั้ง)
  — เหลือเฟือสำหรับเล่นกับเพื่อน
- ตัวเลขเป็นค่าประมาณ ดูของจริงได้ที่ Worker → **Metrics** และ Durable Objects → **Metrics**

### สิ่งที่ทำไว้เพื่อประหยัดโควตา
- **WebSocket Hibernation API** (`ctx.acceptWebSocket`): ห้องที่รอคนคิด/รอเพื่อนหลับได้หลังว่าง 10 วิ
  โดยที่ WebSocket ยังต่ออยู่ — ไม่เสีย duration ระหว่างรอ
  เงื่อนไขที่ Cloudflare กำหนดให้หลับได้ (ไม่มี `setTimeout`, ไม่มี fetch ค้าง, ไม่ใช้ WebSocket API แบบธรรมดา) ผ่านครบ
- **ping ตอบอัตโนมัติ** (`setWebSocketAutoResponse`): ping ทุก 30 วิของ client ไม่ปลุกห้อง
- **alarm เลื่อนได้แค่ "เร็วขึ้น"** และไม่ลบทิ้ง: ลดแถวที่เขียน 10–35% ในเกมที่มีแต่คน
  (alarm ที่ดังก่อนเวลาแค่ปลุกห้องขึ้นมาดูแล้วตั้งใหม่ — แลก DO request ซึ่งเหลือเฟือ)
- บันทึกห้องเฉพาะตอน state เปลี่ยนจริง, ลบห้องที่ว่าง 30 นาที
- ไฟล์หน้าเว็บไม่ผ่าน Worker เลย (`run_worker_first: ["/api/*"]`)

### ถ้าวันหนึ่งไม่พอ
- **Workers Paid ($5/เดือน)**: ไม่มีเพดานรายวัน — รวม 50 ล้าน rows written/เดือน (≈ 240,000+ เกม แม้โต๊ะที่มีบอทมากที่สุด)
- ความเสี่ยงที่รู้: ใครก็ยิง `POST /api/rooms` รัวๆ ได้ (ห้องละ ~2 แถว) ถ้าเจอจริงค่อยเพิ่ม rate limit
  (เช่น Rate Limiting rules เมื่อมีโดเมนของตัวเองบน Cloudflare)

## Workers Builds (build อัตโนมัติ) — โควตาฟรี
3,000 นาที build/เดือน, build พร้อมกัน 1 งาน, จำกัดเวลา 20 นาที/ครั้ง ·
เครื่อง build: Ubuntu 24.04 x86-64, Node ตาม `.nvmrc` (24) · ถ้า build หนึ่งครั้งใช้ ~4 นาที (ยังไม่ได้วัดจริง) = ~750 ครั้ง/เดือน
Playwright (`npm run test:e2e`) **ไม่ได้รัน**ใน build (ต้องใช้เบราว์เซอร์) — รันในเครื่องก่อน push เมื่อแก้ส่วนออนไลน์

## ข้อควรรู้ตอน deploy
- deploy ใหม่ = Durable Object ทุกห้องรีสตาร์ต → WebSocket หลุดชั่วครู่ แล้ว client ต่อใหม่เอง (state อยู่ใน storage)
  แต่ถ้าเปลี่ยนรูปแบบข้อมูลห้อง (`StoredRoom`) ต้องคิดเรื่องห้องเก่าที่ค้างอยู่ด้วย
- ประเภท storage ของ Durable Object (SQLite) **เปลี่ยนไม่ได้หลัง deploy ครั้งแรก**

## อ้างอิง
- Workers limits: https://developers.cloudflare.com/workers/platform/limits/
- Workers pricing: https://developers.cloudflare.com/workers/platform/pricing/
- Durable Objects pricing: https://developers.cloudflare.com/durable-objects/platform/pricing/
- Durable Object lifecycle / hibernation: https://developers.cloudflare.com/durable-objects/concepts/durable-object-lifecycle/
- Static assets (SPA): https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/
- Workers Builds: https://developers.cloudflare.com/workers/ci-cd/builds/
