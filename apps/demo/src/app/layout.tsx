import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import { Providers } from '@/providers'
import { Toaster } from 'sonner'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'Flexvaults SDK',
  description: 'SDK for Flexvaults',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <Providers network="testnet">
          {children}
          <Toaster
            theme="system"
            position="bottom-right"
            toastOptions={{
              classNames: {
                toast: 'bg-card border-border text-foreground',
              },
            }}
          />
        </Providers>
      </body>
    </html>
  )
}
