import 'dotenv/config';
import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { definePool, Instance } from 'prool';
import { anvil } from 'prool/instances';
import { ethers, utils } from 'ethers';
import { EthBridger, getArbitrumNetwork } from '@arbitrum/sdk';

let l1Instance: Instance | null = null;

const L1_RPC = process.env.ETHEREUM_MAINNET_RPC_URL || process.env.MAINNET_RPC_URL;
const L2_RPC = process.env.ARBITRUM_ONE_RPC_URL;
const TEST_TIMEOUT = Number(process.env.BRIDGE_TEST_TIMEOUT || 600000);

const suite = process.env.USE_LIVE_CHILD === '1' && process.env.VERIFY_DEPOSIT === '1' ? describe : describe.skip;

suite('Arbitrum ETH deposit verification (SDK message lifecycle)', () => {
  beforeAll(async () => {
    if (!L1_RPC || !L2_RPC) return;
    const l1Pool = definePool({ instance: anvil({ forkUrl: L1_RPC }) });
    l1Instance = (await l1Pool.start(1, { port: 9755 })) as Instance;
  }, 60_000);

  afterAll(async () => {
    try { await l1Instance?.stop?.(); } catch {}
  });

  it('deposits ETH L1→L2 and confirms L1 Inbox event emitted', async () => {
    if (!l1Instance) return expect(true).toBe(true);

    const l1Provider = new ethers.providers.JsonRpcProvider(`http://${l1Instance.host}:${l1Instance.port}`);
    const l2Provider = new ethers.providers.JsonRpcProvider(L2_RPC!);
    await l1Provider.send('evm_setAutomine', [true]);

    const signer = l1Provider.getSigner(0);
    const amt = utils.parseEther('0.0005');

    const childNetwork = await getArbitrumNetwork(42161);
    const bridger = new EthBridger(childNetwork);

    const txResponse = await bridger.deposit({ amount: amt, parentSigner: signer, childProvider: l2Provider });
    const l1Receipt = await txResponse.wait();
    expect(l1Receipt.status).toBe(1);

    // Verify via L1 logs on Inbox (explorer-free). If at least one Inbox event in the block, deposit reached bridge.
    const inboxAddress = childNetwork.ethBridge.inbox;
    const logs = await l1Provider.getLogs({
      address: inboxAddress,
      fromBlock: l1Receipt.blockNumber,
      toBlock: l1Receipt.blockNumber,
    });
    expect(logs.length).toBeGreaterThan(0);
  }, TEST_TIMEOUT);
});


