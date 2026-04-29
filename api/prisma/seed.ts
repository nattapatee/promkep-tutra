import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const DEFAULTS = [
  // Income
  { name: 'เงินเดือน',       type: 'income',  icon: 'briefcase',   color: '#16a34a' },
  { name: 'งานเสริม',        type: 'income',  icon: 'wrench',      color: '#0ea5e9' },
  { name: 'อื่นๆ (รับ)',     type: 'income',  icon: 'plus',        color: '#64748b' },
  // Expense — common personal costs
  { name: 'อาหาร',           type: 'expense', icon: 'utensils',    color: '#dc2626' },
  { name: 'เดินทาง',         type: 'expense', icon: 'bus',         color: '#0891b2' },
  { name: 'ของใช้',          type: 'expense', icon: 'package',     color: '#7c3aed' },
  { name: 'Subscription',    type: 'expense', icon: 'credit-card', color: '#9333ea' },
  { name: 'บิล/ค่าน้ำค่าไฟ', type: 'expense', icon: 'zap',         color: '#f59e0b' },
  { name: 'อื่นๆ (จ่าย)',    type: 'expense', icon: 'minus',       color: '#64748b' },
]

async function main() {
  for (const c of DEFAULTS) {
    await prisma.category.upsert({
      where: { name: c.name },
      update: {},
      create: { ...c, isDefault: true },
    })
  }
  // eslint-disable-next-line no-console
  console.log(`Seeded ${DEFAULTS.length} default categories.`)
}

main().finally(() => prisma.$disconnect())
