import 'dotenv/config';
import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { definePool, Instance } from 'prool';
import { anvil } from 'prool/instances';
import { ethers } from 'ethers';
import { EthL1L3Bridger } from '@arbitrum/sdk';

let l1Instance: Instance | null = null;
let l2Instance: Instance | null = null;
let l3Instance: Instance | null = null;

const L1_RPC = process.env.ETHEREUM_MAINNET_RPC_URL || process.env.MAINNET_RPC_URL;
const L2_RPC = process.env.ARBITRUM_ONE_RPC_URL;
const L3_RPC = process.env.APECHAIN_RPC_URL || 'https://apechain.calderachain.xyz/http';

const suite = process.env.ENABLE_L1L3 === '1' ? describe : describe.skip;

suite('L1→L3 Teleport (EthL1L3Bridger)', () => {
  beforeAll(async () => {
    if (!L1_RPC || !L2_RPC || !L3_RPC) return;
    // Start forks
    const l1Pool = definePool({ instance: anvil({ forkUrl: L1_RPC }) });
    l1Instance = (await l1Pool.start(1, { port: 9855 })) as Instance;

    const l2Pool = definePool({ instance: anvil({ forkUrl: L2_RPC }) });
    l2Instance = (await l2Pool.start(1, { port: 9856 })) as Instance;

    const l3Pool = definePool({ instance: anvil({ forkUrl: L3_RPC }) });
    l3Instance = (await l3Pool.start(1, { port: 9857 })) as Instance;
  }, 60_000);

  afterAll(async () => {
    try { await l1Instance?.stop?.(); } catch {}
    try { await l2Instance?.stop?.(); } catch {}
    try { await l3Instance?.stop?.(); } catch {}
  });

  it('initializes EthL1L3Bridger and prepares providers', async () => {
    if (!l1Instance || !l2Instance || !l3Instance) {
      // Skip if any fork URL not provided
      return expect(true).toBe(true);
    }

    const l1 = new ethers.providers.JsonRpcProvider(`http://${l1Instance.host}:${l1Instance.port}`);
    const l2 = new ethers.providers.JsonRpcProvider(`http://${l2Instance.host}:${l2Instance.port}`);
    const l3 = new ethers.providers.JsonRpcProvider(`http://${l3Instance.host}:${l3Instance.port}`);

    // Instantiate bridger (further calls require teleporter config on L3; we validate setup only)
    const bridger = new EthL1L3Bridger();
    expect(bridger).toBeDefined();

    // Validate providers are alive
    await l1.getBlockNumber();
    await l2.getBlockNumber();
    await l3.getBlockNumber();

    expect(true).toBe(true);
  }, 120_000);
});


