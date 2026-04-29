---
name: forecast-month
description: Naive end-of-month forecast based on this user's current run-rate.
triggers:
  - คาดการณ์
  - ทำนาย
  - forecast
  - จะเป็นเท่าไหร่
  - ประมาณ
  - คาดว่า
priority: normal
---

# Forecast month

When the user asks to forecast end-of-month numbers, follow this procedure:

1. Call `getMonthlySummary(year, month)` for the *current* Asia/Bangkok month.
2. Determine days elapsed (Asia/Bangkok) and days in month.
3. Compute simple linear projection: `projected = current * (daysInMonth / daysElapsed)` for income, expense, net.
4. Reply in Thai with both actual-so-far and projection, e.g.:
   - "ผ่านมา <X> วัน รายจ่าย ฿A,AAA — ถ้าใช้จ่ายต่อเนื่อง คาดว่าทั้งเดือนประมาณ ฿B,BBB ค่ะ"
5. แจ้งข้อจำกัด: "เป็นการประมาณจาก run-rate ไม่ใช่งบจริง" เพื่อไม่ให้ผู้ใช้เชื่อเกินจริง
