import { describe, expect, it } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { zeroAddress } from 'viem'
import {
  createProductOnRampFlowSnapshot,
  createProductOnRampOutcomeCallbacks,
  getTransakMinimumTargetBaseUnits,
  isMoonPayProductOnRamp,
  matchesFrozenOnRampToken,
  matchesProductOnRampScope,
  resolveProductOnRamp,
} from '../src/sdk/on-ramp/product-config'
import {
  assertTransakCheckoutPreconditions,
  TransakCardWidgetView,
} from '../src/components/privana/transak-card-widget-view'
import type {
  UseTransakOnRampOptions,
  UseTransakOnRampResult,
} from '../src/sdk/hooks/use-transak-on-ramp'
import { PostDepositLockError } from '../src/sdk/utils/pending-lock'
import type { OnRampConfig } from '../src/sdk/types'
import type { TokenConfig } from '../src/sdk/types/tokens'

const TOKEN_ID = `0x${'11'.repeat(32)}` as const
const OTHER_TOKEN_ID = `0x${'22'.repeat(32)}` as const
const MOONPAY_KEY = 'pk_test_example'
const LOCK_SERVICE_ADDRESS = '0x8888888888888888888888888888888888888888' as const
const SCOPE = {
  apiUrl: 'https://api.testnet.privana.finance',
  accountingChainId: 23295,
  accountingContract: '0x3333333333333333333333333333333333333333' as const,
  beneficiaryAddress: '0x4444444444444444444444444444444444444444' as const,
}

const token: TokenConfig = {
  id: TOKEN_ID,
  symbol: 'TRNSK',
  decimals: 18,
  contract: '0x1111111111111111111111111111111111111111',
  name: 'Transak Test Token',
  chainId: 84532,
  moonpayCurrencyCode: 'usdc',
}

function resolve(config: OnRampConfig | undefined, enabledTokens = [token]) {
  return resolveProductOnRamp({
    config,
    enabledTokens,
    legacyToken: token,
    moonpayApiKey: MOONPAY_KEY,
  })
}

describe('product card on-ramp configuration', () => {
  it('preserves the legacy MoonPay token flow when onRamp is absent', () => {
    expect(resolve(undefined)).toEqual({
      provider: 'moonpay',
      token,
      providerAssetCode: 'usdc',
      tokenSelectionLocked: false,
      unavailableReason: null,
    })
  })

  it('keeps legacy MoonPay fail-closed without an API key or token mapping', () => {
    expect(
      resolveProductOnRamp({
        config: undefined,
        enabledTokens: [token],
        legacyToken: token,
        moonpayApiKey: undefined,
      }).unavailableReason
    ).toBe('MoonPay is not configured.')

    expect(
      resolveProductOnRamp({
        config: undefined,
        enabledTokens: [{ ...token, moonpayCurrencyCode: undefined }],
        legacyToken: { ...token, moonpayCurrencyCode: undefined },
        moonpayApiKey: MOONPAY_KEY,
      }).unavailableReason
    ).toContain('isn’t available')
  })

  it('selects Transak explicitly, normalizes its asset code, and locks the token', () => {
    expect(
      resolve({
        provider: 'transak',
        tokenId: TOKEN_ID,
        providerAssetCode: ' USDC ',
      })
    ).toEqual({
      provider: 'transak',
      token,
      providerAssetCode: 'usdc',
      tokenSelectionLocked: true,
      unavailableReason: null,
    })
  })

  it('accepts an explicit MoonPay mapping only when provider, token, and asset agree', () => {
    expect(
      resolve({ provider: 'moonpay', tokenId: TOKEN_ID, providerAssetCode: 'USDC' })
        .unavailableReason
    ).toBeNull()
    expect(
      resolve({ provider: 'moonpay', tokenId: TOKEN_ID, providerAssetCode: 'usdc_base' })
        .unavailableReason
    ).toContain('does not match')
  })

  it('fails closed when the configured token is absent or disabled', () => {
    const selection = resolve(
      { provider: 'transak', tokenId: OTHER_TOKEN_ID, providerAssetCode: 'usdc' },
      [token]
    )

    expect(selection.token).toBeUndefined()
    expect(selection.tokenSelectionLocked).toBe(true)
    expect(selection.unavailableReason).toContain('not enabled')
  })

  it('fails closed for native tokens', () => {
    const nativeToken = { ...token, contract: zeroAddress }
    const selection = resolveProductOnRamp({
      config: { provider: 'transak', tokenId: TOKEN_ID, providerAssetCode: 'usdc' },
      enabledTokens: [nativeToken],
      legacyToken: nativeToken,
      moonpayApiKey: MOONPAY_KEY,
    })

    expect(selection.unavailableReason).toContain('ERC20')
  })

  it('fails closed for malformed provider, token, and asset values at runtime', () => {
    const malformed = [
      { provider: 'other', tokenId: TOKEN_ID, providerAssetCode: 'usdc' },
      { provider: 'transak', tokenId: '0x1234', providerAssetCode: 'usdc' },
      { provider: 'transak', tokenId: TOKEN_ID, providerAssetCode: '' },
      { provider: 'transak', tokenId: TOKEN_ID, providerAssetCode: 'usdc?network=evil' },
      null,
    ]

    for (const config of malformed) {
      const selection = resolve(config as unknown as OnRampConfig)
      expect(selection.provider).toBeNull()
      expect(selection.unavailableReason).toContain('invalid')
    }
  })

  it('freezes amount, lock policy, service address, and deployment scope', () => {
    const allowance = {
      value: '100000000000000000000',
      lockDuration: 3600,
      terms: { permissions: [{ title: 'Play', description: 'Use locked funds' }] },
    }
    const selection = resolve({
      provider: 'transak',
      tokenId: TOKEN_ID,
      providerAssetCode: 'USDC',
    })
    const snapshot = createProductOnRampFlowSnapshot({
      id: 1,
      selection,
      amount: '100.08',
      allowance,
      lockServiceAddress: LOCK_SERVICE_ADDRESS,
      moonpayApiKey: MOONPAY_KEY,
      scope: SCOPE,
    })
    expect(() =>
      createProductOnRampFlowSnapshot({
        id: 2,
        selection,
        amount: '100.08',
        allowance,
        lockServiceAddress: undefined,
        moonpayApiKey: MOONPAY_KEY,
        scope: SCOPE,
      })
    ).toThrow('lock service address')

    allowance.value = '1'
    allowance.terms.permissions[0].title = 'Changed'
    expect(snapshot.amountBaseUnits).toBe(100080000000000000000n)
    expect(snapshot.allowance?.value).toBe('100000000000000000000')
    expect(snapshot.allowance?.terms?.permissions?.[0].title).toBe('Play')
    expect(snapshot.requiresLock).toBe(true)
    expect(snapshot.lockServiceAddress).toBe(LOCK_SERVICE_ADDRESS)
    expect(snapshot.scope).toEqual(SCOPE)
    expect(snapshot.selection.providerAssetCode).toBe('usdc')
  })

  it('freezes a MoonPay key only for MoonPay flows', () => {
    const moonpaySelection = resolve({
      provider: 'moonpay',
      tokenId: TOKEN_ID,
      providerAssetCode: 'usdc',
    })
    const moonpaySnapshot = createProductOnRampFlowSnapshot({
      id: 1,
      selection: moonpaySelection,
      amount: '10',
      allowance: undefined,
      lockServiceAddress: undefined,
      moonpayApiKey: MOONPAY_KEY,
      scope: SCOPE,
    })
    expect(moonpaySnapshot.moonpayApiKey).toBe(MOONPAY_KEY)
    expect(isMoonPayProductOnRamp(moonpaySelection)).toBe(true)

    const transakSelection = resolve({
      provider: 'transak',
      tokenId: TOKEN_ID,
      providerAssetCode: 'usdc',
    })
    const transakSnapshot = createProductOnRampFlowSnapshot({
      id: 2,
      selection: transakSelection,
      amount: '10',
      allowance: undefined,
      lockServiceAddress: undefined,
      moonpayApiKey: MOONPAY_KEY,
      scope: SCOPE,
    })
    expect(transakSnapshot.moonpayApiKey).toBeUndefined()
    expect(isMoonPayProductOnRamp(transakSelection)).toBe(false)
  })

  it('matches only the deployment and beneficiary that created the flow', () => {
    const selection = resolve({
      provider: 'transak',
      tokenId: TOKEN_ID,
      providerAssetCode: 'usdc',
    })
    const snapshot = createProductOnRampFlowSnapshot({
      id: 3,
      selection,
      amount: '10',
      allowance: undefined,
      lockServiceAddress: undefined,
      moonpayApiKey: MOONPAY_KEY,
      scope: SCOPE,
    })

    expect(matchesProductOnRampScope(snapshot.scope, SCOPE)).toBe(true)
    expect(
      matchesProductOnRampScope(snapshot.scope, {
        ...SCOPE,
        accountingContract: SCOPE.accountingContract.toUpperCase() as `0x${string}`,
        beneficiaryAddress: SCOPE.beneficiaryAddress.toUpperCase() as `0x${string}`,
      })
    ).toBe(true)

    for (const currentScope of [
      { ...SCOPE, apiUrl: 'https://api.other.example' },
      { ...SCOPE, accountingChainId: 23294 },
      {
        ...SCOPE,
        accountingContract: '0x5555555555555555555555555555555555555555' as const,
      },
      {
        ...SCOPE,
        beneficiaryAddress: '0x6666666666666666666666666666666666666666' as const,
      },
      { ...SCOPE, beneficiaryAddress: null },
    ]) {
      expect(matchesProductOnRampScope(snapshot.scope, currentScope)).toBe(false)
    }
  })

  it('requires an authenticated beneficiary before creating a product snapshot', () => {
    expect(() =>
      createProductOnRampFlowSnapshot({
        id: 4,
        selection: resolve({
          provider: 'transak',
          tokenId: TOKEN_ID,
          providerAssetCode: 'usdc',
        }),
        amount: '10',
        allowance: undefined,
        lockServiceAddress: undefined,
        moonpayApiKey: MOONPAY_KEY,
        scope: { ...SCOPE, beneficiaryAddress: null },
      })
    ).toThrow('Sign in or connect')
  })

  it('does not create a Transak intent or session while rendering the product leaf', () => {
    let hookRenders = 0
    let launchCalls = 0
    let recreateCalls = 0
    const result: UseTransakOnRampResult = {
      status: 'idle',
      activeIntentId: null,
      pending: [],
      activeVerificationId: null,
      error: null,
      finalityProgress: {},
      depositAddress: '0x1111111111111111111111111111111111111111',
      minDepositBaseUnits: 1n,
      selectedToken: token,
      isLaunching: false,
      isWidgetOpen: false,
      canRecreateSession: false,
      widget: null,
      launch: async () => {
        launchCalls++
      },
      recreateSession: async () => {
        recreateCalls++
      },
      closeWidget: async () => undefined,
      finishPendingVerification: async () => undefined,
      refreshPending: async () => undefined,
    }
    const useOnRamp = () => {
      hookRenders++
      return result
    }

    const markup = renderToStaticMarkup(
      createElement(TransakCardWidgetView, {
        token,
        providerAssetCode: 'usdc',
        amount: '100.08',
        useOnRamp,
      })
    )
    expect(markup).toContain('Open card checkout')
    const policyMarkup = renderToStaticMarkup(
      createElement(TransakCardWidgetView, {
        token,
        providerAssetCode: 'usdc',
        amount: '100.08',
        allowance: { value: '100000000000000000000', lockDuration: 3600 },
        useOnRamp,
      })
    )
    expect(policyMarkup).toContain('Sign policy and open checkout')
    expect(hookRenders).toBe(2)
    expect(launchCalls).toBe(0)
    expect(recreateCalls).toBe(0)
  })

  it('refuses the checkout action when launch preconditions fail, even imperatively', () => {
    // Fresh launch with failed gates (unknown minimum, token drift, etc.).
    expect(() =>
      assertTransakCheckoutPreconditions({
        activeIntentId: null,
        canOpen: false,
        canRecreateSession: false,
      })
    ).toThrow('Card checkout is unavailable')

    // Session recreation must obey the same gates: recreatable intent, gates failed.
    expect(() =>
      assertTransakCheckoutPreconditions({
        activeIntentId: 'intent-1',
        canOpen: false,
        canRecreateSession: true,
      })
    ).toThrow('Card checkout is unavailable')

    // Non-recreatable intent keeps its specific recovery guidance.
    expect(() =>
      assertTransakCheckoutPreconditions({
        activeIntentId: 'intent-1',
        canOpen: false,
        canRecreateSession: false,
      })
    ).toThrow('Continue signed-intent recovery')

    // Recreation still works when every gate passes.
    expect(() =>
      assertTransakCheckoutPreconditions({
        activeIntentId: 'intent-1',
        canOpen: true,
        canRecreateSession: true,
      })
    ).not.toThrow()
  })

  it('adds a rounded-up 5% safety margin to the Transak deposit minimum', () => {
    expect(getTransakMinimumTargetBaseUnits(100n)).toBe(105n)
    expect(getTransakMinimumTargetBaseUnits(101n)).toBe(107n)
    expect(getTransakMinimumTargetBaseUnits(1n)).toBe(2n)
  })

  it('treats the frozen snapshot token as the launch authority', () => {
    expect(matchesFrozenOnRampToken(token, token)).toBe(true)
    expect(matchesFrozenOnRampToken(token, { ...token, id: TOKEN_ID.toUpperCase() as never })).toBe(
      true
    )
    expect(
      matchesFrozenOnRampToken(token, { ...token, symbol: 'DISPLAY', name: 'Display only' })
    ).toBe(true)
    expect(matchesFrozenOnRampToken(token, undefined)).toBe(false)
    for (const live of [
      { ...token, id: OTHER_TOKEN_ID },
      { ...token, contract: '0x9999999999999999999999999999999999999999' as const },
      { ...token, chainId: 11155111 },
      { ...token, decimals: 6 },
    ]) {
      expect(matchesFrozenOnRampToken(token, live)).toBe(false)
    }
  })

  it('fails closed when the deposit minimum is unknown or the live token drifted', () => {
    const base: UseTransakOnRampResult = {
      status: 'idle',
      activeIntentId: null,
      pending: [],
      activeVerificationId: null,
      error: null,
      finalityProgress: {},
      depositAddress: '0x1111111111111111111111111111111111111111',
      minDepositBaseUnits: 1n,
      selectedToken: token,
      isLaunching: false,
      isWidgetOpen: false,
      canRecreateSession: false,
      widget: null,
      launch: async () => undefined,
      recreateSession: async () => undefined,
      closeWidget: async () => undefined,
      finishPendingVerification: async () => undefined,
      refreshPending: async () => undefined,
    }
    const render = (result: UseTransakOnRampResult) =>
      renderToStaticMarkup(
        createElement(TransakCardWidgetView, {
          token,
          providerAssetCode: 'usdc',
          amount: '10',
          useOnRamp: () => result,
        })
      )

    const open = render(base)
    expect(open).toContain('Open card checkout')
    expect(open).not.toContain('disabled=""')

    const unknownMinimum = render({ ...base, minDepositBaseUnits: undefined })
    expect(unknownMinimum).toContain('disabled=""')
    expect(unknownMinimum).toContain('minimum purchase amount is unavailable')

    const driftedToken = render({ ...base, selectedToken: { ...token, decimals: 6 } })
    expect(driftedToken).toContain('disabled=""')
    expect(driftedToken).toContain('token configuration changed')

    const missingToken = render({ ...base, selectedToken: undefined })
    expect(missingToken).toContain('disabled=""')

    // 10-token amount vs 10-token minimum: the 5% buffer pushes the target to
    // 10.5, so the purchase must stay closed.
    const belowMinimum = render({ ...base, minDepositBaseUnits: 10n * 10n ** 18n })
    expect(belowMinimum).toContain('disabled=""')
    expect(belowMinimum).toContain('including a 5% delivery buffer')

    // Exactly at the 10.5 target the purchase opens again.
    const atTarget = renderToStaticMarkup(
      createElement(TransakCardWidgetView, {
        token,
        providerAssetCode: 'usdc',
        amount: '10.5',
        useOnRamp: () => ({ ...base, minDepositBaseUnits: 10n * 10n ** 18n }),
      })
    )
    expect(atTarget).toContain('Open card checkout')
    expect(atTarget).not.toContain('disabled=""')
  })

  it('wires the snapshotted lock service and recovery exit into the Transak leaf', () => {
    const intentId = 'owned-intent'
    let options: UseTransakOnRampOptions | undefined
    const result: UseTransakOnRampResult = {
      status: 'idle',
      activeIntentId: intentId,
      pending: [],
      activeVerificationId: null,
      error: null,
      finalityProgress: {},
      depositAddress: '0x1111111111111111111111111111111111111111',
      minDepositBaseUnits: 1n,
      selectedToken: token,
      isLaunching: false,
      isWidgetOpen: false,
      canRecreateSession: false,
      widget: null,
      launch: async () => undefined,
      recreateSession: async () => undefined,
      closeWidget: async () => undefined,
      finishPendingVerification: async () => undefined,
      refreshPending: async () => undefined,
    }
    const markup = renderToStaticMarkup(
      createElement(TransakCardWidgetView, {
        token,
        providerAssetCode: 'usdc',
        amount: '10',
        allowance: { value: '10000000000000000000', lockDuration: 3600 },
        lockServiceAddress: LOCK_SERVICE_ADDRESS,
        onCredited: () => undefined,
        onLockSubmitted: () => undefined,
        onLockFailed: () => undefined,
        onLeave: () => undefined,
        useOnRamp: (nextOptions: UseTransakOnRampOptions) => {
          options = nextOptions
          return result
        },
      })
    )
    expect(markup).toContain('Leave checkout')
    expect(markup).toContain('exact recovery')
    expect(options?.postDepositLock?.serviceAddress).toBe(LOCK_SERVICE_ADDRESS)
    expect(options?.tokenId).toBe(TOKEN_ID)
  })

  it('completes no-lock purchases on credit and locked purchases only after lock acceptance', () => {
    const events: string[] = []
    const unlocked = createProductOnRampOutcomeCallbacks({
      requiresLock: false,
      onComplete: () => events.push('unlocked-complete'),
      onLockFailed: () => events.push('unlocked-lock-failed'),
    })
    const locked = createProductOnRampOutcomeCallbacks({
      requiresLock: true,
      onComplete: () => events.push('locked-complete'),
      onLockFailed: () => events.push('locked-lock-failed'),
    })

    unlocked.onCredited?.()
    expect(locked.onCredited).toBeUndefined()
    locked.onLockSubmitted()
    locked.onLockFailed(new PostDepositLockError('lock failed', 'submission-failed'))
    expect(events).toEqual(['unlocked-complete', 'locked-complete', 'locked-lock-failed'])
  })
})
