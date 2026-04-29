'use client'

import * as React from 'react'
import { usePathname, useRouter } from 'next/navigation'
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { initLiff, type LiffProfile } from '@/lib/liff'
import { api, type ApiUser, type AuthHeaders } from '@/lib/api'

interface AuthState {
  ready: boolean
  error: string | null
  profile: LiffProfile | null
  authHeaders: AuthHeaders
  retry: () => void
}

const AuthContext = React.createContext<AuthState | null>(null)

export function useAuth(): AuthState {
  const ctx = React.useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within Providers')
  return ctx
}

function useAuthState(): AuthState {
  const [ready, setReady] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [profile, setProfile] = React.useState<LiffProfile | null>(null)
  const [authHeaders, setAuthHeaders] = React.useState<AuthHeaders>({})
  const [tick, setTick] = React.useState(0)

  React.useEffect(() => {
    let cancelled = false
    setReady(false)
    setError(null)
    initLiff()
      .then((session) => {
        if (cancelled) return
        setProfile(session.profile)
        setAuthHeaders(session.authHeaders)
        setReady(true)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        const msg = err instanceof Error ? err.message : 'LIFF init failed'
        setError(msg)
        setReady(false)
      })
    return () => {
      cancelled = true
    }
  }, [tick])

  const retry = React.useCallback(() => setTick((t) => t + 1), [])

  return { ready, error, profile, authHeaders, retry }
}

function BrandedLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-rose-100 via-orange-100 to-amber-50">
      <div className="flex flex-col items-center gap-4">
        <div className="relative h-16 w-16">
          <div className="absolute inset-0 animate-ping rounded-full bg-gradient-to-br from-rose-400 to-amber-500 opacity-30" />
          <div className="absolute inset-0 flex items-center justify-center rounded-full bg-gradient-to-br from-rose-400 to-amber-500 text-2xl font-bold text-white shadow-lg">
            ฿
          </div>
        </div>
        <p className="text-sm font-medium tracking-wide text-rose-700/80">
          PromKep-Tutra · กำลังโหลด...
        </p>
      </div>
    </div>
  )
}

function RegistrationGuard({ children }: { children: React.ReactNode }) {
  const { ready, authHeaders } = useAuth()
  const pathname = usePathname()
  const router = useRouter()

  const meQuery = useQuery<ApiUser>({
    queryKey: ['me', authHeaders.lineUserId],
    queryFn: () => api.me(authHeaders),
    enabled: ready,
    retry: false,
  })

  React.useEffect(() => {
    if (!meQuery.data) return
    if (pathname === '/health') return
    const isRegisterRoute = pathname === '/register'
    if (meQuery.data.registered === false && !isRegisterRoute) {
      router.replace('/register')
    } else if (meQuery.data.registered === true && isRegisterRoute) {
      router.replace('/')
    }
  }, [meQuery.data, pathname, router])

  if (pathname === '/health') return <>{children}</>

  if (!ready || !meQuery.data) return <BrandedLoader />

  const isRegisterRoute = pathname === '/register'
  const shouldBeOnRegister = meQuery.data.registered === false
  if (shouldBeOnRegister !== isRegisterRoute) return <BrandedLoader />

  return <>{children}</>
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
          },
        },
      }),
  )
  const auth = useAuthState()

  return (
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={auth}>
        <RegistrationGuard>{children}</RegistrationGuard>
      </AuthContext.Provider>
    </QueryClientProvider>
  )
}

export function useInvalidateMe() {
  const qc = useQueryClient()
  return React.useCallback(() => {
    qc.invalidateQueries({ queryKey: ['me'] })
  }, [qc])
}
