'use client'

import { useFlexvaultsContext } from '../context/flexvaults-provider'

export function useFlexvaultsClient() {
  const { client } = useFlexvaultsContext()
  return client
}
