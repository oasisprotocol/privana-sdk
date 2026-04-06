export class AccountingApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly detail?: string
  ) {
    super(message)
    this.name = 'AccountingApiError'
    Object.setPrototypeOf(this, AccountingApiError.prototype)
  }
}

export class NetworkError extends Error {
  constructor(
    message: string,
    public readonly cause?: Error
  ) {
    super(message)
    this.name = 'NetworkError'
    Object.setPrototypeOf(this, NetworkError.prototype)
  }
}

export class ValidationError extends Error {
  constructor(
    message: string,
    public readonly field?: string
  ) {
    super(message)
    this.name = 'ValidationError'
    Object.setPrototypeOf(this, ValidationError.prototype)
  }
}

export class HostedAuthError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'HostedAuthError'
    Object.setPrototypeOf(this, HostedAuthError.prototype)
  }
}

export class HostedAuthRequiredError extends HostedAuthError {
  constructor(
    message = 'Hosted redirect authentication is required. Start login with useHostedRedirectAuth().'
  ) {
    super(message)
    this.name = 'HostedAuthRequiredError'
    Object.setPrototypeOf(this, HostedAuthRequiredError.prototype)
  }
}

export class HostedAuthStateMismatchError extends HostedAuthError {
  constructor(message = 'Hosted authentication returned an invalid state value.') {
    super(message)
    this.name = 'HostedAuthStateMismatchError'
    Object.setPrototypeOf(this, HostedAuthStateMismatchError.prototype)
  }
}
