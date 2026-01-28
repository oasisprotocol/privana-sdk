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
