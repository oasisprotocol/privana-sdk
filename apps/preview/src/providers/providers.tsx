'use client'

import { useState, type ReactNode } from 'react'
import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RainbowKitProvider, darkTheme, lightTheme } from '@rainbow-me/rainbowkit'
import { wagmiConfig } from './wagmi-config'
import {
  PrivanaProvider,
  NETWORK_CONFIG,
  SUPPORTED_CHAINS,
  type Network,
} from '@oasisprotocol/privana-sdk'
import { ThemeProvider, useTheme } from './theme-provider'
import '@rainbow-me/rainbowkit/styles.css'

interface ProvidersProps {
  children: ReactNode
  network?: Network
}

function RainbowKitWrapper({ children }: { children: ReactNode }) {
  const { theme } = useTheme()

  const rainbowTheme =
    theme === 'dark'
      ? darkTheme({
          accentColor: '#8b5cf6',
          accentColorForeground: 'white',
          borderRadius: 'large',
          fontStack: 'system',
          overlayBlur: 'small',
        })
      : lightTheme({
          accentColor: '#8b5cf6',
          accentColorForeground: 'white',
          borderRadius: 'large',
          fontStack: 'system',
          overlayBlur: 'small',
        })

  return (
    <RainbowKitProvider theme={rainbowTheme} modalSize="compact">
      {children}
    </RainbowKitProvider>
  )
}

export function Providers({ children, network = 'testnet' }: ProvidersProps) {
  const apiUrl = process.env.NEXT_PUBLIC_PRIVANA_API_URL?.trim() || NETWORK_CONFIG[network].apiUrl
  const hostedAuthClientId = process.env.NEXT_PUBLIC_PRIVANA_HOSTED_AUTH_CLIENT_ID?.trim()
  const hostedAuthRedirectUri = process.env.NEXT_PUBLIC_PRIVANA_HOSTED_AUTH_REDIRECT_URI?.trim()
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5 * 1000,
            refetchOnWindowFocus: false,
          },
        },
      })
  )

  return (
    <ThemeProvider>
      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          <RainbowKitWrapper>
            <PrivanaProvider
              networkConfig={{ ...NETWORK_CONFIG[network], apiUrl }}
              tokens={['0xbd3a41ffd21be1cfcdca7a4e7755842a5b78c9443fb7ea008e6a7314f0caea87']}
              hostedAuth={
                hostedAuthClientId && hostedAuthRedirectUri
                  ? {
                      clientId: hostedAuthClientId,
                      redirectUri: hostedAuthRedirectUri,
                    }
                  : undefined
              }
            >
              {children}
            </PrivanaProvider>
          </RainbowKitWrapper>
        </QueryClientProvider>
      </WagmiProvider>
    </ThemeProvider>
  )
}
