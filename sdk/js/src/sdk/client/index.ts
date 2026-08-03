export * from './privana-client'
export * from './errors'

// http-client internals are not wildcard-exported; HttpClient is an internal building block of
// PrivanaClient and consumers should configure via PrivanaClientConfig. The symbols below are
// re-exported only for backward compatibility with previously published releases.

/**
 * @deprecated HttpClient is now internal to PrivanaClient. Construct a PrivanaClient with your
 * config (PrivanaClientConfig) instead of building an HttpClient by hand. Retained for backward
 * compatibility; will be removed in a future release.
 */
export { HttpClient, type HttpClientConfig } from './http-client'
