import { privateKeyToAccount } from 'viem/accounts';
import {
  createWalletClient,
  createPublicClient,
  http,
  parseUnits,
  maxUint256,
  erc20Abi,
} from 'viem';
import {
  ARBITRUM_USDC_ADDRESS,
  ARBITRUM_WETH_ADDRESS,
  GMX_EXCHANGE_ROUTER,
  GMX_ORDER_VAULT,
} from '../../constants.js';
import { ARBITRUM_RPC_URL, CHAIN } from '../../clients/clients.js';
// ---- addresses ----

// ---- private keys (mock / test only) ----
if (!process.env.USER_PK || !process.env['A2A_TEST_AGENT_NODE_PRIVATE_KEY']) {
  throw new Error('Please set USER_PK and A2A_TEST_AGENT_NODE_PRIVATE_KEY environment variables');
}
const USER_PK = process.env['USER_PK'] as `0x${string}`;
const AGENT_PK = process.env['A2A_TEST_AGENT_NODE_PRIVATE_KEY'] as `0x${string}`;

console.log(
  `ARBITRUM_RPC_URL: `,
  ARBITRUM_RPC_URL,
  `USER_PK : `,
  privateKeyToAccount(USER_PK),
  `\n`,
  `AGENT_PK : `,
  privateKeyToAccount(AGENT_PK),
);

// ---- clients ----
const publicClient = createPublicClient({
  chain: CHAIN,
  transport: http(ARBITRUM_RPC_URL),
});

const user = createWalletClient({
  chain: CHAIN,
  transport: http(ARBITRUM_RPC_URL),
  account: privateKeyToAccount(USER_PK),
});

const agent = createWalletClient({
  chain: CHAIN,
  transport: http(ARBITRUM_RPC_URL),
  account: privateKeyToAccount(AGENT_PK),
});

async function runApprovalAndTransfers() {
  console.log('🚀 Bootstrapping agent funds');

  // 1️⃣ User approves agent
  console.log('User → approve USDC to agent');
  await user.writeContract({
    address: ARBITRUM_USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'approve',
    args: [agent.account.address, maxUint256],
  });

  // 2️⃣ User transfers funds to agent
  console.log('User → transfer USDC to agent');
  await user.writeContract({
    address: ARBITRUM_USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'transfer',
    args: [
      agent.account.address,
      parseUnits('100', 6), // send 100 USDC
    ],
  });

  // 3️⃣ Agent approves ExchangeRouter
  console.log('Agent → approve USDC to ExchangeRouter');
  await agent.writeContract({
    address: ARBITRUM_USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'approve',
    args: [GMX_EXCHANGE_ROUTER, maxUint256],
  });
  console.log('Agent → approve WETH to ExchangeRouter');
  await agent.writeContract({
    address: ARBITRUM_WETH_ADDRESS,
    abi: erc20Abi,
    functionName: 'approve',
    args: [GMX_EXCHANGE_ROUTER, maxUint256],
  });

  console.log('Agent → approve USDC to OrderVault');
  await agent.writeContract({
    address: ARBITRUM_USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'approve',
    args: [
      GMX_ORDER_VAULT, // GMX OrderVault
      maxUint256,
    ],
  });

  console.log('✅ Agent bootstrap complete');
}

runApprovalAndTransfers().catch(console.error);
