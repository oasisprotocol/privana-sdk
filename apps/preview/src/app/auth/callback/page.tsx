'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useHostedRedirectAuth } from '@oasisprotocol/flexvaults-sdk'

export default function HostedAuthCallbackPage() {
  const router = useRouter()
  const { completeLogin } = useHostedRedirectAuth()
  const [status, setStatus] = useState('Completing Flexvaults sign-in...')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function finishLogin() {
      try {
        const session = await completeLogin()
        if (cancelled) return

        if (!session) {
          setStatus('No hosted authentication response was found.')
          return
        }

        setStatus(`Signed in as ${session.address}. Redirecting...`)
        router.replace('/')
      } catch (completionError) {
        if (cancelled) return

        setStatus('Unable to complete hosted sign-in.')
        setError(
          completionError instanceof Error
            ? completionError.message
            : 'Hosted authentication failed.'
        )
      }
    }

    void finishLogin()

    return () => {
      cancelled = true
    }
  }, [completeLogin, router])

  return (
    <main className="bg-background text-foreground flex min-h-screen items-center justify-center px-6 py-12">
      <div className="border-border bg-card text-card-foreground w-full max-w-md space-y-4 rounded-2xl border p-6 shadow-sm">
        <h1 className="text-xl font-semibold">Hosted Auth Callback</h1>
        <p className="text-sm">{status}</p>
        {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
        <div>
          <Link className="text-sm underline underline-offset-4" href="/">
            Return to preview
          </Link>
        </div>
      </div>
    </main>
  )
}
