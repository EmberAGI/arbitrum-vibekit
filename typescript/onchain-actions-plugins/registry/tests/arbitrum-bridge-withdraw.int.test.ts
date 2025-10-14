import 'dotenv/config';
import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { definePool, Instance } from 'prool';
import { anvil } from 'prool/instances';
import { ethers } from 'ethers';
import { initializePublicRegistry, type ChainConfig, type Token } from '../src/index.ts';

let parentInstance: Instance | null = null;
let childInstance: Instance | null = null;

const PARENT_FORK_URL = process.env.ETHEREUM_MAINNET_RPC_URL || process.env.MAINNET_RPC_URL;
const CHILD_FORK_URL = process.env.ARBITRUM_ONE_RPC_URL;

describe('Arbitrum Bridge Plugin - Withdraw ETH (integration)', () => {
  beforeAll(async () => {
    if (!PARENT_FORK_URL || !CHILD_FORK_URL) return;

    const parentPool = definePool({ instance: anvil({ forkUrl: PARENT_FORK_URL }) });
    parentInstance = (await parentPool.start(1, { port: 9745 })) as Instance;

    const childPool = definePool({ instance: anvil({ forkUrl: CHILD_FORK_URL }) });
    childInstance = (await childPool.start(1, { port: 9746 })) as Instance;
  }, 60_000);

  afterAll(async () => {
    try { await parentInstance?.stop?.(); } catch {}
    try { await childInstance?.stop?.(); } catch {}
  });

  it('creates a valid ETH withdraw TransactionPlan', async () => {
    if (!parentInstance || !childInstance) return expect(true).toBe(true);

    const childRpcUrl = `http://${childInstance.host}:${childInstance.port}`;

    const childChainId = 42161; // Arbitrum One
    const chainConfigs: ChainConfig[] = [
      { chainId: childChainId, name: 'Arbitrum One (fork)', rpcUrl: childRpcUrl },
    ];

    const registry = initializePublicRegistry(chainConfigs);
    const plugins: any[] = [];
    for await (const p of registry.getPlugins()) plugins.push(p);
    const bridge = plugins.find((p) => p.type === 'bridge');
    expect(bridge).toBeDefined();

    const ethToken: Token = {
      tokenUid: { chainId: String(childChainId), address: '0x0000000000000000000000000000000000000000' },
      name: 'ETH',
      symbol: 'ETH',
      isNative: true,
      decimals: 18,
      iconUri: null,
      isVetted: true,
    };

    const childProvider = new ethers.providers.JsonRpcProvider(childRpcUrl);
    const childSigner = childProvider.getSigner(0);
    const fromAddress = await childSigner.getAddress();

    const withdrawAction = bridge.actions.find((a: any) => a.type === 'bridge-withdraw');
    const amount = BigInt(10n ** 15n);
    const res = await withdrawAction.callback({
      token: ethToken,
      amount,
      fromWalletAddress: fromAddress,
    });

    expect(res.transactions.length).toBeGreaterThan(0);
    const txPlan = res.transactions[0];
    expect(txPlan.to).toBeDefined();
    expect(txPlan.data).toBeDefined();
  }, 120_000);
});


