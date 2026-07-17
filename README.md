# เงินทอง — ระบบจดรายรับรายจ่าย

แอปจดรายรับ-รายจ่ายส่วนตัว รองรับ:

- **รายรับ-รายจ่าย** — บันทึกธุรกรรมรายวัน แยกตามหมวดหมู่และช่องทางการชำระ
- **รายจ่ายประจำเดือน** — ตั้งค่ารายจ่ายที่ต้องจ่ายซ้ำทุกเดือน (ค่าเน็ต ค่าเช่า ฯลฯ) ระบบจะขึ้นรายการ "รอชำระ" ให้อัตโนมัติเมื่อถึงกำหนด แล้วผู้ใช้กดยืนยันจ่ายเพื่อบันทึกเป็นธุรกรรมจริง
- **บัตรเครดิต** — บันทึกบัตรเครดิตหลายใบ ผูกกับธุรกรรม/รายจ่ายประจำ ดูยอดใช้จ่ายรอบบิลปัจจุบัน
- **ยืมเงิน / ลูกหนี้** — บันทึกเงินที่ให้คนอื่นยืม รองรับคืนแบบเงินสดก้อนเดียว ผ่อนรายเดือน หรือผ่อนสินค้า พร้อมติดตามยอดคงเหลือ

## สถาปัตยกรรม

- **Backend**: FastAPI + SQLAlchemy 2.0 (async) + SQLite (ปรับเป็น PostgreSQL ได้ผ่าน `DATABASE_URL`) + JWT auth
- **Frontend**: Vanilla JS แบบ static ไม่มี build step, เสิร์ฟเป็นไฟล์ static ผ่าน FastAPI เอง (`StaticFiles`)

## รันด้วย Python (dev)

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cd ..
uvicorn backend.main:app --reload --port 8001
```

เปิด `http://localhost:8001` — บัญชีทดลอง: `demo` / `demo1234` (สร้างอัตโนมัติเมื่อฐานข้อมูลว่าง)

## รันด้วย Docker

```bash
docker compose up --build
```

เปิด `http://localhost:8001`

## โครงสร้างไฟล์

```
backend/
  main.py              # FastAPI entrypoint, mounts routers + static frontend
  config.py            # Settings (DATABASE_URL, SECRET_KEY, ...)
  database.py          # Async SQLAlchemy engine/session
  models.py             # ORM models
  schemas.py            # Pydantic schemas
  auth.py                # JWT + password hashing
  seed.py                 # Seeds a demo user on first boot
  routers/
    auth.py, transactions.py, recurring_bills.py, credit_cards.py, loans.py, dashboard.py
frontend/
  index.html, app.js, api.js, styles.css
```

## Data model

- `Transaction` — รายรับ/รายจ่ายทุกตัว ไม่ว่าจะเกิดจากการกรอกมือ, การจ่ายรายจ่ายประจำ, หรือการรับชำระหนี้ (`source` บอกที่มา)
- `RecurringBill` + `RecurringBillInstance` — นิยามรายจ่ายประจำ 1 รายการ ผูกกับ instance รายเดือน (1 instance ต่อ 1 period `YYYY-MM`) ที่มีสถานะ `pending`/`paid`/`skipped`
- `CreditCard` — ผูกกับ `Transaction.credit_card_id` เพื่อคำนวณยอดใช้จ่ายรอบบิล
- `Loan` + `LoanPayment` — เงินที่ให้คนอื่นยืม, การรับชำระแต่ละครั้งจะสร้าง `Transaction` ประเภทรายรับอัตโนมัติ
