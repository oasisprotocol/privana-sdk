export interface AllowanceTerm {
  title: string
  description: string
}

export interface Allowance {
  /**
   * Hard cap the service is allowed to lock (`maxAmount`), in the token's base units.
   * Signed into the deposit-lock authorization.
   */
  value: string
  /**
   * Minimum amount the delivered deposit must reach for the lock to be created
   * (`minAmount`), in the token's base units. Defaults to `0` when omitted.
   */
  minAmount?: string
  /**
   * Lock lifetime in seconds. The accounting module adds this to `block.timestamp`
   * to derive the lock expiry. Defaults to the SDK default (3600) when omitted.
   */
  lockDuration?: number
  terms?: {
    permissions?: AllowanceTerm[]
    restrictions?: AllowanceTerm[]
  }
}
