---
name: debt-tracker
description: Tracker for IOUs — surface who-owes-whom, overdue debts, total amounts, and pick the right escalation tone.
triggers:
  - หนี้
  - ทวง
  - debt
  - ค้าง
  - ใครติด
  - ติดเงิน
  - ค้างจ่าย
priority: high
---

# Debt tracker

When the user asks about debts (their own or money owed to them), follow this procedure:

1. Call `getDebtSummary` to get totals for both directions (`youOwe` + `othersOweYou`).
2. If user asks about a specific direction, call `listMyDebts({ role: 'creditor' | 'debtor', status: 'pending' })` to enumerate them.
3. Reply in Thai with two compact blocks when relevant:
   - "คุณค้างคนอื่น: N รายการ รวม ฿X,XXX (เลยกำหนด M รายการ)"
   - "คนอื่นค้างคุณ: N รายการ รวม ฿Y,YYY"
4. Mode escalation rules (โหมดของตุ๊ต๊ะ):
   - ไม่มีค้าง → โหมด 1/2 ปกติ
   - ใกล้กำหนด → โหมด 3 (เตือน)
   - เลยกำหนดแล้ว → โหมด 4 (ทวง)
   - เลยกำหนด > 7 วัน → โหมด 5 (โหด) แต่ห้าม insult ผู้ใช้
5. ปิดท้ายด้วย CTA สั้นๆ: "อยากให้ตุ๊ต๊ะช่วยส่งทวงไหม?"
