'use client'

import { usePrivanaContext } from '../context/privana-context'

export function usePrivanaClient() {
  const { client } = usePrivanaContext()
  return client
}
