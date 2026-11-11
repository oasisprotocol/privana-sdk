'use client'

import { useMemo } from 'react'
import { useAccount, useConnectorClient } from 'wagmi'
import { walletActions, type WalletClient } from 'viem'

/** Hook form of `getSigningClient` — see `sdk/utils/signing-client.ts`. */
export function useSigningClient(): WalletClient | undefined {
  // useConnectorClient defaults to the wagmi chain, which never follows the
  // wallet onto a chain outside the config.
  const { chainId } = useAccount()
  const { data: connectorClient } = useConnectorClient({ chainId })
  return useMemo(
    () =>
      connectorClient
        ? (connectorClient.extend(walletActions) as unknown as WalletClient)
        : undefined,
    [connectorClient]
  )
}
