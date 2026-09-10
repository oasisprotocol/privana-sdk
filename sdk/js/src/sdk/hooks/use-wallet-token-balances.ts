import { useQueries, type UseQueryOptions } from '@tanstack/react-query'
import { useAccount, useConfig } from 'wagmi'
import { getBalanceQueryOptions, readContractQueryOptions } from '@wagmi/core/query'
import { erc20Abi, zeroAddress } from 'viem'
import type { TokenConfig } from '@/sdk/types/tokens'

interface UseWalletTokenBalancesOptions {
  enabled?: boolean
}

export interface UseWalletTokenBalancesResult {
  balances: Record<string, string>
  isLoading: boolean
}

/**
 * Queries are built from wagmi's own query-options factories, so they live
 * under wagmi's standard keys (['readContract', ...] / ['balance', ...]):
 * the deposit flow's post-deposit invalidations refresh these rows, the token
 * picker and the single-token amount view (useWalletTokenBalance) share cache
 * entries, and one unreachable chain RPC fails only its own rows.
 */
export function useWalletTokenBalances(
  tokens: TokenConfig[],
  options: UseWalletTokenBalancesOptions = {}
): UseWalletTokenBalancesResult {
  const config = useConfig()
  const { address } = useAccount()
  const enabled = (options.enabled ?? true) && !!address
  const queries = tokens.map((token) =>
    token.contract === zeroAddress
      ? {
          ...getBalanceQueryOptions(config, {
            address: address ?? zeroAddress,
            chainId: token.chainId,
          }),
          enabled,
        }
      : {
          ...readContractQueryOptions(config, {
            address: token.contract,
            abi: erc20Abi,
            functionName: 'balanceOf',
            args: [address ?? zeroAddress],
            chainId: token.chainId,
          }),
          enabled,
        }
  ) as unknown as UseQueryOptions<unknown>[]
  const results = useQueries({ queries })

  const balances: Record<string, string> = {}
  let isLoading = false
  results.forEach((result, i) => {
    const data = result.data as bigint | { value: bigint } | undefined
    const value = typeof data === 'bigint' ? data : data?.value
    if (value !== undefined) balances[tokens[i].id.toLowerCase()] = value.toString()
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
