# Decisions Log

## 001 — Server-authoritative multiplayer on Cloudflare Durable Objects
เหตุผล: เกมมีข้อมูลลับ (การ์ดในมือ, การประมูลพร้อมกัน) จึงต้องให้ server ถือ state จริงและส่ง view แยกรายคน
Durable Object เหมาะกับ "1 ห้อง = 1 instance" และมี free tier

## 002 — Engine แยกเป็น package บริสุทธิ์ ใช้ร่วม client/server
เหตุผล: ทดสอบง่าย, deterministic, บอทใช้ได้ทั้งสองฝั่ง, โหมดเดี่ยวเล่นออฟไลน์ได้

## 003 — การ์ดวาดเป็น SVG component ทั้งหมด
เหตุผล: คมทุกขนาดจอ, ไฟล์เล็ก, เปลี่ยนสีตามธีมได้, ไม่มีปัญหาลิขสิทธิ์
