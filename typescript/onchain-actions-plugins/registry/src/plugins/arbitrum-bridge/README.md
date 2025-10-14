Arbitrum Bridge Plugin

A bridge plugin for Ember’s Onchain Actions Registry providing ETH and ERC20 bridging between Ethereum (parent) and Arbitrum (child) networks.

Capabilities

- Actions (plugin type: `bridge`)
  - `bridge-deposit`: L1 → L2 deposit (ETH and ERC20)
  - `bridge-withdraw`: L2 → L1 withdrawal (ETH and ERC20)
- Queries
  - `getMessageStatus`: Inspect cross-chain message lifecycle (parent→child or child→parent)

Installation

The plugin ships within `@emberai/onchain-actions-registry`.

```bash
pnpm add @emberai/onchain-actions-registry
```

Usage

```ts
import { initializePublicRegistry, type ChainConfig } from '@emberai/onchain-actions-registry';

const chainConfigs: ChainConfig[] = [
  { chainId: 42161, rpcUrl: process.env.ARBITRUM_ONE_RPC_URL! },
];

const registry = initializePublicRegistry(chainConfigs);

for await (const plugin of registry.getPlugins()) {
  if (plugin.type !== 'bridge') continue;
  // ETH deposit plan
  const depositAction = plugin.actions.find(a => a.type === 'bridge-deposit')!;
  const res = await depositAction.callback({
    token: {
      tokenUid: { chainId: '1', address: '0x0000000000000000000000000000000000000000' },
      name: 'ETH', symbol: 'ETH', isNative: true, decimals: 18, iconUri: null, isVetted: true,
    },
    amount: 10n ** 15n, // 0.001 ETH
    fromWalletAddress: '0xYourL1Address',
  });
  // Broadcast res.transactions with your wallet
}
```

Testing locally

We support two strategies:

1) Tenderly Virtual Nets (recommended)

- Set RPCs:
```bash
export ETHEREUM_MAINNET_RPC_URL="https://virtual.mainnet.eu.rpc.tenderly.co/<your-id>"
export ARBITRUM_ONE_RPC_URL="https://virtual.arbitrum.eu.rpc.tenderly.co/<your-id>"
```
- Run tests (live L2, extended timeout):
```bash
USE_LIVE_CHILD=1 BRIDGE_TEST_TIMEOUT=600000 pnpm exec vitest run \
  tests/arbitrum-bridge.int.test.ts \
  tests/arbitrum-bridge-erc20.int.test.ts
```
- Verify deposit via Inbox logs (no explorer required):
```bash
VERIFY_DEPOSIT=1 USE_LIVE_CHILD=1 BRIDGE_TEST_TIMEOUT=600000 pnpm exec vitest run \
  tests/arbitrum-bridge-verify.int.test.ts
```

2) Local forks (advanced)

- Fork L1 with anvil and use live L2 RPC. Pure L2 forks can hang on gateway calls; prefer live L2.

Verification without explorers

- L1 receipt: `status === 1` and `blockNumber` present
- L1 Inbox logs in the deposit block (Inbox from `getArbitrumNetwork(42161).ethBridge.inbox`)
- Optionally use Arbitrum SDK message helpers when available in your env

Implementation notes

- Adapter: `src/plugins/arbitrum-bridge/adapter.ts` builds TransactionPlans via `@arbitrum/sdk` `EthBridger`/`Erc20Bridger` request builders.
- Registry wiring: `src/index.ts` auto-registers the plugin for Arbitrum One (42161) and Arbitrum Sepolia (421614).

Caveats

- Some L2 gateway RPC calls can stall on local L2 forks; use a live Arbitrum RPC for tests.
- L1→L3 teleport flows require the L3 teleporter stack; test is opt-in.

