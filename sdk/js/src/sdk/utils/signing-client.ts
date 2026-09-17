import { getConnectorClient, type Config } from '@wagmi/core'
import { walletActions, type WalletClient } from 'viem'

/**
 * Wallet client for signature-only flows, taken from the connector's ACTUAL
 * chain. `getWalletClient`/`useWalletClient` fail with
 * ConnectorChainMismatchError when the wallet sits on a chain outside the
 * wagmi config (e.g. Arbitrum after declining a connect-time switch), which
 * would dead-end every signature flow now that the Switch Network gates are
 * gone. The salted EIP-712 domain makes the signing chain irrelevant, so
 * whatever chain the connector reports is fine. Real transactions must NOT
 * use this — they pin/switch to their target chain instead.
 */
export async function getSigningClient(config: Config): Promise<WalletClient> {
  const client = await getConnectorClient(config)
  return client.extend(walletActions) as unknown as WalletClient
}
