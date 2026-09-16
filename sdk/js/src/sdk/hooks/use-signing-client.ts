'use client'

import { useMemo } from 'react'
import { useConnectorClient } from 'wagmi'
import { walletActions, type WalletClient } from 'viem'

/** Hook form of `getSigningClient` — see `sdk/utils/signing-client.ts`. */
export function useSigningClient(): WalletClient | undefined {
  const { data: connectorClient } = useConnectorClient()
  return useMemo(
    () =>
      connectorClient
        ? (connectorClient.extend(walletActions) as unknown as WalletClient)
        : undefined,
    [connectorClient]
  )
}
