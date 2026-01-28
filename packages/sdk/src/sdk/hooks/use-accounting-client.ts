'use client'

import { useAccountingContext } from '../context/accounting-provider'

export function useAccountingClient() {
  const { client } = useAccountingContext()
  return client
}
