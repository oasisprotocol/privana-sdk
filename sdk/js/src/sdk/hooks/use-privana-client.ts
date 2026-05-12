'use client'

import { usePrivanaContext } from '../context/privana-provider'

export function usePrivanaClient() {
  const { client } = usePrivanaContext()
  return client
}
