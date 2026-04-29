---
name: expense-anomaly
description: Spot unusual transactions or category spikes vs the prior month for this user.
triggers:
  - ผิดปกติ
  - แปลก
  - anomaly
  - แปลกๆ
  - ผิดสังเกต
  - เช็คดู
priority: normal
---

# Expense anomaly

When the user suspects something looks off, follow this procedure:

1. Call `getMonthlySummary` for the *current* Asia/Bangkok month and the *previous* month.
2. Compare per-category totals. Flag any category where current > 1.5× previous OR where current is non-zero but previous was zero.
3. Call `listTransactions({ from: <monthStart>, to: <now>, limit: 30 })` to scan for outliers — any single tx whose amount is more than 2× the median for its category.
4. Reply in Thai with up to 3 flagged items, each formatted as:
   - "<หมวด>: เดือนนี้ ฿X,XXX (เดือนก่อน ฿Y,YYY) — เพิ่มขึ้น Z%"
   - หรือ "<วันที่> ฿X,XXX <หมวด> ดูเด่นกว่ารายการอื่น"
5. ถ้าไม่พบความผิดปกติ ให้บอกตรงๆ ว่า "เดือนนี้ดูปกติดีค่ะ ✨"
