export interface ApiCategory {
  id: number
  name: string
  type: 'income' | 'expense'
  icon: string | null
  color: string | null
  isDefault: boolean
  disabled: boolean
  createdAt: string
}

export interface ApiUserMini {
  id: string
  displayName: string
  avatarUrl: string | null
  lineUserId: string
}

export interface ApiAttachment {
  id: string
  transactionId: string
  filename: string
  filepath: string
  mimeType: string
  sizeBytes: number
  createdAt: string
}

export interface ApiTransaction {
  id: string
  type: 'income' | 'expense'
  amount: number
  amountBaht: number
  categoryId: number
  category: ApiCategory
  title: string | null
  note: string | null
  occurredAt: string
  createdById: string
  createdBy: ApiUserMini
  createdAt: string
  attachments: ApiAttachment[]
}

export interface ApiUser {
  id: string
  lineUserId: string
  displayName: string
  avatarUrl: string | null
  role: 'admin' | 'member'
  registeredAt: string | null
  registered: boolean
  createdAt: string
}

export interface MonthlyReport {
  year: number
  month: number
  totalIncomeBaht: number
  totalExpenseBaht: number
  netBaht: number
  byCategory: Array<{
    categoryId: number
    name: string
    type: 'income' | 'expense'
    totalBaht: number
    count: number
  }>
}

export interface ApiPromptPayLink {
  id: string
  identifier: string
  kind: 'phone' | 'national_id'
  displayName: string | null
  createdAt: string
  updatedAt: string
}

export type DebtStatus = 'pending' | 'paid' | 'rejected' | 'later'

export interface ApiDebtRequest {
  id: string
  creditor: ApiUserMini
  debtor: ApiUserMini
  amountBaht: number
  reason: string | null
  dueAt: string | null
  status: DebtStatus
  createdAt: string
  resolvedAt: string | null
}

export type DebtRole = 'creditor' | 'debtor'

export interface ApiGroup {
  id: string
  name: string
  code: string
  role: 'admin' | 'member'
  memberCount: number
  createdAt: string
}

export interface ApiGroupDetail {
  id: string
  name: string
  code: string
  memberCount: number
  createdAt: string
  isAdmin: boolean
}

export interface ApiGroupMember {
  id: string
  userId: string
  displayName: string
  avatarUrl: string | null
  role: 'admin' | 'member'
  joinedAt: string
}

export interface AuthHeaders {
  bearer?: string
  lineUserId?: string
  displayName?: string
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

function buildHeaders(auth: AuthHeaders, json = false): HeadersInit {
  const h: Record<string, string> = {}
  if (json) h['content-type'] = 'application/json'
  if (auth.bearer) h['authorization'] = `Bearer ${auth.bearer}`
  if (auth.lineUserId) h['x-line-user-id'] = auth.lineUserId
  if (auth.displayName) h['x-line-display-name'] = auth.displayName
  return h
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`api error ${res.status}: ${body}`)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

export const api = {
  base: API_BASE,

  me: (auth: AuthHeaders) =>
    fetch(`${API_BASE}/me`, { headers: buildHeaders(auth) }).then((r) => handle<ApiUser>(r)),

  register: (auth: AuthHeaders, body: Record<string, never> = {}) =>
    fetch(`${API_BASE}/register`, {
      method: 'POST',
      headers: buildHeaders(auth, true),
      body: JSON.stringify(body),
    }).then((r) => handle<ApiUser>(r)),

  listCategories: (opts: { includeDisabled?: boolean } = {}) => {
    const qs = opts.includeDisabled ? '?includeDisabled=true' : ''
    return fetch(`${API_BASE}/categories${qs}`).then((r) =>
      handle<{ data: ApiCategory[] }>(r).then((d) => d.data),
    )
  },

  createCategory: (
    auth: AuthHeaders,
    body: { name: string; type: 'income' | 'expense'; icon?: string; color?: string },
  ) =>
    fetch(`${API_BASE}/categories`, {
      method: 'POST',
      headers: buildHeaders(auth, true),
      body: JSON.stringify(body),
    }).then((r) => handle<ApiCategory>(r)),

  updateCategory: (
    auth: AuthHeaders,
    id: number,
    body: Partial<{
      name: string
      icon: string | null
      color: string | null
      disabled: boolean
    }>,
  ) =>
    fetch(`${API_BASE}/categories/${id}`, {
      method: 'PATCH',
      headers: buildHeaders(auth, true),
      body: JSON.stringify(body),
    }).then((r) => handle<ApiCategory>(r)),

  listTransactions: (
    auth: AuthHeaders,
    params: {
      from?: string
      to?: string
      type?: 'income' | 'expense'
      categoryId?: number
      memberId?: string
      groupId?: string
      page?: number
      pageSize?: number
    } = {},
  ) => {
    const qs = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) {
      if (v != null && v !== '') qs.set(k, String(v))
    }
    const q = qs.toString()
    return fetch(`${API_BASE}/transactions${q ? `?${q}` : ''}`, {
      headers: buildHeaders(auth),
    }).then((r) =>
      handle<{ data: ApiTransaction[]; total: number; page: number; pageSize: number }>(r),
    )
  },

  getTransaction: (auth: AuthHeaders, id: string) =>
    fetch(`${API_BASE}/transactions/${id}`, { headers: buildHeaders(auth) }).then((r) =>
      handle<ApiTransaction>(r),
    ),

  createTransaction: (
    auth: AuthHeaders,
    body: {
      type: 'income' | 'expense'
      amountBaht: number
      categoryId: number
      occurredAt: string
      title?: string
      note?: string
    },
  ) =>
    fetch(`${API_BASE}/transactions`, {
      method: 'POST',
      headers: buildHeaders(auth, true),
      body: JSON.stringify(body),
    }).then((r) => handle<ApiTransaction>(r)),

  updateTransaction: (
    auth: AuthHeaders,
    id: string,
    body: Partial<{
      type: 'income' | 'expense'
      amountBaht: number
      categoryId: number
      occurredAt: string
      title: string | null
      note: string | null
    }>,
  ) =>
    fetch(`${API_BASE}/transactions/${id}`, {
      method: 'PATCH',
      headers: buildHeaders(auth, true),
      body: JSON.stringify(body),
    }).then((r) => handle<ApiTransaction>(r)),

  deleteTransaction: (auth: AuthHeaders, id: string) =>
    fetch(`${API_BASE}/transactions/${id}`, {
      method: 'DELETE',
      headers: buildHeaders(auth),
    }).then((r) => handle<void>(r)),

  uploadAttachment: (auth: AuthHeaders, transactionId: string, file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    return fetch(`${API_BASE}/transactions/${transactionId}/attachments`, {
      method: 'POST',
      headers: buildHeaders(auth),
      body: fd,
    }).then((r) => handle<ApiAttachment>(r))
  },

  attachmentFileUrl: (id: string) => `${API_BASE}/attachments/${id}/file`,

  deleteAttachment: (auth: AuthHeaders, id: string) =>
    fetch(`${API_BASE}/attachments/${id}`, {
      method: 'DELETE',
      headers: buildHeaders(auth),
    }).then((r) => handle<void>(r)),

  monthlyReport: (auth: AuthHeaders, year: number, month: number) =>
    fetch(`${API_BASE}/reports/monthly?year=${year}&month=${month}`, {
      headers: buildHeaders(auth),
    }).then((r) => handle<MonthlyReport>(r)),

  // ── PromptPay ────────────────────────────────────────────────────────────

  getMyPromptPay: (auth: AuthHeaders) =>
    fetch(`${API_BASE}/me/promptpay`, { headers: buildHeaders(auth) }).then((r) =>
      handle<ApiPromptPayLink | null>(r),
    ),

  setMyPromptPay: (
    auth: AuthHeaders,
    body: { identifier: string; kind: 'phone' | 'national_id'; displayName?: string | null },
  ) =>
    fetch(`${API_BASE}/me/promptpay`, {
      method: 'POST',
      headers: buildHeaders(auth, true),
      body: JSON.stringify(body),
    }).then((r) => handle<ApiPromptPayLink>(r)),

  deleteMyPromptPay: (auth: AuthHeaders) =>
    fetch(`${API_BASE}/me/promptpay`, {
      method: 'DELETE',
      headers: buildHeaders(auth),
    }).then((r) => handle<void>(r)),

  getMyPromptPayQr: (auth: AuthHeaders, amountBaht?: number) =>
    fetch(`${API_BASE}/me/promptpay/qr${amountBaht !== undefined ? `?amountSatang=${Math.round(amountBaht * 100)}` : ''}`, {
      headers: buildHeaders(auth),
    }).then((r) => {
      if (!r.ok) throw new Error(`api error ${r.status}`)
      return r.blob()
    }),

  // ── Debts ────────────────────────────────────────────────────────────────

  listDebts: (
    auth: AuthHeaders,
    params: { role?: DebtRole; status?: DebtStatus; groupId?: string } = {},
  ) => {
    const qs = new URLSearchParams()
    if (params.role) qs.set('role', params.role)
    if (params.status) qs.set('status', params.status)
    if (params.groupId) qs.set('groupId', params.groupId)
    const q = qs.toString()
    return fetch(`${API_BASE}/debts${q ? `?${q}` : ''}`, {
      headers: buildHeaders(auth),
    }).then((r) => handle<{ data: ApiDebtRequest[] }>(r))
  },

  createDebt: (
    auth: AuthHeaders,
    body: {
      debtorLineUserId: string
      amountBaht: number
      reason?: string
      dueAt?: string
    },
  ) =>
    fetch(`${API_BASE}/debts`, {
      method: 'POST',
      headers: buildHeaders(auth, true),
      body: JSON.stringify(body),
    }).then((r) => handle<ApiDebtRequest>(r)),

  updateDebtStatus: (auth: AuthHeaders, id: string, status: DebtStatus) =>
    fetch(`${API_BASE}/debts/${id}/status`, {
      method: 'PATCH',
      headers: buildHeaders(auth, true),
      body: JSON.stringify({ status }),
    }).then((r) => handle<ApiDebtRequest>(r)),

  searchUsers: (auth: AuthHeaders, query: string) =>
    fetch(`${API_BASE}/users/search?q=${encodeURIComponent(query)}`, {
      headers: buildHeaders(auth),
    }).then((r) => handle<{ data: ApiUserMini[] }>(r)),

  // ── Groups ───────────────────────────────────────────────────────────────

  listGroups: (auth: AuthHeaders) =>
    fetch(`${API_BASE}/groups`, { headers: buildHeaders(auth) }).then((r) =>
      handle<{ groups: ApiGroup[] }>(r),
    ),

  createGroup: (auth: AuthHeaders, body: { name: string }) =>
    fetch(`${API_BASE}/groups`, {
      method: 'POST',
      headers: buildHeaders(auth, true),
      body: JSON.stringify(body),
    }).then((r) => handle<{ id: string; name: string; code: string; createdAt: string }>(r)),

  joinGroup: (auth: AuthHeaders, body: { code: string }) =>
    fetch(`${API_BASE}/groups/join`, {
      method: 'POST',
      headers: buildHeaders(auth, true),
      body: JSON.stringify(body),
    }).then((r) => handle<{ id: string; name: string; joinedAt: string }>(r)),

  getGroup: (auth: AuthHeaders, id: string) =>
    fetch(`${API_BASE}/groups/${id}`, { headers: buildHeaders(auth) }).then((r) =>
      handle<ApiGroupDetail>(r),
    ),

  getGroupMembers: (auth: AuthHeaders, id: string) =>
    fetch(`${API_BASE}/groups/${id}/members`, { headers: buildHeaders(auth) }).then((r) =>
      handle<{ members: ApiGroupMember[] }>(r),
    ),

  leaveGroup: (auth: AuthHeaders, id: string) =>
    fetch(`${API_BASE}/groups/${id}/leave`, {
      method: 'DELETE',
      headers: buildHeaders(auth),
    }).then((r) => handle<{ success: boolean }>(r)),

  deleteGroup: (auth: AuthHeaders, id: string) =>
    fetch(`${API_BASE}/groups/${id}`, {
      method: 'DELETE',
      headers: buildHeaders(auth),
    }).then((r) => handle<{ success: boolean }>(r)),

  kickGroupMember: (auth: AuthHeaders, groupId: string, memberId: string) =>
    fetch(`${API_BASE}/groups/${groupId}/members/${memberId}`, {
      method: 'DELETE',
      headers: buildHeaders(auth),
    }).then((r) => handle<{ success: boolean }>(r)),

  generatePromptPayQr: (body: { identifier: string; kind: 'phone' | 'national_id'; amountBaht?: number }) =>
    fetch(`${API_BASE}/promptpay/qr`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }).then((r) => {
      if (!r.ok) throw new Error(`api error ${r.status}`)
      return r.blob()
    }),

  chatWithSecretary: (auth: AuthHeaders, message: string) =>
    fetch(`${API_BASE}/chat`, {
      method: 'POST',
      headers: buildHeaders(auth, true),
      body: JSON.stringify({ message }),
    }).then((r) => handle<{ response: string }>(r)),
}
