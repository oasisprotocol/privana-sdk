/**
 * Safety margin applied to every auth token-expiry check, in milliseconds. Treating tokens as
 * expired slightly early absorbs clock skew and request latency, so refreshes and cache evictions
 * fire before the real deadline.
 */
export const AUTH_CLOCK_SKEW_MS = 30_000
