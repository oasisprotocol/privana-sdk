export interface AllowanceTerm {
  title: string
  description: string
}

export interface Allowance {
  /** Requested allowance amount in the token's base units. */
  value: string
  terms?: {
    permissions?: AllowanceTerm[]
    restrictions?: AllowanceTerm[]
  }
}
