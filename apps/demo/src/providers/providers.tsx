'use client'

import { useState, type ReactNode } from 'react'
import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RainbowKitProvider, darkTheme, lightTheme } from '@rainbow-me/rainbowkit'
import { wagmiConfig } from './wagmi-config'
import { FlexvaultsProvider, type Network } from '@oasisprotocol/flexvaults-sdk'
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
            <FlexvaultsProvider network={network}>{children}</FlexvaultsProvider>
          </RainbowKitWrapper>
        </QueryClientProvider>
      </WagmiProvider>
    </ThemeProvider>
  )
}
