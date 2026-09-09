import { useQueries } from '@tanstack/react-query'
import { useAccount, useConfig, type Config } from 'wagmi'
import { getBalance, readContract } from '@wagmi/core'
import { erc20Abi, zeroAddress, type Address } from 'viem'
import type { TokenConfig } from '@/sdk/types/tokens'

interface UseWalletTokenBalancesOptions {
  enabled?: boolean
}

export interface UseWalletTokenBalancesResult {
  balances: Record<string, string>
  isLoading: boolean
}

async function fetchWalletBalance(
  config: Config,
  address: Address,
  token: TokenConfig
): Promise<bigint> {
  if (token.contract === zeroAddress) {
    return (await getBalance(config, { address, chainId: token.chainId })).value
  }
  return readContract(config, {
    address: token.contract,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [address],
    chainId: token.chainId,
  })
}

export function useWalletTokenBalances(
  tokens: TokenConfig[],
  options: UseWalletTokenBalancesOptions = {}
): UseWalletTokenBalancesResult {
  const config = useConfig()
  const { address } = useAccount()
  const enabled = options.enabled ?? true

  const results = useQueries({
    queries: tokens.map((token) => ({
      queryKey: [
        'wallet-token-balance',
        address ?? null,
        token.chainId,
        token.id.toLowerCase(),
      ] as const,
      queryFn: () => fetchWalletBalance(config, address!, token),
      enabled: enabled && !!address,
    })),
  })

  const balances: Record<string, string> = {}
  let isLoading = false
  results.forEach((result, i) => {
    if (result.data !== undefined) balances[tokens[i].id.toLowerCase()] = result.data.toString()
    if (result.isLoading) isLoading = true
  })
  return { balances, isLoading }
}

export interface UseWalletTokenBalanceResult {
  balanceWei: bigint | undefined
  isLoading: boolean
}

export function useWalletTokenBalance(
  token: TokenConfig | undefined,
  options: UseWalletTokenBalancesOptions = {}
): UseWalletTokenBalanceResult {
  const tokens = token ? [token] : []
  const { balances, isLoading } = useWalletTokenBalances(tokens, options)
  const balance = token ? balances[token.id.toLowerCase()] : undefined
  return { balanceWei: balance !== undefined ? BigInt(balance) : undefined, isLoading }
}
