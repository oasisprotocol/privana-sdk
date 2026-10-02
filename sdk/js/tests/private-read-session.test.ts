import { afterEach, describe, expect, it } from 'bun:test'
import { PrivateReadAuthRequiredError } from '../src/sdk/client'
import { requireSessionPrivateReadToken } from '../src/sdk/hooks/use-private-read-request'
import {
  deleteCachedPrivateReadToken,
  setCachedPrivateReadToken,
} from '../src/sdk/utils/private-read-token-store'

const SCOPE = 'https://privana.example.com:23295:0x000000000000000000000000000000000000dead'
const HOUR = 60 * 60 * 1000

afterEach(() => {
  deleteCachedPrivateReadToken(SCOPE)
})

describe('requireSessionPrivateReadToken', () => {
  it("reads with the session's cached token", () => {
    setCachedPrivateReadToken(SCOPE, '0xsession-token', Date.now() + HOUR)
    expect(requireSessionPrivateReadToken(SCOPE)).toBe('0xsession-token')
  })

  it('asks for sign-in instead of signing when there is no token', () => {
    expect(() => requireSessionPrivateReadToken(SCOPE)).toThrow(PrivateReadAuthRequiredError)
  })

  it('asks for sign-in instead of signing once the token has expired', () => {
    setCachedPrivateReadToken(SCOPE, '0xsession-token', Date.now() - HOUR)
    expect(() => requireSessionPrivateReadToken(SCOPE)).toThrow(PrivateReadAuthRequiredError)
  })
})
