'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { AccountingApiError } from '../client/errors'
import { usePrivanaContext } from '../context/privana-provider'
import { usePrivateReadRequest } from './use-private-read-request'
import type { DepositCheckResponse } from '../types'

export interface VerificationContext {
  /** On-chain transfer that funded the user's Privana deposit address. */
  hash: `0x${string}`
  /** Chain the transfer was mined on. */
  chainId: number
  /** Transferred amount in base units (matches the deposit's token decimals). */
  amount: bigint
}

export interface UseDepositVerificationOptions {
  /** Fired when the deposit is credited inside the Privana accounting module. */
  onCredited?: (txHash: string, response: DepositCheckResponse) => void
  /** Fired when polling exceeds `pollTimeout` (the deposit may still be processing). */
  onCheckTimeout?: (txHash: string) => void
  onError?: (error: Error) => void
  /**
   * Fired each time `checkDeposit` returns "Insufficient finality" and the hook
   * is about to sleep + retry. Non-terminal — does not stop the retry loop.
   * Use this to surface confirmation-progress messages (e.g. "4/32 confirmations")
   * to the user while phase 1 is still waiting on chain finality.
   */
  onCheckRetry?: (message: string) => void
  /** Polling interval in ms (default: 5000). */
  pollInterval?: number
  /** Retry interval in ms while the source-chain tx is waiting finality (default: pollInterval). */
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
 * Phase 1 (POST /deposits/check) + Phase 2 (poll /deposits/status) of the
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
  const { client } = usePrivanaContext()
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
  const onCheckTimeoutRef = useRef(options.onCheckTimeout)
  const onErrorRef = useRef(options.onError)
  const onCheckRetryRef = useRef(options.onCheckRetry)
  useEffect(() => {
    onCreditedRef.current = options.onCredited
    onCheckTimeoutRef.current = options.onCheckTimeout
    onErrorRef.current = options.onError
    onCheckRetryRef.current = options.onCheckRetry
  }, [options.onCredited, options.onCheckTimeout, options.onError, options.onCheckRetry])

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
      const { hash, chainId, amount } = ctx

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
        onCheckTimeoutRef.current?.(hash)
        queryClient.invalidateQueries({ queryKey: ['accounting-balance'] })
      }

      try {
        // Phase 1: trigger sweep. The backend rejects with "Insufficient finality"
        // when the source-chain tx isn't deep enough yet; retry on a slower
        // cadence instead of failing, until pollTimeout.
        let triggerResult: DepositCheckResponse | undefined
        while (!triggerResult) {
          if (isStale()) return
          try {
            const result = await executePrivateRead(() =>
              client.checkDeposit({
                chain_id: chainId,
                tx_hash: hash,
                amount: amount.toString(),
              })
            )
            if (result.status === 'error' && isInsufficientFinalityMessage(result.detail)) {
              if (result.detail) onCheckRetryRef.current?.(result.detail)
              if (Date.now() - pollStartTime > pollTimeout) {
                markVerificationTimedOut()
                return
              }
              await sleep(finalityRetryInterval)
              if (isStale()) return
              continue
            }
            triggerResult = result
          } catch (err) {
            if (isStale()) return
            if (!isInsufficientFinalityError(err)) {
              throw err
            }
            const message =
              err instanceof AccountingApiError && err.detail
                ? err.detail
                : err instanceof Error
                  ? err.message
                  : String(err)
            onCheckRetryRef.current?.(message)
            if (Date.now() - pollStartTime > pollTimeout) {
              markVerificationTimedOut()
              return
            }
            await sleep(finalityRetryInterval)
            if (isStale()) return
          }
        }
        if (isStale()) return

        if (triggerResult.status === 'credited') {
          setIsVerifying(false)
          verificationContextRef.current = null
          queryClient.invalidateQueries({ queryKey: ['accounting-balance'] })
          queryClient.invalidateQueries({ queryKey: ['accounting-history'] })
          onCreditedRef.current?.(hash, triggerResult)
          return
        }

        if (triggerResult.status === 'error') {
          markVerificationFailed(new Error(triggerResult.detail ?? 'Deposit verification failed'))
          return
        }

        const depositId = triggerResult.deposit_id
        if (!depositId) {
          markVerificationFailed(new Error('Deposit check did not return a deposit id'))
          return
        }

        // Phase 2: poll status
        let consecutiveFailures = 0

        const checkStatus = async (): Promise<boolean> => {
          if (isStale()) return true

          if (Date.now() - pollStartTime > pollTimeout) {
            markVerificationTimedOut()
            return true
          }

          try {
            const result = await executePrivateRead(() => client.getDepositStatus(depositId))
            if (isStale()) return true
            consecutiveFailures = 0

            if (result.status === 'credited') {
              stopPolling()
              setIsVerifying(false)
              verificationContextRef.current = null
              queryClient.invalidateQueries({ queryKey: ['accounting-balance'] })
              queryClient.invalidateQueries({ queryKey: ['accounting-history'] })
              onCreditedRef.current?.(hash, result)
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
    [
      client,
      executePrivateRead,
      finalityRetryInterval,
      pollInterval,
      pollTimeout,
      queryClient,
      stopPolling,
    ]
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isInsufficientFinalityError(error: unknown): boolean {
  if (error instanceof AccountingApiError) {
    return (
      isInsufficientFinalityMessage(error.detail) || isInsufficientFinalityMessage(error.message)
    )
  }
  return error instanceof Error && isInsufficientFinalityMessage(error.message)
}

function isInsufficientFinalityMessage(message: string | undefined): boolean {
  return message?.includes('Insufficient finality') ?? false
}
