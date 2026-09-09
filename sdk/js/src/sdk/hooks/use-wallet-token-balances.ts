import { useQuery } from '@tanstack/react-query'
import { useAccount, useConfig } from 'wagmi'
import { getBalance, readContract } from '@wagmi/core'
import { erc20Abi, zeroAddress } from 'viem'
import type { TokenConfig } from '@/sdk/types/tokens'

export interface UseWalletTokenBalancesResult {
  balances: Record<string, string>
  isLoading: boolean
}

export function useWalletTokenBalances(tokens: TokenConfig[]): UseWalletTokenBalancesResult {
  const config = useConfig()
  const { address } = useAccount()

  const query = useQuery({
    queryKey: ['wallet-token-balances', address, tokens.map((t) => t.id).join(',')],
    queryFn: async () => {
      const results = await Promise.allSettled(
        tokens.map((token) =>
          token.contract === zeroAddress
            ? getBalance(config, { address: address!, chainId: token.chainId }).then(
                (balance) => balance.value
              )
            : readContract(config, {
                address: token.contract,
                abi: erc20Abi,
                functionName: 'balanceOf',
                args: [address!],
                chainId: token.chainId,
              })
        )
      )
      const map: Record<string, string> = {}
      results.forEach((result, i) => {
        if (result.status === 'fulfilled') {
          map[tokens[i].id.toLowerCase()] = (result.value as bigint).toString()
        }
      })
      return map
    },
    enabled: !!address && tokens.length > 0,
  })

  return { balances: query.data ?? {}, isLoading: query.isLoading }
}
