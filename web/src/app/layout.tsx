import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'
import { ShellSwitcher } from '@/components/ShellSwitcher'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'PromKep-Tutra',
  description: 'บันทึกรายรับ-รายจ่ายส่วนตัว',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="th"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full text-zinc-900">
        <Providers>
          <ShellSwitcher>{children}</ShellSwitcher>
        </Providers>
      </body>
    </html>
  )
}
