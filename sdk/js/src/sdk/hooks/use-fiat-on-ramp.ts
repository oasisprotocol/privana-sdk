'use client'

import { useCallback, useEffect, useRef } from 'react'
import type { MoonPayBuyWidget } from '@moonpay/moonpay-react'
import { moonPayOnRampAdapter, normalizeMoonPayProviderEvent } from '../on-ramp/moonpay-adapter'
import {
  useOnRamp,
  type OnRampDebugEvent,
  type OnRampFlowStatus,
  type UseOnRampOptions,
  type UseOnRampResult,
} from './use-on-ramp'
import { usePrivateReadRequest } from './use-private-read-request'
import type { OnRampRecord } from '../types'

type MoonPayBuyProps = Parameters<typeof MoonPayBuyWidget>[0]
type OnTransactionCompletedProps = Parameters<
  NonNullable<MoonPayBuyProps['onTransactionCompleted']>
>[0]
type OnTransactionCreatedProps = Parameters<NonNullable<MoonPayBuyProps['onTransactionCreated']>>[0]

export type FiatOnRampStatus = OnRampFlowStatus
export type FiatOnRampDebugEvent = OnRampDebugEvent
export type UseFiatOnRampOptions = Omit<UseOnRampOptions, 'adapter'>

export interface UseFiatOnRampResult extends Omit<
  UseOnRampResult,
  | 'prepareOnRampIntent'
  | 'handleProviderLaunchReady'
  | 'handleProviderLaunchFailed'
  | 'handleProviderEvent'
  | 'handleProviderClosed'
> {
  prepareOnRampIntent: (request: {
    currencyCode: string
    baseCurrencyCode?: string
    baseCurrencyAmount?: string
    quoteCurrencyAmount?: string
  }) => Promise<OnRampRecord>
  signUrl: (url: string) => Promise<string>
  handleTransactionCreated: (props: OnTransactionCreatedProps) => Promise<void>
  handleTransactionCompleted: (props: OnTransactionCompletedProps) => Promise<void>
  handleWidgetClosed: () => Promise<void>
}

/** Thin MoonPay compatibility adapter over the shared on-ramp state machine. */
export function useFiatOnRamp(options: UseFiatOnRampOptions): UseFiatOnRampResult {
  const { executePrivateRead } = usePrivateReadRequest()
  const core = useOnRamp({ ...options, adapter: moonPayOnRampAdapter })
  const {
    prepareOnRampIntent: prepareProviderIntent,
    handleProviderLaunchReady,
    handleProviderLaunchFailed,
    handleProviderEvent,
    handleProviderClosed,
  } = core
  const debugRef = useRef(options.onDebugEvent)
  const statusRef = useRef(core.status)

  useEffect(() => {
    debugRef.current = options.onDebugEvent
    statusRef.current = core.status
  }, [core.status, options.onDebugEvent])

  const emitDebug = useCallback(
    (event: string, payload?: Record<string, unknown>) => {
      debugRef.current?.({
        at: new Date().toISOString(),
        event,
        status: statusRef.current,
        tokenId: options.tokenId,
        payload,
      })
    },
    [options.tokenId]
  )

  const prepareOnRampIntent = useCallback(
    ({
      currencyCode,
      baseCurrencyCode,
      baseCurrencyAmount,
      quoteCurrencyAmount,
    }: {
      currencyCode: string
      baseCurrencyCode?: string
      baseCurrencyAmount?: string
      quoteCurrencyAmount?: string
    }) =>
      prepareProviderIntent({
        providerAssetCode: currencyCode,
        baseCurrencyCode,
        baseCurrencyAmount,
        quoteCurrencyAmount,
      }),
    [prepareProviderIntent]
  )

  const signUrl = useCallback(
    async (url: string): Promise<string> => {
      emitDebug('moonpay:onUrlSignatureRequested', summariseMoonPayUrl(url))
      try {
        const { signature } = await executePrivateRead((readClient) =>
          readClient.signOnRampUrl({ url })
        )
        handleProviderLaunchReady()
        emitDebug('sign-url:success', { signatureLength: signature.length })
        return signature
      } catch (error) {
        const launchError = error instanceof Error ? error : new Error('Failed to sign on-ramp URL')
        handleProviderLaunchFailed(launchError)
        emitDebug('sign-url:error', errorPayload(launchError))
        throw launchError
      }
    },
    [emitDebug, executePrivateRead, handleProviderLaunchFailed, handleProviderLaunchReady]
  )

  const handleTransactionCreated = useCallback(
    async (props: OnTransactionCreatedProps) => {
      emitDebug('moonpay:onTransactionCreated', summariseMoonPayEventProps(props))
      await handleProviderEvent(normalizeMoonPayProviderEvent('transaction-created', props))
    },
    [emitDebug, handleProviderEvent]
  )

  const handleTransactionCompleted = useCallback(
    async (props: OnTransactionCompletedProps) => {
      emitDebug('moonpay:onTransactionCompleted', summariseMoonPayEventProps(props))
      await handleProviderEvent(normalizeMoonPayProviderEvent('transaction-completed', props))
    },
    [emitDebug, handleProviderEvent]
  )

  return {
    status: core.status,
    activeIntentId: core.activeIntentId,
    pending: core.pending,
    activeVerificationId: core.activeVerificationId,
    error: core.error,
    finalityProgress: core.finalityProgress,
    depositAddress: core.depositAddress,
    minDepositBaseUnits: core.minDepositBaseUnits,
    selectedToken: core.selectedToken,
    finishPendingVerification: core.finishPendingVerification,
    refreshPending: core.refreshPending,
    prepareOnRampIntent,
    signUrl,
    handleTransactionCreated,
    handleTransactionCompleted,
    handleWidgetClosed: handleProviderClosed,
  }
}

function summariseMoonPayEventProps(props: Record<string, unknown>): Record<string, unknown> {
  return {
    transactionIdPresent: Boolean(props.id),
    externalTransactionIdPresent: Boolean(props.externalTransactionId),
    status: props.status,
    baseCurrency: props.baseCurrency,
    quoteCurrency: props.quoteCurrency,
    walletAddressPresent: Boolean(props.walletAddress),
  }
}

function summariseMoonPayUrl(url: string): Record<string, unknown> {
  try {
    const parsed = new URL(url)
    const params = parsed.searchParams
    return {
      origin: parsed.origin,
      pathname: parsed.pathname,
      apiKeyPresent: params.has('apiKey'),
      currencyCode: params.get('currencyCode'),
      baseCurrencyCode: params.get('baseCurrencyCode'),
      baseCurrencyAmountPresent: params.has('baseCurrencyAmount'),
      walletAddressPresent: params.has('walletAddress'),
      externalCustomerIdPresent: params.has('externalCustomerId'),
      externalTransactionIdPresent: params.has('externalTransactionId'),
      redirectURLPresent: params.has('redirectURL'),
      signaturePresent: params.has('signature'),
    }
  } catch {
    return { parseError: true, length: url.length }
  }
}

function errorPayload(error: Error): Record<string, unknown> {
  return {
    name: error.name,
    message: error.message,
    stack: error.stack?.split('\n').slice(0, 4).join('\n'),
  }
}
