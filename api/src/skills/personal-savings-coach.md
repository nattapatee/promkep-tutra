---
name: personal-savings-coach
description: Personal savings coaching — suggest concrete cuts based on this user's category usage.
triggers:
  - ประหยัด
  - เก็บเงิน
  - savings
  - อยากเก็บ
  - ตัดงบ
  - ลดค่าใช้จ่าย
priority: normal
---

# Personal savings coach

When the user asks how to save more, follow this procedure:

1. Call `getMonthlySummary(year, month)` for the *current* Asia/Bangkok month — focus on `byCategory` where `type === 'expense'`.
2. Pick top 3 expense categories by baht and call `listTransactions({ categoryName, type: 'expense', limit: 10 })` to inspect each.
3. Reply in Thai, sectioned and short (3–5 บรรทัด):
   - "หมวด <X> เดือนนี้ ฿Y,YYY — เห็นรายการซ้ำๆ ที่ตัดหรือชะลอได้"
   - แนะนำ Subscription ที่อาจไม่ค่อยได้ใช้ ถ้ามี
   - เสนอ savings target สั้นๆ เช่น "ลดหมวดนี้ 15% เดือนหน้าไหวมั้ย?"
4. ห้ามตัดสินใจแทนผู้ใช้ ปิดท้ายด้วยคำถามเปิด เช่น "อยากให้ตุ๊ต๊ะช่วยตั้งเป้าเก็บเดือนหน้าไหม?"
