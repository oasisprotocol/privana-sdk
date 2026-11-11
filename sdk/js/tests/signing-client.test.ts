import { describe, expect, it } from 'bun:test'
import {
  ConnectorChainMismatchError,
  connect,
  createConfig,
  createConnector,
  getAccount,
  getChainId,
  getConnectorClient,
  type Config,
} from '@wagmi/core'
import { http } from 'viem'
import { baseSepolia, mainnet } from 'viem/chains'

const ACCOUNT = '0x1111111111111111111111111111111111111111'

async function connectWalletOn(walletChainId: number): Promise<Config> {
  const wallet = createConnector(() => ({
    id: 'wallet',
    name: 'Wallet',
    type: 'mock',
    connect: async () => ({ accounts: [ACCOUNT] as never, chainId: walletChainId }),
    disconnect: async () => {},
    getAccounts: async () => [ACCOUNT],
    getChainId: async () => walletChainId,
    getProvider: async () => ({ request: async () => null }),
    isAuthorized: async () => true,
    onAccountsChanged: () => {},
    onChainChanged: () => {},
    onDisconnect: () => {},
  }))
  const config: Config = createConfig({
    chains: [baseSepolia],
    connectors: [wallet],
    transports: { [baseSepolia.id]: http() },
    storage: null,
    multiInjectedProviderDiscovery: false,
  })
  await connect(config, { connector: config.connectors[0] })
  return config
}

describe('wallet on a chain outside the wagmi config', () => {
  it('leaves the wagmi chain on the last configured chain', async () => {
    const config = await connectWalletOn(mainnet.id)

    expect(getChainId(config)).toBe(baseSepolia.id)
    expect(getAccount(config).chainId).toBe(mainnet.id)
  })

  it('has no connector client for the wagmi chain', async () => {
    const config = await connectWalletOn(mainnet.id)

    await expect(
      getConnectorClient(config, { chainId: getChainId(config) })
    ).rejects.toBeInstanceOf(ConnectorChainMismatchError)
  })

  it('has a connector client for the wallet chain', async () => {
    const config = await connectWalletOn(mainnet.id)

    const client = await getConnectorClient(config, { chainId: getAccount(config).chainId })

    expect(client.account.address).toBe(ACCOUNT)
  })
})
