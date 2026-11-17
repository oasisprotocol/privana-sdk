'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { AccountingApiError } from '../client/errors'
import { claimDepositWithRetry, findClaimedDeposit } from '../utils/deposit-claim'
import { usePrivateReadRequest } from './use-private-read-request'
import type { Bytes32, DepositCheckResponse } from '../types'

export interface VerificationContext {
  /** On-chain transfer that funded the user's Privana deposit address. */
  hash?: `0x${string}`
  depositId?: string
  tokenId?: Bytes32
  /** Transferred amount in base units (matches the deposit's token decimals). */
  amount: bigint
}

export interface UseDepositVerificationOptions {
  /** Fired when the deposit is credited inside the Privana accounting module. */
  onCredited?: (key: string, response: DepositCheckResponse, creditedAmount: bigint) => void
  /**
   * Fired when `checkDeposit` returns the deposit status polling follows. The
   * deposit can still credit after a polling timeout; the id is what
   * identifies it in history.
   */
  onCheckAccepted?: (key: string, depositId: string) => void
  /** Fired when polling exceeds `pollTimeout` (the deposit may still be processing). */
  onCheckTimeout?: (key: string) => void
  onError?: (error: Error) => void
  /**
   * Fired each time the claim finds nothing for the token yet and the hook is
   * about to sleep + retry. Non-terminal — does not stop the retry loop.
   */
  onCheckRetry?: (message: string) => void
  /** Polling interval in ms (default: 5000). */
  pollInterval?: number
  /** Retry interval in ms while the claim finds nothing yet (default: pollInterval). */
  finalityRetryInterval?: number
  /** Max time to wait for credit confirmation in ms (default: 180000). */
  pollTimeout?: number
}

export interface UseDepositVerificationResult {
  /** True while phase 1 (checkDeposit) or phase 2 (status polling) is in flight. */
  isVerifying: boolean
  /** True if polling timed out before a terminal status. */
  didTimeout: boolean
  /**
   * True when the on-chain transfer exists but the API verification step failed.
   * Funds are still at the deposit address; call `retryVerification()` to re-run
   * without re-sending the transfer.
   */
  verificationFailed: boolean
  error: Error | null
  /** Current transfer hash being verified, if any. */
  txHash: `0x${string}` | undefined
  /** Kick off Phase 1 (checkDeposit) + Phase 2 (poll getDepositStatus) for the given context. */
  verify: (ctx: VerificationContext) => Promise<void>
  /** Re-run verification against the existing context (after a transient API failure). */
  retryVerification: () => Promise<void>
  /** Discard local tracking (the deposit may still be credited in the background). */
  reset: () => void
}

/**
 * Phase 1 (POST /deposits/check, claiming the token) + Phase 2 (poll /deposits/status) of the
 * Privana deposit flow, decoupled from the wallet-signing half. Use this
 * directly when the on-chain transfer to the deposit address came from
 * somewhere other than the connected wallet — e.g. a fiat on-ramp that
 * delivers straight to the deposit address.
 *
 * For the full deposit flow (get address → wallet transfer → verify) use
 * `useDeposit`, which composes this hook internally.
 */
export function useDepositVerification(
  options: UseDepositVerificationOptions = {}
): UseDepositVerificationResult {
  const queryClient = useQueryClient()
  const { executePrivateRead } = usePrivateReadRequest()

  const pollInterval = options.pollInterval ?? 5000
  const finalityRetryInterval = options.finalityRetryInterval ?? pollInterval
  const pollTimeout = options.pollTimeout ?? 180000

  const [isVerifying, setIsVerifying] = useState(false)
  const [didTimeout, setDidTimeout] = useState(false)
  const [verificationFailed, setVerificationFailed] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>()

  const generationRef = useRef(0)
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const verificationContextRef = useRef<VerificationContext | null>(null)

  // Stable refs so callers can pass inline callbacks without re-triggering
  // the verify callback's useCallback identity.
  const onCreditedRef = useRef(options.onCredited)
  const onCheckAcceptedRef = useRef(options.onCheckAccepted)
  const onCheckTimeoutRef = useRef(options.onCheckTimeout)
  const onErrorRef = useRef(options.onError)
  const onCheckRetryRef = useRef(options.onCheckRetry)
  useEffect(() => {
    onCreditedRef.current = options.onCredited
    onCheckAcceptedRef.current = options.onCheckAccepted
    onCheckTimeoutRef.current = options.onCheckTimeout
    onErrorRef.current = options.onError
    onCheckRetryRef.current = options.onCheckRetry
  }, [
    options.onCredited,
    options.onCheckAccepted,
    options.onCheckTimeout,
    options.onError,
    options.onCheckRetry,
  ])

  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearTimeout(pollIntervalRef.current)
      pollIntervalRef.current = null
    }
  }, [])

  const invalidateGeneration = useCallback(() => {
    generationRef.current++
  }, [])

  useEffect(() => {
    return () => {
      invalidateGeneration()
      stopPolling()
    }
  }, [invalidateGeneration, stopPolling])

  const runVerification = useCallback(
    async (ctx: VerificationContext, generation: number): Promise<void> => {
      const isStale = () => generation !== generationRef.current
      const { hash, depositId: claimedId, tokenId, amount } = ctx
      const key = hash ?? claimedId
      if (!key) throw new Error('Nothing to verify: pass a transfer hash or a deposit id')

      setVerificationFailed(false)
      setError(null)
      setDidTimeout(false)
      setIsVerifying(true)

      const pollStartTime = Date.now()

      const markVerificationFailed = (err: Error) => {
        setIsVerifying(false)
        setError(err)
        setVerificationFailed(true)
        onErrorRef.current?.(err)
      }

      const markVerificationTimedOut = () => {
        stopPolling()
        setIsVerifying(false)
        setDidTimeout(true)
        onCheckTimeoutRef.current?.(key)
        queryClient.invalidateQueries({ queryKey: ['accounting-balance'] })
      }

      try {
        // Phase 1: claim the token, which starts a sweep of the deposit address.
        // Until the transfer shows up there the claim comes back empty; retry
        // on a slower cadence instead of failing, until pollTimeout.
        let triggerResult: DepositCheckResponse = { status: 'pending', deposit_id: claimedId }
        if (!claimedId) {
          const claim = await claimDepositWithRetry({
            claim: () =>
              executePrivateRead((readClient) => readClient.checkDeposit({ token_id: tokenId })),
            tokenId,
            isStale,
            onRetry: (message) => onCheckRetryRef.current?.(message),
            timeoutMs: pollTimeout,
            retryIntervalMs: finalityRetryInterval,
            startedAt: pollStartTime,
          })
          if (claim.kind === 'stale') return
          if (claim.kind === 'timeout') {
            markVerificationTimedOut()
            return
          }
          triggerResult = claim.deposit
        }
        if (isStale()) return

        if (triggerResult.status === 'credited') {
          const creditedAmount = creditedAmountFromResponse(triggerResult, amount)
          setIsVerifying(false)
          verificationContextRef.current = null
          queryClient.invalidateQueries({ queryKey: ['accounting-balance'] })
          queryClient.invalidateQueries({ queryKey: ['accounting-history'] })
          onCreditedRef.current?.(key, triggerResult, creditedAmount)
          return
        }

        if (triggerResult.status === 'error') {
          markVerificationFailed(new Error(triggerResult.detail ?? 'Deposit verification failed'))
          return
        }

        const firstId = triggerResult.deposit_id
        if (!firstId) {
          markVerificationFailed(new Error('Deposit check did not return a deposit id'))
          return
        }
        let depositId = firstId
        onCheckAcceptedRef.current?.(key, depositId)

        // Phase 2: poll status
        let consecutiveFailures = 0
        let followedAmount = amount
        let creditedTotal = 0n

        const claimNext = async () => {
          const deposits = await executePrivateRead((readClient) =>
            readClient.checkDeposit({ token_id: tokenId })
          )
          return findClaimedDeposit(deposits, tokenId)
        }
        const follow = (next: DepositCheckResponse, nextAmount: bigint) => {
          if (!next.deposit_id) return false
          depositId = next.deposit_id
          followedAmount = nextAmount
          onCheckAcceptedRef.current?.(key, depositId)
          return true
        }

        const checkStatus = async (): Promise<boolean> => {
          if (isStale()) return true

          if (Date.now() - pollStartTime > pollTimeout) {
            markVerificationTimedOut()
            return true
          }

          try {
            let result: DepositCheckResponse
            try {
              result = await executePrivateRead((readClient) =>
                readClient.getDepositStatus(depositId)
              )
            } catch (err) {
              if (claimedId || !(err instanceof AccountingApiError && err.statusCode === 404)) {
                throw err
              }
              // The sweep was dropped and its funds are still at the address: claim them again.
              const next = await claimNext()
              if (isStale()) return true
              consecutiveFailures = 0
              if (next) follow(next, next.amount ? BigInt(next.amount) : followedAmount)
              return false
            }
            if (isStale()) return true
            consecutiveFailures = 0

            if (result.status === 'credited') {
              let creditedAmount: bigint
              try {
                creditedAmount = creditedAmountFromResponse(result, followedAmount)
              } catch (err) {
                stopPolling()
                markVerificationFailed(
                  err instanceof Error ? err : new Error('Deposit credited amount is invalid')
                )
                return true
              }
              creditedTotal += creditedAmount
              if (!claimedId) {
                // A sweep already running when we claimed may not include this transfer.
                const next = await claimNext().catch(() => undefined)
                if (isStale()) return true
                if (next && follow(next, next.amount ? BigInt(next.amount) : 0n)) return false
              }
              stopPolling()
              setIsVerifying(false)
              verificationContextRef.current = null
              queryClient.invalidateQueries({ queryKey: ['accounting-balance'] })
              queryClient.invalidateQueries({ queryKey: ['accounting-history'] })
              onCreditedRef.current?.(key, result, creditedTotal)
              return true
            }

            if (result.status === 'error') {
              stopPolling()
              markVerificationFailed(new Error(result.detail ?? 'Deposit verification failed'))
              return true
            }
          } catch (err) {
            if (isStale()) return true
            consecutiveFailures++
            console.warn('Error polling deposit status:', err)
            if (consecutiveFailures >= 3) {
              stopPolling()
              markVerificationFailed(
                err instanceof Error ? err : new Error('Deposit status polling failed')
              )
              return true
            }
          }
          return false
        }

        const pollLoop = async () => {
          const done = await checkStatus()
          if (!done && !isStale() && pollIntervalRef.current !== null) {
            pollIntervalRef.current = setTimeout(pollLoop, pollInterval)
          }
        }
        pollIntervalRef.current = setTimeout(pollLoop, pollInterval)
      } catch (err) {
        if (isStale()) return
        stopPolling()
        markVerificationFailed(
          err instanceof Error ? err : new Error('Deposit verification failed')
        )
      }
    },
    [executePrivateRead, finalityRetryInterval, pollInterval, pollTimeout, queryClient, stopPolling]
  )

  const verify = useCallback(
    async (ctx: VerificationContext): Promise<void> => {
      generationRef.current++
      stopPolling()
      verificationContextRef.current = ctx
      setTxHash(ctx.hash)
      const generation = generationRef.current
      await runVerification(ctx, generation)
    },
    [runVerification, stopPolling]
  )

  const retryVerification = useCallback(async (): Promise<void> => {
    const ctx = verificationContextRef.current
    if (!ctx) {
      throw new Error('No pending verification to retry')
    }
    generationRef.current++
    stopPolling()
    const generation = generationRef.current
    await runVerification(ctx, generation)
  }, [runVerification, stopPolling])

  const reset = useCallback(() => {
    generationRef.current++
    stopPolling()
    verificationContextRef.current = null
    setTxHash(undefined)
    setIsVerifying(false)
    setDidTimeout(false)
    setVerificationFailed(false)
    setError(null)
  }, [stopPolling])

  return {
    isVerifying,
    didTimeout,
    verificationFailed,
    error,
    txHash,
    verify,
    retryVerification,
    reset,
  }
}

function creditedAmountFromResponse(
  response: DepositCheckResponse,
  requestedAmount: bigint
): bigint {
  if (response.amount == null) return requestedAmount
  try {
    const amount = BigInt(response.amount)
    if (amount <= 0n) throw new Error('non-positive amount')
    return amount
  } catch (err) {
    throw new Error('Deposit API returned an invalid credited amount', { cause: err })
  }
}
