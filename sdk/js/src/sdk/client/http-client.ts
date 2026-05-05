import { AccountingApiError, NetworkError } from './errors'

export interface HttpClientConfig {
  baseUrl: string
  timeout?: number
  headers?: Record<string, string>
}

export class HttpClient {
  private readonly baseUrl: string
  private readonly timeout: number
  private readonly headers: Record<string, string>

  constructor(config: HttpClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '')
    this.timeout = config.timeout ?? 30000
    this.headers = {
      'Content-Type': 'application/json',
      ...config.headers,
    }
  }

  async get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path)
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('POST', path, body)
  }

  getBaseUrl(): string {
    return this.baseUrl
  }

  setHeader(name: string, value: string): void {
    this.headers[name] = value
  }

  removeHeader(name: string): void {
    delete this.headers[name]
  }

  getHeader(name: string): string | undefined {
    return this.headers[name]
  }

  private async request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.timeout)

    try {
      const response = await fetch(url, {
        method,
        headers: this.headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        let detail: string | undefined
        try {
          const errorBody = await response.json()
          detail = errorBody.detail || errorBody.error_description || errorBody.message
        } catch {
          detail = await response.text().catch(() => undefined)
        }

        throw new AccountingApiError(
          `API request failed: ${response.status} ${response.statusText}`,
          response.status,
          detail
        )
      }

      return response.json() as Promise<T>
    } catch (error) {
      clearTimeout(timeoutId)

      if (error instanceof AccountingApiError) {
        throw error
      }

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new NetworkError(`Request timeout after ${this.timeout}ms`)
        }
        throw new NetworkError(`Network request failed: ${error.message}`, error)
      }

      throw new NetworkError('Unknown network error occurred')
    }
  }
}
