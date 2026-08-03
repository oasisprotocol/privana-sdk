export * from './hosted-auth'

// siwe and siwe-persistence internals (message builders, lifecycle constants, record schemas)
// are deliberately not re-exported: they are implementation details of the SIWE auth paths
// (SiweAuthProvider + private-read token acquisition). Internal consumers import directly from
// './siwe'. buildSiweStatement is re-exported below only because it shipped in a previously
// published release; new consumer code should not depend on it.

/**
 * @deprecated buildSiweStatement is an internal SIWE concern, re-exported only for backward
 * compatibility with a previously published release. Do not depend on it in new code; will be
 * removed in a future release.
 */
export { buildSiweStatement } from './siwe'
