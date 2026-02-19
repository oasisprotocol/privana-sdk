'use client'

import { useCallback } from 'react'
import { getChainId } from '@wagmi/core'
import { useChainId, useConfig, useSwitchChain } from 'wagmi'

export function useEnsureCorrectChain() {
  const config = useConfig()
  const chainId = useChainId()
  const { switchChainAsync } = useSwitchChain()

  const waitUntilOnChain = useCallback(
    async (expectedChainId: number, timeoutMs: number, pollIntervalMs = 250) => {
      const startedAt = Date.now()
      while (Date.now() - startedAt < timeoutMs) {
        const currentChainId = getChainId(config)
        if (currentChainId === expectedChainId) return true
        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs))
      }
      return false
    },
    [config]
  )

  const ensureCorrectChain = useCallback(
    async (targetChainId: number) => {
      const currentChainId = getChainId(config)
      if (currentChainId === targetChainId) return false

      let switchErrorMessage: string | undefined
      try {
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Chain switch timeout')), 3000)
        })
        await Promise.race([switchChainAsync({ chainId: targetChainId }), timeoutPromise])
      } catch (error) {
        if (error instanceof Error && error.message.includes('Unsupported Chain')) {
          console.warn("Got 'Unsupported Chain' error, chain may have switched anyway.")
        } else {
          switchErrorMessage = error instanceof Error ? error.message : 'Unknown chain switch error'
        }
      }

      const settled = await waitUntilOnChain(targetChainId, 20_000)
      if (settled) return true

      if (switchErrorMessage) {
        throw new Error(
          `Failed to switch to chain (Chain ID: ${targetChainId}): ${switchErrorMessage}`
        )
      }

      throw new Error(`Chain switch did not settle in time (expected ${targetChainId}).`)
    },
    [config, switchChainAsync, waitUntilOnChain]
  )

  const isOnChain = useCallback((targetChainId: number) => chainId === targetChainId, [chainId])

  return {
    chainId,
    ensureCorrectChain,
    isOnChain,
  }
}
