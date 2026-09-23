# Decisions Log

## 001 — Server-authoritative multiplayer on Cloudflare Durable Objects
เหตุผล: เกมมีข้อมูลลับ (การ์ดในมือ, การประมูลพร้อมกัน) จึงต้องให้ server ถือ state จริงและส่ง view แยกรายคน
Durable Object เหมาะกับ "1 ห้อง = 1 instance" และมี free tier

## 002 — Engine แยกเป็น package บริสุทธิ์ ใช้ร่วม client/server
เหตุผล: ทดสอบง่าย, deterministic, บอทใช้ได้ทั้งสองฝั่ง, โหมดเดี่ยวเล่นออฟไลน์ได้

## 003 — การ์ดวาดเป็น SVG component ทั้งหมด
เหตุผล: คมทุกขนาดจอ, ไฟล์เล็ก, เปลี่ยนสีตามธีมได้, ไม่มีปัญหาลิขสิทธิ์

## 004 — เวอร์ชันเครื่องมือ: TypeScript 6.0 และ Vitest 4.1 (ยังไม่ใช้ TS 7 / Vitest 5)
วันที่: 2026-09-24 (เฟส 0)
เหตุผล: `typescript-eslint` 8.70 รองรับ TypeScript `<6.1` เท่านั้น (TS 7 ตัวใหม่ที่เขียนด้วย Go ยังไม่มี API ให้ ESLint ใช้)
และ Vitest 5 ระบุรองรับ Node 22/24/26 แต่ไม่รวม Node 25 ที่เครื่องนี้ใช้ จึงเลือก Vitest 4.1 ที่รองรับ Node ≥ 24
ส่วนอื่นใช้ล่าสุด: Vite 8, React 19, Tailwind 4, ESLint 10 (flat config), i18next 26
เมื่อ typescript-eslint รองรับ TS 7 แล้วค่อยอัปเกรด

## 005 — แพ็กเกจภายในใช้เป็นซอร์ส TypeScript ไม่ต้อง build
เหตุผล: Vite (client) และ Wrangler/esbuild (server) คอมไพล์ TS ได้เอง จึงให้ `@meow/engine` ชี้ `exports` ไปที่ `src/index.ts`
ลดขั้นตอน build/watch และไม่มีปัญหา dist เก่าค้าง

## 006 — บังคับกฎ "engine บริสุทธิ์" ด้วยเครื่องมือ ไม่ใช่แค่ข้อตกลง
เหตุผล: กฎข้อ 1 ใน CLAUDE.md สำคัญต่อ determinism และการใช้ร่วม client/server
- `tsconfig.src.json` ของ engine ไม่มี lib DOM และไม่มี Node types → ใช้ `document`/`process` แล้ว typecheck ไม่ผ่าน
- ESLint ใน `packages/engine/src` ห้าม `Math.random`, `Date`, `window`/`document`/`fetch`/timers ฯลฯ และห้าม import `react`, `node:*`

## 007 — ห้ามข้อความตรงๆ ใน JSX ด้วยกฎ ESLint
เหตุผล: กฎข้อ 4 ใน CLAUDE.md — ใช้ `no-restricted-syntax` จับ JSXText ที่มีตัวอักษรไทย/อังกฤษ (ไม่ต้องเพิ่มปลั๊กอิน)
ข้อจำกัด: ไม่ครอบคลุมข้อความใน attribute เช่น `aria-label` ต้องตรวจตอนรีวิว

## 008 — ฟอนต์โฮสต์เองผ่าน @fontsource แทนการลิงก์ Google Fonts
เหตุผล: เป็นไฟล์ฟอนต์ชุดเดียวกับ Google Fonts แต่ bundle มากับเว็บ → เล่นออฟไลน์ได้เมื่อเป็น PWA,
ไม่ส่งคำขอไปบุคคลที่สาม, ไม่มีช่วงฟอนต์กระพริบจาก CDN ช้า — ใช้ Mitr 400/500/600 และ Noto Sans Thai (variable)
เบราว์เซอร์โหลดเฉพาะ subset ที่ใช้ (thai/latin) ตาม `unicode-range`

## 009 — i18n ใช้ i18next + react-i18next
เหตุผล: รองรับ `{{ตัวแปร}}` ตรงตามรูปแบบใน I18N.md และ plural ของอังกฤษผ่าน `Intl.PluralRules` ในตัว
ภาษาเริ่มต้น: ค่าใน localStorage (`mnm.lang`) → ถ้าไม่มี ใช้ไทย เว้นแต่เบราว์เซอร์ตั้งอังกฤษมาก่อนไทย
มี test ตรวจว่า th/en มีคีย์ตรงกัน ไม่มีค่าว่าง ตัวแปร `{{}}` ตรงกัน และคำในอภิธานศัพท์ตรงกับ I18N.md

## 010 — Design tokens เป็น CSS variables แล้ว map เข้า Tailwind ด้วย `@theme inline`
เหตุผล: SVG art อ้าง `var(--fish)` ได้ตรงๆ (เปลี่ยนธีมได้ภายหลัง เช่น high-contrast) และ component ใช้ utility `bg-fish` ได้
โดยค่ามีที่เดียวใน `apps/web/src/styles/index.css`

## 011 — `npm run lint` = ESLint + Prettier check
เหตุผล: ให้ "lint ผ่าน" ครอบคลุมรูปแบบโค้ดด้วย ใช้ `npm run format` แก้อัตโนมัติ ไม่จัดรูปแบบไฟล์ `.md` (เอกสารเขียนมือ มีตารางภาษาไทย)
