import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import '@oasisprotocol/flexvaults-sdk/styles.css'
import { ClientShell } from './client-shell'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'Flexvaults SDK - Theme Editor & Component Preview',
  description:
    'Interactive theme editor for the @oasisprotocol/flexvaults-sdk. Customize colors, border radius, and preview components in real time.',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <ClientShell>{children}</ClientShell>
      </body>
    </html>
  )
}
