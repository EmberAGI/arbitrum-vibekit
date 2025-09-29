import * as ethers from 'ethers';

import 'dotenv/config';
import { type Address } from 'viem';

import { type ChainConfig, CHAIN_CONFIGS } from './chains.js';

export interface ChainTestConfig {
  provider: ethers.providers.Provider;
  signer: ethers.Signer;
}

export class MultiChainSigner {
  constructor(
    public readonly chains: Record<number, ChainConfig>,
    public readonly signers: Record<number, ethers.Signer>,
    public readonly wallet: ethers.Wallet
  ) {}

  public getSignerForChainId(chainId: number): ethers.Signer {
    const address = this.signers[chainId];
    if (!address) {
      throw new Error(`No signer for chain ID ${chainId}`);
    }
    return address;
  }

  public getChainByVarName(varName: string): [number, ChainConfig] {
    for (const [chainId, chainConfig] of Object.entries(this.chains)) {
      if (varName === chainConfig.varName) return [parseInt(chainId), chainConfig];
    }
    throw new Error(
      `getChainByVarName: not found: ${varName}. Available chains are: ${Object.keys(this.chains).join(', ')}`
    );
  }

  public async getAddress(): Promise<Address> {
    const address = await this.wallet.getAddress();
    return address as Address;
  }

  public getChainConfig(chainId: number): ChainConfig {
    if (this.chains[chainId]) {
      return this.chains[chainId];
    } else {
      throw new Error(`MultiChainSigner.getChainConfig(${chainId}): no chain config for this ID`);
    }
  }

  public async sendTransaction(
    chainId: number,
    tx: ethers.PopulatedTransaction
  ): Promise<ethers.providers.TransactionResponse> {
    const signer = this.getSignerForChainId(chainId);
    return signer.sendTransaction(tx);
  }

  /**
   * Discovers all available anvil chains by checking each port starting from ANVIL_PORT
   * @returns An array of objects containing chainId and rpcUrl for each discovered chain
   */
  private static async discoverChains(): Promise<Array<{ chainId: number; rpcUrl: string }>> {
    const startPort = parseInt(process.env.ANVIL_PORT || '3070');
    const discoveredChains: Array<{ chainId: number; rpcUrl: string }> = [];
    let currentPort = startPort;

    // Try connecting to ports and discover chains
    while (true) {
      const rpcUrl = `http://localhost:${currentPort}`;
      try {
        const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
        // Add a short timeout to prevent hanging if the RPC is not responsive
        const networkPromise = provider.getNetwork();
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Connection timed out')), 1000)
        );

        const network = (await Promise.race([
          networkPromise,
          timeoutPromise,
        ])) as ethers.providers.Network;

        discoveredChains.push({
          chainId: network.chainId,
          rpcUrl,
        });

        // Move to the next port
        currentPort++;
      } catch (_error) {
        // If we can't connect to this port, we've likely found all chains
        break;
      }
    }

    return discoveredChains;
  }

  /**
   * Create a MultiChainSigner for multiple test chains, discovering available anvil instances.
   * The mnemonic for the wallet is sourced from the `MNEMONIC` environment variable.
   *
   * @param chainIdsToTest Array of chain IDs that should be available for testing
   * @returns MultiChainSigner configured with all required chains
   * @throws Error if any of the required chains cannot be discovered or if the `MNEMONIC` environment variable is not set.
   */
  static async fromTestChains(chainIdsToTest: number[]): Promise<MultiChainSigner> {
    // If a mnemonic is provided, use it; otherwise, get it from the environment
    const mnemonic = process.env.MNEMONIC;
    if (!mnemonic) {
      throw new Error('Mnemonic not found. Please provide a mnemonic or set MNEMONIC in .env');
    }

    // Create wallet from mnemonic
    const wallet = ethers.Wallet.fromMnemonic(mnemonic);
    console.log(`Using wallet ${wallet.address} for test chains`);

    // Discover available chains
    const availableChains = await MultiChainSigner.discoverChains();

    if (availableChains.length === 0) {
      throw new Error('No anvil instances found. Did you run `pnpm run start:anvil` first?');
    }

    // Log discovered chains
    console.log(
      'Discovered chains:\n' +
        availableChains
          .map(chain => `- Chain ID: ${chain.chainId}, RPC URL: ${chain.rpcUrl}`)
          .join('\n')
    );

    // Verify all required chains are available
    const availableChainIds = availableChains.map(chain => chain.chainId);
    const missingChains = chainIdsToTest.filter(id => !availableChainIds.includes(id));

    if (missingChains.length > 0) {
      throw new Error(
        `Required chain IDs not available: ${missingChains.join(', ')}. Available chains: ${availableChainIds.join(', ')}`
      );
    }

    // Build chain configs and signers for all required chains
    const chains: Record<number, ChainConfig> = {};
    const signers: Record<number, ethers.Signer> = {};

    for (const chainId of chainIdsToTest) {
      // Find the chain in available chains
      const chain = availableChains.find(c => c.chainId === chainId)!;

      // Create provider for the chain
      const provider = new ethers.providers.JsonRpcProvider(chain.rpcUrl);

      // Create signer for the chain
      const signer = wallet.connect(provider);

      // Find if we have a predefined chain config
      let chainConfig: ChainConfig;
      if (CHAIN_CONFIGS[chainId]) {
        // Use existing chain config as a base
        chainConfig = {
          ...CHAIN_CONFIGS[chainId],
          // Override RPC URL with the test provider's URL
          rpcUrl: chain.rpcUrl,
        };
      } else {
        // Create a minimal chain config
        chainConfig = {
          name: `Test Chain ${chainId}`,
          varName: `TEST_CHAIN_${chainId}`,
          rpcUrl: chain.rpcUrl,
        };
      }

      chains[chainId] = chainConfig;
      signers[chainId] = signer;

      console.log(
        `Test chain enabled: ${chainConfig.name} (ID: ${chainId}), RPC: ${chainConfig.rpcUrl}`
      );
    }

    return new MultiChainSigner(chains, signers, wallet);
  }

  static async fromEnv(): Promise<MultiChainSigner> {
    const mnemonic = process.env.MNEMONIC;
    if (!mnemonic) {
      throw new Error('Mnemonic not found in the .env file.');
    }
    const wallet = ethers.Wallet.fromMnemonic(mnemonic);
    console.log(`Using wallet ${wallet.address}`);
    return new MultiChainSigner(CHAIN_CONFIGS, await MultiChainSigner.loadSigners(wallet), wallet);
  }

  private static async loadSigners(wallet: ethers.Wallet): Promise<Record<number, ethers.Signer>> {
    return Object.fromEntries(
      await Promise.all(
        Object.entries(CHAIN_CONFIGS).map(([chainId, { rpcUrl, name }]) => {
          const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
          const signer = wallet.connect(provider);
          console.log('chain enabled:', name, 'rpc:', rpcUrl);
          return [chainId, signer];
        })
      )
    );
  }
}
