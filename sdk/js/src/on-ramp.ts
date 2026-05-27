'use client'

// Separated from the core SDK entry so consumers who don't use fiat on-ramp don't pay bundle cost

export { useFiatOnRamp } from './sdk/hooks/use-fiat-on-ramp'
export type {
  UseFiatOnRampOptions,
  UseFiatOnRampResult,
  FiatOnRampStatus,
} from './sdk/hooks/use-fiat-on-ramp'
