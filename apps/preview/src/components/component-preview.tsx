'use client'

import { useEffect, useState } from 'react'
import { useAccount } from 'wagmi'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import {
  FlexvaultsButton,
  FlexvaultsInlineModal,
  useFlexvaultsContext,
  useHostedRedirectAuth,
} from '@oasisprotocol/flexvaults-sdk'

export function ComponentPreview() {
  const { isConnected } = useAccount()

  return (
    <div className="bg-background flex h-full flex-col">
      <div className="border-border flex shrink-0 items-center justify-between border-b px-6 py-3">
        <span className="text-muted-foreground text-sm">
          @oasisprotocol/flexvaults-sdk{' '}
          <span className="text-foreground font-semibold">Preview</span>
        </span>
        <div className="flex items-center gap-3">
          <ConnectButton showBalance={false} chainStatus="icon" accountStatus="address" />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-xl space-y-8 px-6 py-8">
          {isConnected && (
            <div>
              <SectionLabel>Live SDK Button</SectionLabel>
              <div className="flex items-center justify-center">
                <FlexvaultsButton />
              </div>
            </div>
          )}

          <HostedAuthPreview />

          <div>
            <SectionLabel>Live SDK Modal</SectionLabel>
            <div className="flex justify-center">
              <FlexvaultsInlineModal />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-muted-foreground mb-3 block text-[10px] font-semibold tracking-wider uppercase">
      {children}
    </span>
  )
}

function HostedAuthPreview() {
  const { client, hostedAuthConfig } = useFlexvaultsContext()
  const { session, login, logout, refresh, isAuthenticated, isLoading, error } =
    useHostedRedirectAuth()
  const [jwtMeAddress, setJwtMeAddress] = useState<string | null>(null)
  const [jwtMeError, setJwtMeError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadJwtMe() {
      if (!session) {
        setJwtMeAddress(null)
        setJwtMeError(null)
        return
      }

      try {
        const response = await fetch(`${client.getBaseUrl()}/v1/accounting/auth/jwt/me`, {
          headers: {
            Authorization: `Bearer ${session.accessToken}`,
          },
        })
        const data = (await response.json()) as { address?: string; detail?: string }
        if (cancelled) return
        if (!response.ok) {
          setJwtMeError(data.detail || 'Request failed')
          setJwtMeAddress(null)
          return
        }
        setJwtMeAddress(data.address ?? null)
        setJwtMeError(null)
      } catch (fetchError) {
        if (cancelled) return
        setJwtMeError(fetchError instanceof Error ? fetchError.message : 'Request failed')
        setJwtMeAddress(null)
      }
    }

    void loadJwtMe()
    return () => {
      cancelled = true
    }
  }, [client, session])

  if (!hostedAuthConfig) {
    return null
  }

  return (
    <div>
      <SectionLabel>Hosted Redirect Auth</SectionLabel>
      <div className="border-border bg-card text-card-foreground space-y-2 rounded-xl border p-4">
        <div className="flex flex-wrap items-center gap-2">
          <button
            className="rounded border px-3 py-2 text-sm"
            onClick={() => void login()}
            disabled={isLoading || isAuthenticated}
          >
            Sign in with Flexvaults
          </button>
          <button
            className="rounded border px-3 py-2 text-sm"
            onClick={() => void refresh()}
            disabled={isLoading || !isAuthenticated}
          >
            Refresh Session
          </button>
          <button
            className="rounded border px-3 py-2 text-sm"
            onClick={() => void logout()}
            disabled={isLoading || !isAuthenticated}
          >
            Logout
          </button>
        </div>
        <p>Status: {isAuthenticated ? 'Authenticated' : 'Signed out'}</p>
        <p>API URL: {client.getBaseUrl()}</p>
        <p>Address: {session?.address || '-'}</p>
        <p>Client ID: {session?.clientId || '-'}</p>
        <p>Redirect URI: {session?.redirectUri || '-'}</p>
        <p>JWT /me: {jwtMeAddress ?? '-'}</p>
        {jwtMeError ? <p>JWT /me error: {jwtMeError}</p> : null}
        {error ? <p>Error: {error.message}</p> : null}
      </div>
    </div>
  )
}
