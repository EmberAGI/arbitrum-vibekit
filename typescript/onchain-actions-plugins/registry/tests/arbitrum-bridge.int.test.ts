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
const TEST_TIMEOUT = Number(process.env.BRIDGE_TEST_TIMEOUT || 600000);

describe('Arbitrum Bridge Plugin (integration)', () => {
  beforeAll(async () => {
    if (!PARENT_FORK_URL || !CHILD_FORK_URL) return;
    const parentPool = definePool({ instance: anvil({ forkUrl: PARENT_FORK_URL }) });
    parentInstance = (await parentPool.start(1, { port: 9545 })) as Instance;

    if (process.env.USE_LIVE_CHILD === '1') {
      childInstance = null;
      childRpcUrlFromSetup = CHILD_FORK_URL;
    } else {
      const childPool = definePool({ instance: anvil({ forkUrl: CHILD_FORK_URL }) });
      childInstance = (await childPool.start(1, { port: 9546 })) as Instance;
      childRpcUrlFromSetup = `http://${childInstance.host}:${childInstance.port}`;
    }
  }, 60_000);

  afterAll(async () => {
    try {
      await parentInstance?.stop?.();
    } catch {}
    try {
      await childInstance?.stop?.();
    } catch {}
  });

  it('creates a valid ETH deposit TransactionPlan (no broadcast)', async () => {
    if (!parentInstance || !childInstance) {
      // Skip if fork URLs were not provided
      return expect(true).toBe(true);
    }

    const parentRpcUrl = `http://${parentInstance.host}:${parentInstance.port}`;
    const childRpcUrl = childRpcUrlFromSetup!;

    const childChainId = 42161; // Arbitrum One
    const chainConfigs: ChainConfig[] = [
      { chainId: childChainId, name: 'Arbitrum One (fork)', rpcUrl: childRpcUrl },
    ];

    const registry = initializePublicRegistry(chainConfigs);

    // Find the bridge plugin
    const plugins: any[] = [];
    for await (const p of registry.getPlugins()) plugins.push(p);
    const bridge = plugins.find((p) => p.type === 'bridge');
    expect(bridge).toBeDefined();

    // ETH token (native) placeholder
    const ethToken: Token = {
      tokenUid: { chainId: '1', address: '0x0000000000000000000000000000000000000000' },
      name: 'ETH',
      symbol: 'ETH',
      isNative: true,
      decimals: 18,
      iconUri: null,
      isVetted: true,
    };

    // Build deposit plan unless disabled via env (to avoid heavy RPC on forks)
    const depositAction = bridge.actions.find((a: any) => a.type === 'bridge-deposit');
    expect(depositAction).toBeDefined();
    if (process.env.SKIP_BRIDGE_NETWORK_CALLS === '1') {
      // Only assert plugin shape when network calls are skipped
      expect(bridge.actions.length).toBeGreaterThan(0);
      return;
    }

    const depositAmount = BigInt(10n ** 15n); // 0.001 ETH
    const parentProvider = new ethers.providers.JsonRpcProvider(parentRpcUrl);
    const parentSigner = parentProvider.getSigner(0);
    const fromAddress = await parentSigner.getAddress();
    // Ensure instant mining on fork
    await parentProvider.send('evm_setAutomine', [true]);

    const res = await depositAction.callback({
      token: ethToken,
      amount: depositAmount,
      fromWalletAddress: fromAddress,
    });

    expect(res.transactions.length).toBeGreaterThan(0);
    const txPlan = res.transactions[0];
    expect(txPlan.to).toBeDefined();
    expect(txPlan.data).toBeDefined();

    // Do not broadcast on local fork; just ensure plan is well-formed
    expect(txPlan.chainId).toBe('1');
  }, TEST_TIMEOUT);
});


