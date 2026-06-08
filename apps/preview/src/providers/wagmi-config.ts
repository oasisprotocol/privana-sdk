'use client'

import { getDefaultConfig } from '@rainbow-me/rainbowkit'
import { baseSepolia, sepolia } from 'wagmi/chains'
import { http } from 'wagmi'

const sapphireTestnet = {
  id: 23295,
  name: 'Sapphire Testnet',
  nativeCurrency: {
    decimals: 18,
    name: 'TEST',
    symbol: 'TEST',
  },
  rpcUrls: {
    default: { http: ['https://testnet.sapphire.oasis.io'] },
  },
  blockExplorers: {
    default: { name: 'Oasis Explorer', url: 'https://explorer.oasis.io/testnet/sapphire' },
  },
  testnet: true,
} as const

const projectId = process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID || 'demo-project-id'

export const wagmiConfig = getDefaultConfig({
  appName: 'Privana SDK',
  projectId,
  chains: [baseSepolia, sepolia, sapphireTestnet],
  transports: {
    [baseSepolia.id]: http(),
    [sepolia.id]: http(),
    [sapphireTestnet.id]: http(),
  },
  ssr: true,
})

declare module 'wagmi' {
  interface Register {
    config: typeof wagmiConfig
  }
}
