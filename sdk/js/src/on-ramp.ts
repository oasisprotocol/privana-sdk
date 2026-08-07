'use client'

// Separated from the core SDK entry so consumers who don't use fiat on-ramp don't pay bundle cost

export { useFiatOnRamp } from './sdk/hooks/use-fiat-on-ramp'
export type {
  UseFiatOnRampOptions,
  UseFiatOnRampResult,
  FiatOnRampDebugEvent,
  FiatOnRampStatus,
} from './sdk/hooks/use-fiat-on-ramp'
export type { OnRampPostDepositLockConfig } from './sdk/hooks/pending-lock'

export { FiatOnRampForm } from './components/privana/fiat-on-ramp-form'
export type { FiatOnRampFormProps } from './components/privana/fiat-on-ramp-form'

export type {
  OnRampStatus,
  OnRampProvider,
  OnRampRecord,
  SignOnRampUrlRequest,
  SignOnRampUrlResponse,
  CreateOnRampIntentRequest,
  CreateOnRampIntentResponse,
  UpdateOnRampRequest,
  UpdateOnRampResponse,
  PendingOnRampsResponse,
} from './sdk/types/on-ramp'
