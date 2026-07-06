export interface AllowanceTerm {
  title: string
  description: string
}

export interface Allowance {
  /**
   * Hard cap the service is allowed to lock (`maxAmount`), in the token's base
   * units. The pre-signed lock amount is capped to this value.
   */
  value: string
  /**
   * Minimum amount the delivered deposit must reach, in the token's base units.
   * Display-only: with a pre-signed exact-amount lock, a short delivery means
   * no lock is created at all, which is stricter than any minimum.
   */
  minAmount?: string
  /**
   * Lock lifetime in seconds, applied from signing time (the `Lock` expiry is
   * an absolute timestamp). Defaults to the SDK default (3600) when omitted.
   */
  lockDuration?: number
  terms?: {
    permissions?: AllowanceTerm[]
    restrictions?: AllowanceTerm[]
  }
}
