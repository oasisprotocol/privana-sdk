'use client'

import { useContext, useEffect, useMemo, useState } from 'react'
import { QueryClientContext, useQueries, useQueryClient } from '@tanstack/react-query'
import { WagmiContext, useAccount } from 'wagmi'
import { AccountingApiError } from '../client/errors'
import { useDepositClaim } from '../hooks/use-deposit-claim'
import { usePrivateReadRequest } from '../hooks/use-private-read-request'
import type { DepositCheckResponse } from '../types'

const CLAIM_INTERVAL_MS = 5 * 60_000
const STATUS_POLL_INTERVAL_MS = 15_000

export function followedAfterClaim(followed: string[], deposits: DepositCheckResponse[]): string[] {
  const claimed = deposits.flatMap((d) =>
    d.status === 'pending' && d.deposit_id && !followed.includes(d.deposit_id) ? [d.deposit_id] : []
  )
  return claimed.length ? [...followed, ...claimed] : followed
}

export type FollowedDepositOutcome = 'credited' | 'dropped' | undefined

export function followedDepositOutcome(
  data: DepositCheckResponse | undefined,
  error: unknown
): FollowedDepositOutcome {
  if (data?.status === 'credited') return 'credited'
  if (data?.status === 'error') return 'dropped'
  if (error instanceof AccountingApiError && error.statusCode === 404) return 'dropped'
  return undefined
}

export function BackgroundDepositClaim() {
  const hasWagmi = useContext(WagmiContext) !== undefined
  const hasQueryClient = useContext(QueryClientContext) !== undefined
  if (!hasWagmi || !hasQueryClient) return null
  return <BackgroundDepositClaimRunner />
}

function BackgroundDepositClaimRunner() {
  const queryClient = useQueryClient()
  const { status } = useAccount()
  const { executePrivateRead, privateReadAddress, privateReadAuthorized, privateReadQueryScope } =
    usePrivateReadRequest()
  // A background read must never prompt for a signature.
  const owner =
    privateReadAuthorized && status === 'connected' ? (privateReadAddress ?? undefined) : undefined

  const { deposits } = useDepositClaim({ enabled: !!owner, refetchInterval: CLAIM_INTERVAL_MS })

  const [state, setState] = useState<{ owner?: string; ids: string[] }>({ ids: [] })
  const followed = useMemo(() => (state.owner === owner ? state.ids : []), [state, owner])

  useEffect(() => {
    setState((prev) => {
      const ids = followedAfterClaim(prev.owner === owner ? prev.ids : [], deposits)
      return prev.owner === owner && ids === prev.ids ? prev : { owner, ids }
    })
  }, [deposits, owner])

  const statuses = useQueries({
    queries: followed.map((depositId) => ({
      queryKey: ['accounting-deposit-status', ...privateReadQueryScope, depositId],
      queryFn: () => executePrivateRead((readClient) => readClient.getDepositStatus(depositId)),
      enabled: !!owner,
      refetchInterval: STATUS_POLL_INTERVAL_MS,
      retry: (failureCount: number, error: Error) =>
        followedDepositOutcome(undefined, error) === undefined && failureCount < 2,
    })),
  })

  useEffect(() => {
    const outcomes = followed.map((_, i) =>
      followedDepositOutcome(statuses[i]?.data, statuses[i]?.error)
    )
    if (outcomes.every((outcome) => outcome === undefined)) return
    if (outcomes.includes('credited')) {
      queryClient.invalidateQueries({ queryKey: ['accounting-balance'] })
      queryClient.invalidateQueries({ queryKey: ['accounting-batch-balances'] })
      queryClient.invalidateQueries({ queryKey: ['accounting-history'] })
    }
    const settled = new Set(followed.filter((_, i) => outcomes[i] !== undefined))
    setState((prev) =>
      prev.owner === owner ? { owner, ids: prev.ids.filter((id) => !settled.has(id)) } : prev
    )
  }, [followed, owner, queryClient, statuses])

  return null
}
