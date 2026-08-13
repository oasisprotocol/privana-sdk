import type { OnRampProviderEvent } from './provider'
import type { OnRampProviderAdapter } from './provider'

export const moonPayOnRampAdapter: OnRampProviderAdapter = {
  provider: 'moonpay',
  pollPendingWhileOpen: true,
  buildIntentRequest: ({ walletAddress, tokenId, chainId, providerAssetCode }) => ({
    wallet_address: walletAddress,
    token_id: tokenId,
    chain_id: chainId,
    moonpay_currency_code: providerAssetCode,
  }),
  registerTransaction: async ({ client, intentId, providerTransactionId, tokenId, chainId }) =>
    client.updateOnRamp(intentId, {
      token_id: tokenId,
      chain_id: chainId,
      moonpay_transaction_id:
        intentId === providerTransactionId ? undefined : providerTransactionId,
    }),
  recordDeposit: async ({ client, record, depositTxHash }) =>
    client.updateOnRamp(record.transaction_id, {
      deposit_tx_hash: depositTxHash,
    }),
}

interface MoonPayTransactionEvent {
  id: string
  externalTransactionId?: string | null
}

export function normalizeMoonPayProviderEvent(
  kind: OnRampProviderEvent['kind'],
  event: MoonPayTransactionEvent
): OnRampProviderEvent {
  return {
    provider: 'moonpay',
    kind,
    providerTransactionId: event.id,
    intentId: event.externalTransactionId || undefined,
  }
}
