import type { messagingApi } from '@line/bot-sdk'
import type { Category, Transaction, DebtRequest, User } from '@prisma/client'

type FlexBubble = messagingApi.FlexBubble
type FlexMessage = messagingApi.FlexMessage
type QuickReply = messagingApi.QuickReply

export type TxnWithCategory = Transaction & { category: Category }

const SATANG_PER_BAHT = 100
const INCOME_COLOR = '#16a34a'
const EXPENSE_COLOR = '#dc2626'
const FALLBACK_DOT_COLOR = '#64748b'

function formatBaht(amountSatang: number): string {
  const baht = amountSatang / SATANG_PER_BAHT
  return baht.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatThaiDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${dd}/${mm} ${hh}:${mi}`
}

function signedAmount(txn: TxnWithCategory): string {
  const sign = txn.type === 'income' ? '+' : '-'
  return `${sign}฿${formatBaht(txn.amount)}`
}

function colorFor(txn: TxnWithCategory): string {
  if (txn.category.color) return txn.category.color
  return txn.type === 'income' ? INCOME_COLOR : EXPENSE_COLOR
}

function quickReplyForTxn(): QuickReply {
  return {
    items: [
      { type: 'action', action: { type: 'message', label: 'ยกเลิก', text: '/undo' } },
      { type: 'action', action: { type: 'message', label: 'ดูรายการ', text: '/last' } },
    ],
  }
}

function bubbleForTxn(txn: TxnWithCategory, header: string): FlexBubble {
  const dot = txn.category.color ?? FALLBACK_DOT_COLOR
  const amountColor = colorFor(txn)

  return {
    type: 'bubble',
    size: 'kilo',
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'md',
      contents: [
        { type: 'text', text: header, size: 'sm', color: '#94a3b8', weight: 'bold' },
        { type: 'text', text: signedAmount(txn), size: 'xxl', weight: 'bold', color: amountColor },
        {
          type: 'box',
          layout: 'horizontal',
          spacing: 'sm',
          contents: [
            {
              type: 'box',
              layout: 'vertical',
              width: '12px',
              height: '12px',
              backgroundColor: dot,
              cornerRadius: '6px',
              contents: [],
            },
            { type: 'text', text: txn.category.name, size: 'md', color: '#0f172a', flex: 1, gravity: 'center' },
          ],
        },
        ...(txn.note
          ? [{ type: 'text' as const, text: txn.note, size: 'sm', color: '#475569', wrap: true }]
          : []),
        { type: 'text', text: formatThaiDate(txn.occurredAt), size: 'xs', color: '#94a3b8' },
      ],
    },
  }
}

export function buildConfirmationBubble(txn: TxnWithCategory): FlexMessage {
  return {
    type: 'flex',
    altText: `บันทึก ${signedAmount(txn)} ${txn.category.name}`,
    contents: bubbleForTxn(txn, 'บันทึกแล้วครับ'),
    quickReply: quickReplyForTxn(),
  }
}

export function buildUndoConfirmationBubble(txn: TxnWithCategory): FlexMessage {
  return {
    type: 'flex',
    altText: `ยกเลิก ${signedAmount(txn)} ${txn.category.name}`,
    contents: bubbleForTxn(txn, 'ยกเลิกรายการแล้วครับ'),
  }
}

export function buildLastCarousel(txns: TxnWithCategory[]): FlexMessage {
  const bubbles = txns.slice(0, 5).map((t) => bubbleForTxn(t, 'รายการล่าสุด'))
  if (bubbles.length === 1) {
    return { type: 'flex', altText: 'รายการล่าสุด', contents: bubbles[0] }
  }
  return {
    type: 'flex',
    altText: 'รายการล่าสุด',
    contents: { type: 'carousel', contents: bubbles },
  }
}

const THB = new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' })
const HEADER_BG = '#0E1726'
const NET_POSITIVE = '#16a34a'
const NET_NEGATIVE = '#e11d48'

interface MonthSummaryInput {
  monthLabel: string
  totalIncomeBaht: number
  totalExpenseBaht: number
  netBaht: number
  txCount: number
}

interface CategoryBreakdown {
  name: string
  type: 'income' | 'expense'
  totalBaht: number
  count: number
  color?: string | null
}

interface MonthReportInput extends MonthSummaryInput {
  byCategory: CategoryBreakdown[]
  webBaseUrl: string
}

function headerBox(title: string): FlexBubble['header'] {
  return {
    type: 'box',
    layout: 'vertical',
    backgroundColor: HEADER_BG,
    paddingAll: 'lg',
    contents: [{ type: 'text', text: title, color: '#FFFFFF', weight: 'bold', size: 'lg', wrap: true }],
  }
}

function amountRow(label: string, value: string, color: string): messagingApi.FlexBox {
  return {
    type: 'box',
    layout: 'horizontal',
    contents: [
      { type: 'text', text: label, size: 'sm', color: '#475569', flex: 3 },
      { type: 'text', text: value, size: 'sm', color, align: 'end', flex: 4, weight: 'bold' },
    ],
  }
}

export function buildMonthSummaryBubble(input: MonthSummaryInput): FlexMessage {
  const { monthLabel, totalIncomeBaht, totalExpenseBaht, netBaht, txCount } = input
  const netColor = netBaht >= 0 ? NET_POSITIVE : NET_NEGATIVE
  const bubble: FlexBubble = {
    type: 'bubble',
    size: 'kilo',
    header: headerBox(`📅 สรุปเดือน ${monthLabel}`),
    body: {
      type: 'box',
      layout: 'vertical',
      backgroundColor: '#FAF6EC',
      spacing: 'md',
      contents: [
        { type: 'text', text: 'ยอดสุทธิ', size: 'xs', color: '#94a3b8' },
        { type: 'text', text: THB.format(netBaht), size: 'xxl', weight: 'bold', color: netColor },
        { type: 'separator', margin: 'md' },
        amountRow('รายรับ', THB.format(totalIncomeBaht), NET_POSITIVE),
        amountRow('รายจ่าย', THB.format(totalExpenseBaht), NET_NEGATIVE),
        { type: 'text', text: `${txCount} รายการ`, size: 'xs', color: '#94a3b8', margin: 'md' },
      ],
    },
  }
  return { type: 'flex', altText: `สรุปเดือน ${monthLabel}: ${THB.format(netBaht)}`, contents: bubble }
}

function categoryRow(c: CategoryBreakdown): messagingApi.FlexBox {
  const dot = c.color ?? (c.type === 'income' ? INCOME_COLOR : EXPENSE_COLOR)
  const valueColor = c.type === 'income' ? NET_POSITIVE : NET_NEGATIVE
  return {
    type: 'box',
    layout: 'horizontal',
    spacing: 'sm',
    contents: [
      {
        type: 'box',
        layout: 'vertical',
        width: '10px',
        height: '10px',
        backgroundColor: dot,
        cornerRadius: '5px',
        contents: [],
        margin: 'sm',
      },
      { type: 'text', text: c.name, size: 'sm', color: '#0f172a', flex: 4, gravity: 'center' },
      {
        type: 'text',
        text: THB.format(c.totalBaht),
        size: 'sm',
        color: valueColor,
        align: 'end',
        flex: 4,
        gravity: 'center',
        weight: 'bold',
      },
    ],
  }
}

export function buildMonthReportBubble(input: MonthReportInput): FlexMessage {
  const { monthLabel, totalIncomeBaht, totalExpenseBaht, netBaht, txCount, byCategory, webBaseUrl } = input
  const netColor = netBaht >= 0 ? NET_POSITIVE : NET_NEGATIVE
  const expenses = byCategory.filter((c) => c.type === 'expense').slice(0, 5)
  const incomes = byCategory.filter((c) => c.type === 'income').slice(0, 3)

  const bodyContents: messagingApi.FlexComponent[] = [
    { type: 'text', text: 'ยอดสุทธิ', size: 'xs', color: '#94a3b8' },
    { type: 'text', text: THB.format(netBaht), size: 'xxl', weight: 'bold', color: netColor },
    amountRow('รายรับรวม', THB.format(totalIncomeBaht), NET_POSITIVE),
    amountRow('รายจ่ายรวม', THB.format(totalExpenseBaht), NET_NEGATIVE),
    amountRow('จำนวนรายการ', `${txCount}`, '#0f172a'),
  ]

  if (expenses.length > 0) {
    bodyContents.push({ type: 'separator', margin: 'md' })
    bodyContents.push({
      type: 'text',
      text: 'หมวดรายจ่ายสูงสุด',
      size: 'xs',
      color: '#94a3b8',
      weight: 'bold',
      margin: 'md',
    })
    for (const e of expenses) bodyContents.push(categoryRow(e))
  }

  if (incomes.length > 0) {
    bodyContents.push({ type: 'separator', margin: 'md' })
    bodyContents.push({
      type: 'text',
      text: 'หมวดรายรับสูงสุด',
      size: 'xs',
      color: '#94a3b8',
      weight: 'bold',
      margin: 'md',
    })
    for (const i of incomes) bodyContents.push(categoryRow(i))
  }

  const bubble: FlexBubble = {
    type: 'bubble',
    size: 'mega',
    header: headerBox(`📊 รายงานเดือน ${monthLabel}`),
    body: {
      type: 'box',
      layout: 'vertical',
      backgroundColor: '#FAF6EC',
      spacing: 'sm',
      contents: bodyContents,
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'button',
          style: 'primary',
          color: HEADER_BG,
          action: { type: 'uri', label: 'ดูบน Dashboard', uri: `${webBaseUrl}/` },
        },
      ],
    },
  }

  return { type: 'flex', altText: `รายงานเดือน ${monthLabel}`, contents: bubble }
}

interface PromptPayQrInput {
  qrImageUrl: string
  identifierMasked: string
  amountBaht?: number
  ownerDisplayName: string
}

export function buildPromptPayQrBubble(input: PromptPayQrInput): FlexMessage {
  const amountText =
    typeof input.amountBaht === 'number'
      ? THB.format(input.amountBaht)
      : 'จำนวนใดก็ได้'
  return {
    type: 'flex',
    altText: `PromptPay QR · ${amountText}`,
    contents: {
      type: 'bubble',
      size: 'kilo',
      header: headerBox('💸 PromptPay QR'),
      body: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#FAF6EC',
        spacing: 'md',
        contents: [
          { type: 'text', text: input.ownerDisplayName, size: 'sm', color: '#475569' },
          {
            type: 'image',
            url: input.qrImageUrl,
            size: 'full',
            aspectRatio: '1:1',
            aspectMode: 'fit',
            backgroundColor: '#FFFFFF',
          },
          { type: 'text', text: amountText, size: 'xl', weight: 'bold', align: 'center', color: '#0f172a' },
          { type: 'text', text: input.identifierMasked, size: 'xs', color: '#94a3b8', align: 'center' },
        ],
      },
    },
  }
}

interface DebtFlexInput {
  debt: DebtRequest
  creditor: Pick<User, 'displayName' | 'avatarUrl'>
}

export function buildDebtRequestBubbleForDebtor(input: DebtFlexInput): FlexMessage {
  const amountBaht = input.debt.amount / SATANG_PER_BAHT
  const reason = input.debt.reason ?? '—'
  const bubble: FlexBubble = {
    type: 'bubble',
    size: 'kilo',
    header: headerBox('💰 เพื่อนขอเก็บเงิน'),
    body: {
      type: 'box',
      layout: 'vertical',
      backgroundColor: '#FAF6EC',
      spacing: 'md',
      contents: [
        { type: 'text', text: `${input.creditor.displayName} ขอ`, size: 'sm', color: '#475569' },
        { type: 'text', text: THB.format(amountBaht), size: 'xxl', weight: 'bold', color: NET_NEGATIVE },
        { type: 'text', text: `เหตุ: ${reason}`, size: 'sm', color: '#0f172a', wrap: true },
      ],
    },
    footer: {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      contents: [
        {
          type: 'button',
          style: 'primary',
          color: NET_POSITIVE,
          action: { type: 'message', label: 'ชำระแล้ว', text: `/debt-paid ${input.debt.id}` },
        },
        {
          type: 'button',
          style: 'secondary',
          action: { type: 'message', label: 'ยังไม่ใช่ตอนนี้', text: `/debt-later ${input.debt.id}` },
        },
        {
          type: 'button',
          style: 'link',
          color: NET_NEGATIVE,
          action: { type: 'message', label: 'ปฏิเสธ', text: `/debt-reject ${input.debt.id}` },
        },
      ],
    },
  }
  return {
    type: 'flex',
    altText: `${input.creditor.displayName} ขอเก็บเงิน ${THB.format(amountBaht)}`,
    contents: bubble,
  }
}

interface DebtListInput {
  outgoing: Array<DebtRequest & { debtor: Pick<User, 'displayName'> }>
  incoming: Array<DebtRequest & { creditor: Pick<User, 'displayName'> }>
}

export function buildDebtListBubble(input: DebtListInput): FlexMessage {
  const lines: messagingApi.FlexComponent[] = []
  if (input.outgoing.length > 0) {
    lines.push({
      type: 'text',
      text: 'คนอื่นค้างคุณ',
      size: 'xs',
      weight: 'bold',
      color: '#94a3b8',
    })
    for (const d of input.outgoing.slice(0, 5)) {
      lines.push({
        type: 'box',
        layout: 'baseline',
        spacing: 'sm',
        contents: [
          { type: 'text', text: d.debtor.displayName, size: 'sm', color: '#0f172a', flex: 5 },
          {
            type: 'text',
            text: THB.format(d.amount / SATANG_PER_BAHT),
            size: 'sm',
            color: NET_POSITIVE,
            align: 'end',
            weight: 'bold',
            flex: 4,
          },
          { type: 'text', text: d.status, size: 'xxs', color: '#94a3b8', flex: 3 },
        ],
      })
    }
  }
  if (input.incoming.length > 0) {
    if (lines.length > 0) lines.push({ type: 'separator', margin: 'md' })
    lines.push({
      type: 'text',
      text: 'คุณค้างคนอื่น',
      size: 'xs',
      weight: 'bold',
      color: '#94a3b8',
    })
    for (const d of input.incoming.slice(0, 5)) {
      lines.push({
        type: 'box',
        layout: 'baseline',
        spacing: 'sm',
        contents: [
          { type: 'text', text: d.creditor.displayName, size: 'sm', color: '#0f172a', flex: 5 },
          {
            type: 'text',
            text: THB.format(d.amount / SATANG_PER_BAHT),
            size: 'sm',
            color: NET_NEGATIVE,
            align: 'end',
            weight: 'bold',
            flex: 4,
          },
          { type: 'text', text: d.status, size: 'xxs', color: '#94a3b8', flex: 3 },
        ],
      })
    }
  }
  if (lines.length === 0) {
    lines.push({ type: 'text', text: 'ไม่มีหนี้คงค้างครับ', size: 'sm', color: '#475569' })
  }
  const bubble: FlexBubble = {
    type: 'bubble',
    size: 'kilo',
    header: headerBox('🧾 หนี้คงค้าง'),
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      backgroundColor: '#FAF6EC',
      contents: lines,
    },
  }
  return { type: 'flex', altText: 'หนี้คงค้าง', contents: bubble }
}
