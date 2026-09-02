import { useAccount, useBalance, useReadContract } from 'wagmi'
import { erc20Abi, formatUnits, zeroAddress } from 'viem'
import type { TokenConfig } from '@/sdk/types/tokens'
import type { Allowance } from '@/sdk/types/allowance'
import { isMoonPayProductOnRamp, type ProductOnRampSelection } from '@/sdk/on-ramp/product-config'
import { usePrivanaContext } from '@/sdk/context/privana-provider'
import { useMoonpayLimits } from '@/sdk/hooks/use-moonpay-limits'
import { cn, formatTokenAmount, parseTokenAmount } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { getTokenIcon } from './token-icons'
import { ChevronRightIcon } from './icons'
import { AllowancePolicySection } from './allowance-policy-section'
import type { DepositSource } from './deposit-modal'

export function DepositView({
  source,
  selectedToken,
  onRamp,
  amount,
  allowance,
  externalMinimum,
  onAmountChange,
  onSelectToken,
  onConnectWallet,
  onSubmit,
  isSubmitting = false,
}: {
  source: DepositSource
  selectedToken: TokenConfig | undefined
  onRamp: ProductOnRampSelection
  amount: string
  allowance?: Allowance
  /** `undefined` while loading, `null` when unavailable, otherwise base units. */
  externalMinimum?: bigint | null
  onAmountChange: (value: string) => void
  onSelectToken: () => void
  onConnectWallet?: () => void
  onSubmit: (args: { source: DepositSource; tokenId: string; amount: string }) => void
  isSubmitting?: boolean
}) {
  const { getChainById, chains, serviceName, serviceIcon, networkConfig, hostedAuthConfig } =
    usePrivanaContext()
  const { address, isConnected } = useAccount()
  const appName = serviceName ?? 'Privana'
  const chain = selectedToken ? getChainById(selectedToken.chainId) : undefined
  const targetChain = chain ?? chains[0]
  const sourceLabel = source === 'connected' ? 'Connected Wallet' : 'External Wallet'
  const isConnectedSource = source === 'connected'
  const isExternal = source === 'external'
  const isCreditCard = source === 'credit-card'
  const isMoonPayCard = isCreditCard && isMoonPayProductOnRamp(onRamp)
  const isTransakCard = isCreditCard && onRamp.provider === 'transak'
  const isNative = selectedToken?.contract === zeroAddress
  const { data: nativeBalanceData, isLoading: isNativeBalanceLoading } = useBalance({
    address,
    chainId: targetChain?.id,
    query: { enabled: isConnectedSource && !!address && !!selectedToken && isNative },
  })
  const { data: erc20Balance, isLoading: isErc20BalanceLoading } = useReadContract({
    address: selectedToken?.contract as `0x${string}` | undefined,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: targetChain?.id,
    query: { enabled: isConnectedSource && !!address && !!selectedToken && !isNative },
  })
  const walletBalance = isNative ? nativeBalanceData?.value : erc20Balance
  const isWalletBalanceLoading = isNative ? isNativeBalanceLoading : isErc20BalanceLoading
  const formattedWalletBalance =
    walletBalance != null && selectedToken
      ? formatTokenAmount(walletBalance.toString(), selectedToken.decimals)
      : '0.00'

  // MoonPay alone exposes this fiat-limit endpoint. Transak uses the
  // configured token and the backend-issued widget session instead.
  const {
    minBuyAmount: moonpayMinBuy,
    isLoading: moonpayLimitsLoading,
    error: moonpayLimitsError,
  } = useMoonpayLimits({
    currencyCode: selectedToken?.moonpayCurrencyCode,
    apiBaseUrl: networkConfig.moonpayApiUrl,
    enabled: isMoonPayCard,
  })

  const hasValidAmount = !!amount && parseFloat(amount) > 0
  // MoonPay keeps its existing two-decimal quote cap. Other sources, including
  // Transak, accept the configured token's precision.
  const maxAmountDecimals = isMoonPayCard ? 2 : selectedToken?.decimals
  const tooManyDecimals =
    hasValidAmount &&
    maxAmountDecimals != null &&
    amount.includes('.') &&
    amount.split('.')[1].length > maxAmountDecimals
  const exceedsBalance =
    isConnectedSource &&
    hasValidAmount &&
    !tooManyDecimals &&
    !!selectedToken &&
    walletBalance != null &&
    parseTokenAmount(amount, selectedToken.decimals) > walletBalance
  const belowMoonpayMin =
    isMoonPayCard && hasValidAmount && moonpayMinBuy != null && parseFloat(amount) < moonpayMinBuy
  const moonpayLimitsUnready = isMoonPayCard && !!onRamp.providerAssetCode && moonpayMinBuy == null
  const creditCardUnavailable = isCreditCard && !!onRamp.unavailableReason
  const externalTokenUnavailable = isExternal && !!selectedToken && isNative
  const externalMinimumRequired = isExternal && !!allowance && !!selectedToken
  const externalMinimumLoading = externalMinimumRequired && externalMinimum === undefined
  const externalMinimumUnavailable = externalMinimumRequired && externalMinimum === null
  const belowExternalMinimum =
    externalMinimumRequired &&
    hasValidAmount &&
    !tooManyDecimals &&
    !!selectedToken &&
    typeof externalMinimum === 'bigint' &&
    parseTokenAmount(amount, selectedToken.decimals) < externalMinimum
  // Signing the external-deposit policy needs a wallet even though the
  // transfer itself comes from elsewhere.
  const externalNeedsWallet = isExternal && (!!allowance || !hostedAuthConfig)
  const needsConnect = (isConnectedSource || externalNeedsWallet) && !isConnected

  const canDeposit =
    hasValidAmount &&
    !!selectedToken &&
    !tooManyDecimals &&
    !exceedsBalance &&
    !belowMoonpayMin &&
    !moonpayLimitsUnready &&
    !creditCardUnavailable &&
    !externalTokenUnavailable &&
    !externalMinimumLoading &&
    !externalMinimumUnavailable &&
    !belowExternalMinimum &&
    !needsConnect

  const handleMax = () => {
    if (selectedToken && walletBalance != null && walletBalance > 0n)
      onAmountChange(formatUnits(walletBalance, selectedToken.decimals))
  }

  return (
    <div className="bg-muted flex flex-col gap-6 rounded-[10px] p-5">
      {isCreditCard ? (
        <div className="flex flex-col gap-2">
          <h2 className="text-foreground text-[28px] leading-8 font-medium">
            Buy with card and deposit
          </h2>
          <p className="text-muted-foreground text-sm">
            {isTransakCard
              ? 'Enter your target deposit amount and continue.'
              : 'Enter your deposit amount and proceed to sign a policy.'}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <h2 className="text-foreground text-[28px] leading-8 font-medium">
            Deposit from {sourceLabel}
          </h2>
          {allowance && (
            <p className="text-muted-foreground text-sm">
              Enter your deposit amount and proceed to sign a policy.
            </p>
          )}
        </div>
      )}

      <div className="flex flex-col gap-3">
        <label className="text-muted-foreground text-sm">Token</label>
        <button
          type="button"
          onClick={onSelectToken}
          // Frozen while signing: the policy signature captures the values at
          // click time, so the form must not drift under the wallet prompt.
          disabled={isSubmitting || (isCreditCard && onRamp.tokenSelectionLocked)}
          className="border-border bg-input flex w-full cursor-pointer items-center gap-3 rounded-lg border p-3 text-left disabled:cursor-not-allowed disabled:opacity-50"
        >
          {selectedToken ? (
            <>
              <div className="h-8 w-8 shrink-0 overflow-hidden rounded-full">
                {getTokenIcon(selectedToken.symbol, 32)}
              </div>
              <div className="flex flex-1 flex-col items-start gap-1">
                <span className="text-foreground text-sm font-medium">{selectedToken.symbol}</span>
                <span className="text-muted-foreground text-xs">on {chain?.name ?? '—'}</span>
              </div>
            </>
          ) : (
            <span className="text-muted-foreground flex-1 text-sm">Select token</span>
          )}
          {(!isCreditCard || !onRamp.tokenSelectionLocked) && (
            <div className="text-muted-foreground flex h-5 w-5 items-center justify-center">
              <ChevronRightIcon />
            </div>
          )}
        </button>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <label className="text-muted-foreground text-sm">Amount</label>
          {isConnectedSource && (
            <span className="text-muted-foreground flex items-center gap-1 text-sm">
              Available{' '}
              {isWalletBalanceLoading ? (
                <Skeleton className="h-4 w-16" />
              ) : (
                `${formattedWalletBalance} ${selectedToken?.symbol ?? ''}`
              )}
            </span>
          )}
        </div>
        <div
          className={cn(
            'border-border bg-input flex items-center gap-2 rounded-[10px] border',
            isConnectedSource ? 'py-1 pr-1 pl-3' : 'px-3 py-3'
          )}
        >
          <input
            type="text"
            inputMode="decimal"
            placeholder="Enter Amount"
            disabled={isSubmitting}
            value={amount}
            onChange={(e) => {
              const value = e.target.value.replace(/[^0-9.,]/g, '').replace(/,/g, '.')
              if (value.split('.').length <= 2) onAmountChange(value)
            }}
            className="text-foreground placeholder:text-muted-foreground/50 flex-1 bg-transparent text-sm outline-none"
          />
          {isConnectedSource ? (
            <button
              type="button"
              onClick={handleMax}
              disabled={isWalletBalanceLoading}
              className="bg-secondary text-foreground hover:bg-secondary/80 cursor-pointer rounded px-3 py-2.5 text-xs font-semibold transition-colors disabled:cursor-default disabled:opacity-50"
            >
              MAX
            </button>
          ) : isCreditCard ? (
            <span className="text-muted-foreground text-sm">{selectedToken?.symbol ?? 'USD'}</span>
          ) : (
            selectedToken && (
              <span className="text-muted-foreground text-sm">{selectedToken.symbol}</span>
            )
          )}
        </div>
        {tooManyDecimals && (
          <p className="text-destructive text-sm">
            Too many decimal places (max: {maxAmountDecimals})
          </p>
        )}
        {exceedsBalance && <p className="text-destructive text-sm">Insufficient balance</p>}
        {belowMoonpayMin && moonpayMinBuy != null && (
          <p className="text-destructive text-sm">Minimum purchase is ${moonpayMinBuy} USD.</p>
        )}
        {belowExternalMinimum && selectedToken && typeof externalMinimum === 'bigint' && (
          <p className="text-destructive text-sm">
            Minimum deposit is {formatUnits(externalMinimum, selectedToken.decimals)}{' '}
            {selectedToken.symbol}.
          </p>
        )}
        {externalMinimumLoading && (
          <p className="text-muted-foreground text-sm">Checking minimum deposit…</p>
        )}
        {externalMinimumUnavailable && (
          <p className="text-destructive text-sm">
            Couldn’t load the minimum deposit. Please try again.
          </p>
        )}
        {isMoonPayCard && moonpayLimitsError && (
          <p className="text-destructive text-sm">
            Couldn’t load purchase limits. Please try again.
          </p>
        )}
        {isMoonPayCard && moonpayLimitsLoading && (
          <p className="text-muted-foreground text-sm">Checking purchase limits…</p>
        )}
        {creditCardUnavailable && (
          <p className="text-destructive text-sm">{onRamp.unavailableReason}</p>
        )}
        {externalTokenUnavailable && (
          <p className="text-destructive text-sm">
            {selectedToken?.symbol ?? 'This token'} can’t be used for external deposits. Choose an
            ERC20 token.
          </p>
        )}
      </div>

      {allowance && (
        <AllowancePolicySection
          allowance={allowance}
          serviceName={appName}
          serviceIcon={serviceIcon}
        />
      )}

      <button
        type="button"
        disabled={needsConnect ? !onConnectWallet : !canDeposit || isSubmitting}
        onClick={() => {
          if (needsConnect) {
            onConnectWallet?.()
            return
          }
          if (selectedToken) onSubmit({ source, tokenId: selectedToken.id, amount })
        }}
        className="bg-primary text-primary-foreground hover:bg-primary/90 flex h-10 w-full cursor-pointer items-center justify-center rounded-[10px] px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
      >
        {needsConnect
          ? 'Connect Wallet'
          : isTransakCard
            ? 'Continue'
            : allowance
              ? 'Sign Policy and Deposit'
              : 'Deposit'}
      </button>
    </div>
  )
}
