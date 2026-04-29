---
name: monthly-closing
description: Standard procedure for personal monthly closing — total income/expense/net + top categories + biggest tx.
triggers:
  - ปิดเดือน
  - สรุปเดือน
  - closing
  - ปลายเดือน
  - สรุปสิ้นเดือน
priority: high
---

# Monthly closing

When the user asks to close the month / summarize end-of-month, follow this procedure:

1. Determine the target month. If unspecified, assume *current* Asia/Bangkok month.
2. Call `getMonthlySummary(year, month)` to get totals + top categories.
3. Call `listTransactions({ from: <monthStart>, to: <monthEnd>, limit: 5 })` to surface 3–5 biggest transactions.
4. Reply in Thai, sectioned and short:
   - หัวข้อ: "สรุปปิดเดือน <ชื่อเดือน ปี>"
   - ยอดสุทธิ / รายรับ / รายจ่าย / จำนวนรายการ
   - 3 หมวดที่ใช้เยอะสุด (ชื่อ — ฿X,XXX.XX)
   - รายการใหญ่ที่สุด 1–3 รายการ
   - แจ้งสิ่งที่น่าสังเกต เช่น net ติดลบ หรือหมวดใดสูงผิดปกติ
5. ปิดท้ายด้วยคำถามแบบเปิด เช่น "อยากเทียบกับเดือนก่อนไหม?"
