'use client'

import { useEffect, useState } from 'react'
import { useAccount } from 'wagmi'
import { useConnectModal } from '@rainbow-me/rainbowkit'
import { toast } from 'sonner'
import {
  PrivanaButton,
  DepositModal,
  WithdrawModal,
  WalletModal,
  WalletInlineModal,
  usePrivanaContext,
  useHostedRedirectAuth,
  type Allowance,
  type WalletSession,
} from '@oasisprotocol/privana-sdk'
import { PreviewLayout, SectionLabel } from './preview-layout'

const demoAllowance: Allowance = {
  value: '1000000000',
  minAmount: '0',
  lockDuration: 86400,
  terms: {
    permissions: [
      {
        title: 'Play instantly - no signing, no interruptions',
        description:
          'Your deposited assets become available to bet and settle outcomes with zero per-action signatures.',
      },
    ],
    restrictions: [
      {
        title: 'Not possible to withdraw to an outside wallet',
        description: 'Funds and cash-outs stay inside your account.',
      },
    ],
  },
}

export function ComponentPreview() {
  const { isConnected } = useAccount()
  const { openConnectModal } = useConnectModal()
  const [depositModalOpen, setDepositModalOpen] = useState(false)
  const [withdrawModalOpen, setWithdrawModalOpen] = useState(false)
  const [walletModalOpen, setWalletModalOpen] = useState(false)
  const [sessionMode, setSessionMode] = useState<'none' | 'zero' | 'mixed'>('none')
  const [failEndSession, setFailEndSession] = useState(false)
  const [sessionExpiry] = useState(() => Math.floor(Date.now() / 1000) + 20 * 3600 + 34 * 60)

  const demoSession: WalletSession | undefined =
    sessionMode === 'none'
      ? undefined
      : { inUse: sessionMode === 'zero' ? '0' : '500000000', expiry: sessionExpiry }

  const walletHandlers = {
    session: demoSession,
    allowance: demoAllowance,
    onConnectWallet: openConnectModal,
    onFundSession: (args: { tokenId: string; amount: string }) => {
      console.log('WalletModal onFundSession', args)
      toast.success(`Play with ${args.amount}`)
    },
    onEndSession: () =>
      new Promise<void>((resolve, reject) => {
        setTimeout(() => {
          if (failEndSession) {
            reject(new Error('Demo settlement failure'))
          } else {
            setSessionMode('none')
            resolve()
          }
        }, 1500)
      }),
    onDepositSuccess: () => toast.success('Deposit credited'),
  }

  return (
    <PreviewLayout>
      {isConnected && (
        <div>
          <SectionLabel>Live SDK Button</SectionLabel>
          <div className="flex items-center justify-center gap-3">
            <PrivanaButton />
            <button
              type="button"
              className="rounded border px-3 py-2 text-sm"
              onClick={() => setDepositModalOpen(true)}
            >
              Deposit Modal
            </button>
            <button
              type="button"
              className="rounded border px-3 py-2 text-sm"
              onClick={() => setWithdrawModalOpen(true)}
            >
              Withdraw Modal
            </button>
            <button
              type="button"
              className="rounded border px-3 py-2 text-sm"
              onClick={() => setWalletModalOpen(true)}
            >
              Wallet Modal
            </button>
          </div>
          <div className="mt-3 flex items-center justify-center gap-3 text-sm">
            <span>Demo session:</span>
            {(['none', 'zero', 'mixed'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                className={`rounded border px-2 py-1 ${sessionMode === mode ? 'font-bold underline' : ''}`}
                onClick={() => setSessionMode(mode)}
              >
                {mode}
              </button>
            ))}
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={failEndSession}
                onChange={(e) => setFailEndSession(e.target.checked)}
              />
              Fail end session
            </label>
          </div>
          <DepositModal
            open={depositModalOpen}
            onClose={() => setDepositModalOpen(false)}
            allowance={demoAllowance}
            onConnectWallet={openConnectModal}
            onDeposit={(args) => console.log('DepositModal onDeposit', args)}
            onDepositSuccess={() => {
              setDepositModalOpen(false)
              toast.success('Deposit credited')
            }}
          />
          <WithdrawModal open={withdrawModalOpen} onClose={() => setWithdrawModalOpen(false)} />
          <WalletModal
            open={walletModalOpen}
            onClose={() => setWalletModalOpen(false)}
            {...walletHandlers}
          />
        </div>
      )}

      <HostedAuthPreview />

      <div>
        <SectionLabel>Live SDK Modal</SectionLabel>
        <div className="flex flex-col items-center gap-6">
          <WalletInlineModal {...walletHandlers} />
        </div>
      </div>
    </PreviewLayout>
  )
}

function HostedAuthPreview() {
  const { client, hostedAuthConfig } = usePrivanaContext()
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
            Sign in with Privana
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
