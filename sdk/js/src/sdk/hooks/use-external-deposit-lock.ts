'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAccount, useConfig } from 'wagmi'
import { getBlockNumber, getWalletClient } from '@wagmi/core'
import { zeroAddress } from 'viem'
import { usePrivanaContext } from '../context/privana-provider'
import type { Bytes32, TransactionSubmissionResponse } from '../types'
import type { Allowance } from '../types/allowance'
import { useEnsureCorrectChain } from './use-ensure-correct-chain'
import { usePrivateReadRequest } from './use-private-read-request'
import type { VerificationContext } from './use-deposit-verification'
import { canUseSharedBrowserStorage } from '../utils/browser-storage'
import {
  clampLockAmount,
  createSignedLockRequest,
  DEFAULT_LOCK_DURATION_SECONDS,
  requireDepositLockOwner,
  requireServiceAddress,
  PostDepositLockError,
} from '../utils/pending-lock'
import {
  clearExternalDepositVerification,
  clearExternalDepositLockSession,
  discardExternalDepositLockSession,
  ExternalDepositLockSessionChangedError,
  externalDepositRetryAmount,
  externalDepositSessionId,
  isCurrentExternalDepositVerification,
  isSameExternalDepositLockSession,
  loadExternalDepositLockSession,
  saveExternalDepositLockSession,
  subscribeExternalDepositLockSession,
  submitExternalDepositLock,
  type ExternalDepositLockSessionRecord,
} from '../utils/external-deposit-lock'

export interface UseExternalDepositLockOptions {
  allowance?: Allowance
  onLockSubmitted?: (response: TransactionSubmissionResponse) => void
  onLockFailed?: (error: PostDepositLockError) => void
}

export interface SignExternalDepositLockParams {
  tokenId: string
  amount: bigint
}

export interface UseExternalDepositLockResult {
  isSigning: boolean
  isSubmittingLock: boolean
  session: ExternalDepositLockSessionRecord | null
  signAndPersist: (params: SignExternalDepositLockParams) => Promise<void>
  recordVerification: (context: VerificationContext) => void
  settleAfterCredit: (txHash: string, creditedAmount: bigint) => Promise<void>
  retryAfterCredit: () => Promise<void>
  clearVerification: () => boolean
  discardSession: () => boolean
}

export function useExternalDepositLock({
  allowance,
  onLockSubmitted,
  onLockFailed,
}: UseExternalDepositLockOptions): UseExternalDepositLockResult {
  const { client, networkConfig, serviceAddress, getTokenById, tokensStatus } = usePrivanaContext()
  const config = useConfig()
  const queryClient = useQueryClient()
  const { address } = useAccount()
  const { privateReadAddress } = usePrivateReadRequest()
  const { ensureCorrectChain } = useEnsureCorrectChain()

  const [isSigning, setIsSigning] = useState(false)
  const [isSubmittingLock, setIsSubmittingLock] = useState(false)
  const [session, setSession] = useState<ExternalDepositLockSessionRecord | null>(null)

  const sessionRef = useRef<ExternalDepositLockSessionRecord | null>(null)
  const signingRef = useRef(false)
  const settlingRef = useRef(false)
  const pendingCreditedTransitionRef = useRef<{
    predecessor: ExternalDepositLockSessionRecord
    credited: ExternalDepositLockSessionRecord
  } | null>(null)
  const hydratedScopeRef = useRef<string | null>(null)
  const beneficiaryRef = useRef(privateReadAddress)
  beneficiaryRef.current = privateReadAddress

  const onLockSubmittedRef = useRef(onLockSubmitted)
  const onLockFailedRef = useRef(onLockFailed)
  useEffect(() => {
    onLockSubmittedRef.current = onLockSubmitted
    onLockFailedRef.current = onLockFailed
  }, [onLockSubmitted, onLockFailed])

  const installSession = useCallback((next: ExternalDepositLockSessionRecord | null) => {
    sessionRef.current = next
    setSession(next)
  }, [])

  const preserveCreditedFallback = useCallback(
    (durable: ExternalDepositLockSessionRecord | null) => {
      const pending = pendingCreditedTransitionRef.current
      if (pending && durable && isSameExternalDepositLockSession(durable, pending.predecessor)) {
        return pending.credited
      }
      pendingCreditedTransitionRef.current = null
      return durable
    },
    []
  )

  const notifyFailure = useCallback((error: PostDepositLockError) => {
    onLockFailedRef.current?.(error)
  }, [])

  const submitSession = useCallback(
    async (active: ExternalDepositLockSessionRecord) => {
      if (settlingRef.current) return
      settlingRef.current = true
      setIsSubmittingLock(true)
      let result: TransactionSubmissionResponse
      try {
        let submission = active
        const storedBeforeSubmit = loadExternalDepositLockSession(active.owner)
        if (storedBeforeSubmit?.generation === active.generation) {
          if (active.creditedAmount && !storedBeforeSubmit.creditedAmount) {
            // A previous storage write may have failed after credit. Retry that
            // exact transition before the submission reads durable state.
            const pending = pendingCreditedTransitionRef.current
            if (
              !pending ||
              !isSameExternalDepositLockSession(active, pending.credited) ||
              !isSameExternalDepositLockSession(storedBeforeSubmit, pending.predecessor)
            ) {
              throw new ExternalDepositLockSessionChangedError()
            }
            saveExternalDepositLockSession(pending.credited, pending.predecessor)
            pendingCreditedTransitionRef.current = null
            submission = pending.credited
          } else {
            submission = storedBeforeSubmit
          }
        }
        result = await submitExternalDepositLock(client, submission)
      } catch (err) {
        const stored = loadExternalDepositLockSession(active.owner)
        const error =
          err instanceof PostDepositLockError
            ? err
            : new PostDepositLockError(
                err instanceof Error ? err.message : 'Lock submission failed',
                'submission-failed',
                BigInt(active.maxLockAmount),
                active.creditedAmount ? BigInt(active.creditedAmount) : undefined,
                { cause: err }
              )
        if (err instanceof ExternalDepositLockSessionChangedError) {
          pendingCreditedTransitionRef.current = null
          installSession(stored ?? null)
          return
        }
        // Another tab may have completed or replaced this generation. Its
        // outcome is authoritative and must not surface as a local failure.
        if (!stored || stored.generation !== active.generation) {
          pendingCreditedTransitionRef.current = null
          installSession(stored ?? null)
          return
        }
        if (active.creditedAmount && !stored.creditedAmount) {
          const pending = pendingCreditedTransitionRef.current
          if (
            pending &&
            isSameExternalDepositLockSession(active, pending.credited) &&
            isSameExternalDepositLockSession(stored, pending.predecessor)
          ) {
            installSession(pending.credited)
            notifyFailure(error)
            return
          }
          pendingCreditedTransitionRef.current = null
          installSession(stored)
          return
        }
        installSession(active.creditedAmount && !stored.creditedAmount ? active : stored)
        notifyFailure(error)
        return
      } finally {
        settlingRef.current = false
        setIsSubmittingLock(false)
      }

      installSession(loadExternalDepositLockSession(active.owner) ?? null)
      queryClient.invalidateQueries({ queryKey: ['accounting-balance'] })
      queryClient.invalidateQueries({ queryKey: ['accounting-locked-funds'] })
      queryClient.invalidateQueries({ queryKey: ['accounting-total-locked-balance'] })
      queryClient.invalidateQueries({ queryKey: ['accounting-history'] })
      onLockSubmittedRef.current?.(result)
    },
    [client, installSession, notifyFailure, queryClient]
  )

  const validateRestoredSession = useCallback(
    (
      restored: ExternalDepositLockSessionRecord | undefined
    ): ExternalDepositLockSessionRecord | null => {
      if (!restored || !serviceAddress) return null
      const token = getTokenById(restored.tokenId)
      const invalid =
        restored.serviceAddress.toLowerCase() !== serviceAddress.toLowerCase() ||
        !token ||
        token.chainId !== restored.chainId ||
        token.contract === zeroAddress ||
        (!restored.creditedAmount && !restored.payload)
      if (!invalid) return restored

      clearExternalDepositLockSession(
        restored.owner,
        externalDepositSessionId(restored.chainId, restored.tokenId),
        restored.generation
      )
      return null
    },
    [getTokenById, serviceAddress]
  )

  useEffect(() => {
    if (!privateReadAddress || !serviceAddress || tokensStatus !== 'ready') {
      // Hide unavailable-account state without discarding a credited in-memory
      // fallback whose durable transition is waiting to be retried.
      setSession(null)
      return
    }
    const hydrationKey = `${privateReadAddress.toLowerCase()}:${serviceAddress.toLowerCase()}`
    const shouldResume = hydratedScopeRef.current !== hydrationKey
    hydratedScopeRef.current = hydrationKey

    const restored = preserveCreditedFallback(
      validateRestoredSession(loadExternalDepositLockSession(privateReadAddress))
    )
    installSession(restored)
    if (!restored) {
      return
    }
    if (!shouldResume) return
    if (restored.creditedAmount && restored.payload) {
      void submitSession(restored)
    } else if (restored.creditedAmount) {
      notifyFailure(
        new PostDepositLockError(
          'Deposit credited; sign a fresh policy to lock the funds',
          'not-found',
          BigInt(restored.maxLockAmount),
          BigInt(restored.creditedAmount)
        )
      )
    }
  }, [
    installSession,
    notifyFailure,
    privateReadAddress,
    preserveCreditedFallback,
    serviceAddress,
    submitSession,
    tokensStatus,
    validateRestoredSession,
  ])

  useEffect(() => {
    if (!privateReadAddress || !serviceAddress || tokensStatus !== 'ready') return
    const reconcile = (restored: ExternalDepositLockSessionRecord | undefined) => {
      installSession(preserveCreditedFallback(validateRestoredSession(restored)))
    }
    const unsubscribe = subscribeExternalDepositLockSession(privateReadAddress, reconcile)
    // Close the small gap between initial hydration and listener registration.
    reconcile(loadExternalDepositLockSession(privateReadAddress))
    return unsubscribe
  }, [
    installSession,
    preserveCreditedFallback,
    privateReadAddress,
    serviceAddress,
    tokensStatus,
    validateRestoredSession,
  ])

  const signAndPersist = useCallback(
    async ({ tokenId, amount }: SignExternalDepositLockParams) => {
      if (!allowance) throw new Error('No allowance configured for this deposit')
      if (signingRef.current || settlingRef.current) {
        throw new Error('A policy operation is already in progress')
      }
      if (!canUseSharedBrowserStorage()) {
        throw new Error('Browser storage is required for locked deposit recovery')
      }
      const owner = requireDepositLockOwner(address, privateReadAddress)
      if (sessionRef.current || loadExternalDepositLockSession(owner)) {
        throw new Error('Finish or cancel the active external deposit before starting another')
      }
      const token = getTokenById(tokenId)
      if (!token) throw new Error(`Unknown token ID: ${tokenId}`)
      if (token.contract === zeroAddress) {
        throw new Error('External deposits support ERC20 tokens only')
      }
      const targetService = requireServiceAddress(serviceAddress)
      const lockDuration = allowance.lockDuration ?? DEFAULT_LOCK_DURATION_SECONDS

      signingRef.current = true
      setIsSigning(true)
      try {
        await ensureCorrectChain(networkConfig.chainId)
        const signingWalletClient = await getWalletClient(config, {
          chainId: networkConfig.chainId,
        })
        const payload = await createSignedLockRequest({
          client,
          walletClient: signingWalletClient,
          userAddress: owner,
          networkConfig,
          serviceAddress: targetService,
          tokenId: token.id as Bytes32,
          amount: clampLockAmount(amount, BigInt(allowance.value)),
          lockDuration,
        })
        const startBlock = await getBlockNumber(config, { chainId: token.chainId })
        if (startBlock > BigInt(Number.MAX_SAFE_INTEGER)) {
          throw new Error('Source-chain block number exceeds the supported range')
        }
        if (beneficiaryRef.current?.toLowerCase() !== owner.toLowerCase()) {
          throw new Error('Authenticated deposit account changed while signing')
        }
        const next: ExternalDepositLockSessionRecord = {
          version: 1,
          owner,
          serviceAddress: targetService,
          chainId: token.chainId,
          tokenId: token.id as Bytes32,
          startBlock: Number(startBlock),
          depositAmount: amount.toString(),
          maxLockAmount: String(payload.amount),
          lockDuration,
          generation: payload.signature,
          payload,
        }
        saveExternalDepositLockSession(next, null)
        installSession(next)
      } finally {
        signingRef.current = false
        setIsSigning(false)
      }
    },
    [
      address,
      allowance,
      client,
      config,
      ensureCorrectChain,
      getTokenById,
      installSession,
      networkConfig,
      privateReadAddress,
      serviceAddress,
    ]
  )

  const settleAfterCredit = useCallback(
    async (txHash: string, creditedAmount: bigint) => {
      const active = sessionRef.current
      if (!active || settlingRef.current) return
      if (!isCurrentExternalDepositVerification(active, txHash)) {
        // Another tab may have advanced or replaced the candidate while this
        // verification was in flight. Its durable state is authoritative.
        return
      }
      if (creditedAmount <= 0n) throw new Error('Credited amount must be positive')
      const credited = {
        ...active,
        verification: undefined,
        creditedAmount: creditedAmount.toString(),
      }
      try {
        saveExternalDepositLockSession(credited, active)
        pendingCreditedTransitionRef.current = null
      } catch (err) {
        const stored = loadExternalDepositLockSession(active.owner)
        if (
          err instanceof ExternalDepositLockSessionChangedError ||
          !stored ||
          !isSameExternalDepositLockSession(stored, active)
        ) {
          pendingCreditedTransitionRef.current = null
          installSession(stored ?? null)
          return
        }
        pendingCreditedTransitionRef.current = { predecessor: active, credited }
        installSession(credited)
        notifyFailure(
          new PostDepositLockError(
            err instanceof Error ? err.message : 'Unable to persist credited deposit state',
            'submission-failed',
            BigInt(active.maxLockAmount),
            creditedAmount,
            { cause: err }
          )
        )
        return
      }
      installSession(credited)
      await submitSession(credited)
    },
    [installSession, notifyFailure, submitSession]
  )

  const recordVerification = useCallback(
    (context: VerificationContext) => {
      const active = sessionRef.current
      if (!active || active.creditedAmount) {
        throw new Error('No external deposit session is awaiting verification')
      }
      if (active.verification) {
        const sameTransfer =
          active.verification.hash.toLowerCase() === context.hash.toLowerCase() &&
          active.verification.chainId === context.chainId &&
          active.verification.amount === context.amount.toString() &&
          (active.verification.logIndex ?? 0) === (context.logIndex ?? 0)
        if (sameTransfer) return
        throw new Error('Another transfer is already being verified for this deposit session')
      }
      if (context.chainId !== active.chainId || context.amount <= 0n) {
        throw new Error('Discovered transfer does not match the signed deposit session')
      }
      const current = loadExternalDepositLockSession(active.owner)
      if (!current || current.generation !== active.generation) {
        throw new Error('The signed deposit session changed before verification')
      }
      const next: ExternalDepositLockSessionRecord = {
        ...active,
        verification: {
          hash: context.hash,
          chainId: context.chainId,
          amount: context.amount.toString(),
          logIndex: context.logIndex,
        },
      }
      saveExternalDepositLockSession(next, active)
      installSession(next)
    },
    [installSession]
  )

  const retryAfterCredit = useCallback(async () => {
    const active = sessionRef.current
    if (!active?.creditedAmount) throw new Error('No credited external deposit to recover')
    if (signingRef.current || settlingRef.current) {
      throw new Error('A policy operation is already in progress')
    }
    if (privateReadAddress?.toLowerCase() !== active.owner.toLowerCase()) {
      throw new Error('Authenticated deposit account does not match the credited deposit')
    }
    const token = getTokenById(active.tokenId)
    if (!token || token.chainId !== active.chainId || token.contract === zeroAddress) {
      throw new Error('The credited token is no longer available')
    }
    const targetService = requireServiceAddress(serviceAddress)
    if (targetService.toLowerCase() !== active.serviceAddress.toLowerCase()) {
      throw new Error('The service for this credited deposit has changed')
    }
    if (active.payload) {
      await submitSession(active)
      return
    }
    if (active.submissionAmbiguous) {
      throw new Error(
        'The previous lock submission may have succeeded; a fresh signature is unsafe'
      )
    }
    const owner = requireDepositLockOwner(address, privateReadAddress)
    const amount = externalDepositRetryAmount(active)

    let retrySession: ExternalDepositLockSessionRecord
    signingRef.current = true
    setIsSigning(true)
    try {
      await ensureCorrectChain(networkConfig.chainId)
      const signingWalletClient = await getWalletClient(config, {
        chainId: networkConfig.chainId,
      })
      const payload = await createSignedLockRequest({
        client,
        walletClient: signingWalletClient,
        userAddress: owner,
        networkConfig,
        serviceAddress: targetService,
        tokenId: active.tokenId,
        amount,
        lockDuration: active.lockDuration,
      })
      if (beneficiaryRef.current?.toLowerCase() !== owner.toLowerCase()) {
        throw new Error('Authenticated deposit account changed while signing')
      }
      retrySession = {
        ...active,
        depositAmount: amount.toString(),
        generation: payload.signature,
        verification: undefined,
        submissionAmbiguous: undefined,
        payload,
      }
      saveExternalDepositLockSession(retrySession, active)
      installSession(retrySession)
    } finally {
      signingRef.current = false
      setIsSigning(false)
    }
    await submitSession(retrySession)
  }, [
    address,
    client,
    config,
    ensureCorrectChain,
    getTokenById,
    installSession,
    networkConfig,
    privateReadAddress,
    serviceAddress,
    submitSession,
  ])

  const clearVerification = useCallback((): boolean => {
    const active = sessionRef.current
    if (!active?.verification || active.creditedAmount) return false
    const next = clearExternalDepositVerification(active)
    if (!next) {
      installSession(loadExternalDepositLockSession(active.owner) ?? null)
      return false
    }
    installSession(next)
    return true
  }, [installSession])

  const discardSession = useCallback((): boolean => {
    const active = sessionRef.current
    if (!active) return true
    if (signingRef.current || settlingRef.current) return false
    const pending = pendingCreditedTransitionRef.current
    const discardTarget =
      pending && isSameExternalDepositLockSession(active, pending.credited)
        ? pending.predecessor
        : active
    const discarded = discardExternalDepositLockSession(discardTarget)
    const restored = loadExternalDepositLockSession(active.owner) ?? null
    if (discarded) pendingCreditedTransitionRef.current = null
    installSession(restored)
    return discarded && !restored
  }, [installSession])

  return {
    isSigning,
    isSubmittingLock,
    session,
    signAndPersist,
    recordVerification,
    settleAfterCredit,
    retryAfterCredit,
    clearVerification,
    discardSession,
  }
}
