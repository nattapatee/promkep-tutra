# PromKep-Tutra (พร้อมเก็บ-ตุ๊ต๊ะ)

<p align="center">
  <img src="./images/banner.png" alt="พร้อมเก็บ-ตุ๊ต๊ะ — น่ารักตอนช่วย แต่โหดตอนทวง" width="640" />
</p>

> **บันทึกรายรับ-รายจ่าย · ทวงหนี้ได้ · จัดการการเงินในแชตเดียว**

Personal finance LINE bot with PromptPay QR + debt-tracking. Each LINE user keeps a private ledger; debts are inter-user IOUs with a 3-button accept/reject/later flow.

Sibling-stack of [pwt-tx](https://github.com/nattapatee/pwt-manage-transection-bot) — same architecture (Fastify + Prisma + Next.js + LIFF), different scope:

- **Private-per-user ledger.** Every transaction is owned by exactly one LINE user; nobody else sees it.
- **PromptPay QR generation.** Bind one PromptPay ID (phone or national ID) per user, then ask for money via `ขอเงิน <amount>`.
- **Debt requests.** `หนี้ <amount>` opens a member picker; debtor sees Flex with **ชำระแล้ว / ปฏิเสธ / ยังไม่ใช่ตอนนี้** quick-reply buttons.
- **AI secretary "ตุ๊ต๊ะ"** — Gemini function-calling scoped to the caller's own data. **น่ารักตอนช่วย แต่โหดตอนทวง** — 5-mode escalation (cute → pro → warning → debt-collector → savage) auto-selected from the user's debt context.

## Layout

```
api/      Fastify API + Prisma + LINE webhook + AI secretary (port 3002 dev)
web/      Next.js 16 LIFF app — dashboard, transactions, debts, settings (port 3010 dev)
deploy/   docker-compose, Caddy reverse-proxy notes (joins shared pwt-tx_app network)
```

## Local dev

```bash
# api
cd api
cp .env.example .env   # fill LINE_CHANNEL_ACCESS_TOKEN / GEMINI_API_KEY when ready
npm install
npx prisma generate
npx prisma migrate dev --name init --skip-seed
npm run prisma:seed
PORT=3002 npm run dev

# web
cd web
npm install
PORT=3010 npm run dev   # NEXT_PUBLIC_API_URL=http://localhost:3002 in .env.local
```

Health checks: `curl http://localhost:3002/health` and `curl http://localhost:3010/`.

## Deploy

See `deploy/README.md`. Joins the existing `pwt-tx_app` Docker network so the same Caddy instance reverse-proxies `promkep-api.alizoft.site` and `promkep-web.alizoft.site` alongside pwt-tx.
