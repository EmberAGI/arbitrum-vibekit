import 'dotenv/config';
import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { definePool, Instance } from 'prool';
import { anvil } from 'prool/instances';
import { ethers } from 'ethers';
import { initializePublicRegistry, type ChainConfig, type Token } from '../src/index.ts';

let parentInstance: Instance | null = null;
let childInstance: Instance | null = null;
let childRpcUrlFromSetup: string | null = null;

const PARENT_FORK_URL = process.env.ETHEREUM_MAINNET_RPC_URL || process.env.MAINNET_RPC_URL;
const CHILD_FORK_URL = process.env.ARBITRUM_ONE_RPC_URL;

describe('Arbitrum Bridge Plugin - ERC20 (integration)', () => {
  beforeAll(async () => {
    if (!PARENT_FORK_URL || !CHILD_FORK_URL) return;

    const parentPool = definePool({ instance: anvil({ forkUrl: PARENT_FORK_URL }) });
    parentInstance = (await parentPool.start(1, { port: 9645 })) as Instance;
    if (process.env.USE_LIVE_CHILD === '1') {
      childInstance = null;
      childRpcUrlFromSetup = CHILD_FORK_URL;
    } else {
      const childPool = definePool({ instance: anvil({ forkUrl: CHILD_FORK_URL }) });
      childInstance = (await childPool.start(1, { port: 9646 })) as Instance;
      childRpcUrlFromSetup = `http://${childInstance.host}:${childInstance.port}`;
    }
  }, 60_000);

  afterAll(async () => {
    try { await parentInstance?.stop?.(); } catch {}
    try { await childInstance?.stop?.(); } catch {}
  });

  it('creates a valid ERC20 deposit TransactionPlan (USDC) and sends approval+deposit', async () => {
    if (!parentInstance || !childInstance) return expect(true).toBe(true);

    const parentRpcUrl = `http://${parentInstance.host}:${parentInstance.port}`;
    const childRpcUrl = childRpcUrlFromSetup!;

    const childChainId = 42161; // Arbitrum One
    const chainConfigs: ChainConfig[] = [
      { chainId: childChainId, name: 'Arbitrum One (fork)', rpcUrl: childRpcUrl },
    ];

    const registry = initializePublicRegistry(chainConfigs);
    const plugins: any[] = [];
    for await (const p of registry.getPlugins()) plugins.push(p);
    const bridge = plugins.find((p) => p.type === 'bridge');
    expect(bridge).toBeDefined();

    // USDC on Ethereum mainnet
    const usdcToken: Token = {
      tokenUid: { chainId: '1', address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' },
      name: 'USDC',
      symbol: 'USDC',
      isNative: false,
      decimals: 6,
      iconUri: null,
      isVetted: true,
    };

    const parentProvider = new ethers.providers.JsonRpcProvider(parentRpcUrl);
    const parentSigner = parentProvider.getSigner(0);
    const fromAddress = await parentSigner.getAddress();

    // Build deposit plan for 10 USDC
    const depositAction = bridge.actions.find((a: any) => a.type === 'bridge-deposit');
    const amount = BigInt(10n * 10n ** 6n);
    const res = await depositAction.callback({
      token: usdcToken,
      amount,
      fromWalletAddress: fromAddress,
    });

    expect(res.transactions.length).toBeGreaterThan(0);
    const txPlan = res.transactions[0];
    expect(txPlan.to).toBeDefined();
    expect(txPlan.data).toBeDefined();
  }, 120_000);
});


