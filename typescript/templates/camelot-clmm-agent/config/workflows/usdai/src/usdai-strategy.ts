import type { Artifact } from '@a2a-js/sdk';
import {
  createDelegation,
  Implementation,
  toMetaMaskSmartAccount,
} from '@metamask/delegation-toolkit';
import type { Client, PublicActions, PublicRpcSchema, Transport } from 'viem';
import { formatUnits, keccak256, parseUnits, toBytes } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import type { Chain } from 'viem/chains';
import { z } from 'zod';

import type {
  WorkflowContext,
  WorkflowPlugin,
  WorkflowState,
  // PaymentSettlement,
} from '@emberai/agent-node/workflow';
// import { requirePaymentMessage } from '../../src/utils/ap2/x402-plugin.js';

import { approveTokenDirectStep } from './utils/allowance.js';
import { createClients } from './utils/clients.js';
import { executeSupplyUsdaiLiquidity } from './utils/trading.js';
// import { createPaymentRequirements } from './utils/createPaymentRequirements.js';

// Constants
const USDAI_TOKEN = {
  address: '0x0a1a1a107e45b7ced86833863f482bc5f4ed82ef',
  decimals: 18,
} as const;
const PENDLE_SWAP = {
  address: '0x888888888889758F76e7103c6CbF23ABbF58F946',
  selector: '0x12599ac6',
  usdAiPool: '0x8e101c690390de722163d4dc3f76043bebbbcadd',
} as const;

// Hard-coded limit and delay for streaming iterations to allow workflow completion in tests
const STREAM_LIMIT = 1;
const STREAM_DELAY_MS = 3000;

// Agent wallet private key from environment
const agentPrivateKey = process.env['A2A_TEST_AGENT_NODE_PRIVATE_KEY'];
if (!agentPrivateKey) {
  throw new Error('A2A_TEST_AGENT_NODE_PRIVATE_KEY environment variable is required');
}

// Debug mode - skip actual transactions when true
const DEBUG_MODE = process.env['DEBUG_MODE'] === 'true';
if (DEBUG_MODE) {
  console.log('[Workflow] Running in DEBUG_MODE - transactions will be skipped');
}

//'Trading strategy to farm ALLO and APY by supplying USDai to Pendle liquidity pools'

const plugin: WorkflowPlugin = {
  id: 'usdai-points-trading-strateg',
  name: 'USDAi Points Trading Strategy',
  description:
    'Trading strategy to provide USDai to Pendle liquidity pools in exchange for ALLO and APY',
  version: '1.0.0',

  inputSchema: z.object({}),

  async *execute(context: WorkflowContext): AsyncGenerator<WorkflowState, unknown, unknown> {
    // Status: Starting workflow
    console.log('[Workflow] execute() called, context:', context);

    yield {
      type: 'dispatch-response',
      parts: [
        {
          kind: 'data',
          data: {
            name: 'USDai Pendle Allo',
            subtitle: 'by @0xfarmer',
            tokenIconUri:
              'https://assets.coingecko.com/coins/images/55857/standard/USDai_Token_Full_Glyph.png?1755229050',
            platformIconUri:
              'https://assets.coingecko.com/coins/images/15069/standard/Pendle_Logo_Normal-03.png?1696514728',
            rewards: [
              { type: 'points', multiplier: 25, reward: 'Allo points' },
              { type: 'apy', percentage: 15, reward: 'APY' },
            ],
          },
        },
      ],
    };

    console.log('[Workflow] Yielding initial working status...');
    yield {
      type: 'status-update',
      message: 'Starting USDAi Points Trading Strategy workflow...',
    };
    console.log('[Workflow] Initial status yielded');

    // Create agents wallet
    console.log('[Workflow] Creating agent wallet...');
    const clients = createClients();
    const account = privateKeyToAccount(agentPrivateKey as `0x${string}`);
    console.log('[Workflow] Agent account address:', account.address);
    console.log('[Workflow] Calling toMetaMaskSmartAccount...');
    const agentsWallet = await toMetaMaskSmartAccount({
      client: clients.public as Client<
        Transport,
        Chain | undefined,
        undefined,
        PublicRpcSchema,
        PublicActions<Transport, Chain | undefined>
      >,
      implementation: Implementation.Hybrid,
      deployParams: [account.address, [], [], []],
      deploySalt: '0x',
      signer: { account },
    });
    console.log('[Workflow] Agent smart account created:', agentsWallet.address);

    yield {
      type: 'artifact',
      artifact: {
        artifactId: 'strategy-input-display',
        name: 'strategy-input-display.json',
        description: 'Strategy input',
        parts: [
          {
            kind: 'data',
            data: {
              name: 'USDai Pendle Allo',
              subtitle: 'by @0xfarmer',
              token: 'USDAi',
              chains: [
                {
                  chainName: 'Arbitrum',
                  chainIconUri:
                    'https://assets.coingecko.com/coins/images/16547/standard/arb.jpg?1721358242',
                },
                {
                  chainName: 'Plasma',
                  chainIconUri:
                    'https://assets.coingecko.com/coins/images/66489/standard/Plasma-symbol-green-1.png?1755142558',
                },
              ],
              protocol: 'Pendle',
              tokenIconUri:
                'https://assets.coingecko.com/coins/images/55857/standard/USDai_Token_Full_Glyph.png?1755229050',
              platformIconUri:
                'https://assets.coingecko.com/coins/images/15069/standard/Pendle_Logo_Normal-03.png?1696514728',
              rewards: [
                { type: 'points', multiplier: 25, reward: 'Allo points' },
                { type: 'apy', percentage: 15, reward: 'APY' },
              ],
            },
          },
        ],
      },
    };

    // Request payment for strategy execution
    // console.log('[Workflow] Requesting payment for strategy execution...');
    // const paymentSettlement = (yield requirePaymentMessage(
    //   'Payment required to execute strategy',
    //   createPaymentRequirements(account.address),
    // )) as PaymentSettlement;
    // console.log('[Workflow] Payment received, payer:', paymentSettlement.payer);

    // Request for initial parameters
    console.log('[Workflow] Pausing for user input (wallet + amount)...');
    const userWalletAndAmount = (yield {
      type: 'interrupted',
      reason: 'input-required',
      message: 'Please confirm the wallet and amount of USDai to be used for the strategy',
      inputSchema: z.object({
        walletAddress: z.templateLiteral(['0x', z.string()]),
        amount: z.string(),
      }),
    }) as { walletAddress: `0x${string}`; amount: string };

    console.log('[Workflow] User wallet and amount:');
    console.dir(userWalletAndAmount, { depth: null });

    yield {
      type: 'status-update',
      message: `Creating delegations for ${userWalletAndAmount.walletAddress} to supply ${userWalletAndAmount.amount} USDai...`,
    };

    // Construct delegations to sign
    const delegations = {
      approveUsdai: createDelegation({
        scope: {
          type: 'functionCall',
          targets: [USDAI_TOKEN.address],
          selectors: ['approve(address, uint256)'],
        },
        to: agentsWallet.address,
        from: userWalletAndAmount.walletAddress,
        environment: agentsWallet.environment,
      }),
      supplyPendle: createDelegation({
        scope: {
          type: 'functionCall',
          targets: [PENDLE_SWAP.address],
          selectors: [PENDLE_SWAP.selector],
        },
        to: agentsWallet.address,
        from: userWalletAndAmount.walletAddress,
        environment: agentsWallet.environment,
      }),
    };

    console.log('[Workflow] Delegations:');
    console.dir(delegations, { depth: null });

    yield {
      type: 'artifact',
      artifact: {
        artifactId: 'delegations-display',
        name: 'delegations-display.json',
        description: 'Delegations that need to be signed to the user',
        parts: [
          {
            kind: 'data',
            data: {
              delegationId: 'approveUsdai',
              name: 'Policy 1: USDai Approval',
              description:
                "This policy enables the agent to approve the user's USDai to be submitted to Pendle. You retain full control over your wallet and can revoke access at any time.",
              policy: 'USDai Approval: Unlimited',
            },
          },
          {
            kind: 'data',
            data: {
              delegationId: 'supplyPendle',
              name: 'Policy 2: Pendle Liquidity Supply',
              description:
                "This policy enables the agent to supply the user's USDai to Pendle. You retain full control over your wallet and can revoke access at any time.",
              policy: 'Pendle Liquidity Supply: Unlimited',
            },
          },
        ],
      },
    };

    // Return artifact for user to sign
    const configArtifact: Artifact = {
      artifactId: 'delegations-data',
      name: 'delegations-data.json',
      description: 'Delegations that need to be signed to the user',
      parts: [
        {
          kind: 'data',
          data: {
            id: 'approveUsdai',
            description: "Allow agent to approve user's USDai to be submitted to Pendle.",
            delegation: delegations.approveUsdai,
          },
        },
        {
          kind: 'data',
          data: {
            id: 'supplyPendle',
            description: "Allow agent to supply user's USDai to Pendle.",
            delegation: delegations.supplyPendle,
          },
        },
      ],
    };
    yield { type: 'artifact', artifact: configArtifact };

    // Wait for user to return signed delegations
    const userSignedDelegations = (yield {
      type: 'interrupted',
      reason: 'input-required',
      message: 'Please sign all delegations and submit them',
      inputSchema: z.object({
        delegations: z.array(z.object({ id: z.string(), signedDelegation: z.string() })),
      }),
      artifact: configArtifact, // Include the delegations artifact as preview
    }) as { delegations: Array<{ id: string; signedDelegation: `0x${string}` }> };

    console.log('[Workflow] User signed delegations:');
    console.dir(userSignedDelegations, { depth: null });

    // Reconstruct signed delegations by merging original delegations with signatures
    const signedDelegationsMap = {
      approveUsdai: {
        ...delegations.approveUsdai,
        signature: userSignedDelegations.delegations.find((d) => d.id === 'approveUsdai')!
          .signedDelegation,
      },
      supplyPendle: {
        ...delegations.supplyPendle,
        signature: userSignedDelegations.delegations.find((d) => d.id === 'supplyPendle')!
          .signedDelegation,
      },
    };

    yield {
      type: 'status-update',
      message: 'Signed delegations received. Simulating some work with progress updates...',
    };

    yield {
      type: 'artifact',
      artifact: {
        artifactId: 'strategy-dashboard-display',
        name: 'strategy-dashboard-display.json',
        description:
          'This strategy optimizes USDai Allopoints via Pendle LPs/PTs across Arbitrum and Plasma',
        parts: [
          {
            kind: 'data',
            data: {
              name: 'USDai Pendle Allo',
              curator: 'Curated by @0xfarmer',
              infoChip: 'USDai Allo Points',
              token: 'USDAi',
              chains: [
                {
                  chainName: 'Arbitrum',
                  chainIconUri:
                    'https://assets.coingecko.com/coins/images/16547/standard/arb.jpg?1721358242',
                },
                {
                  chainName: 'Plasma',
                  chainIconUri:
                    'https://assets.coingecko.com/coins/images/66489/standard/Plasma-symbol-green-1.png?1755142558',
                },
              ],
              protocol: 'Pendle',
              tokenIconUri:
                'https://assets.coingecko.com/coins/images/55857/standard/USDai_Token_Full_Glyph.png?1755229050',
              platformIconUri:
                'https://assets.coingecko.com/coins/images/15069/standard/Pendle_Logo_Normal-03.png?1696514728',
              rewards: [
                { type: 'points', multiplier: 25, reward: 'Allo points' },
                { type: 'apy', percentage: 15, reward: 'APY' },
              ],
              performance: {
                cumlativePoints: '12333',
                totalValueUsd: '510',
              },
            },
          },
        ],
      },
    };

    // Dashboard - Transaction History (empty)
    const usdAiApprovedArtifact: Artifact = {
      artifactId: 'transaction-history-display',
      name: 'transaction-history-display.json',
      description: 'Transaction history for the strategy (streamed)',
      parts: [],
    };
    yield { type: 'artifact', artifact: usdAiApprovedArtifact, append: true };

    // Approve the USDAi if needed
    const exactAmount = parseUnits(userWalletAndAmount.amount, USDAI_TOKEN.decimals);
    // TODO: Use full receipt data in the future (blockNumber, status, gasUsed, etc.)
    // Currently extracting only transactionHash for consistency with DEBUG_MODE
    let approveReciept;
    if (DEBUG_MODE) {
      console.log('[Workflow] DEBUG_MODE: Skipping approval transaction');
      approveReciept = {
        transactionHash: keccak256(toBytes('debug-approval-tx')),
      };
    } else {
      const fullReceipt = await approveTokenDirectStep(
        USDAI_TOKEN.address,
        exactAmount,
        signedDelegationsMap.approveUsdai,
        agentsWallet,
        userWalletAndAmount.walletAddress,
        PENDLE_SWAP.address,
        clients,
      );
      approveReciept = fullReceipt ? { transactionHash: fullReceipt.transactionHash } : undefined;
    }
    if (approveReciept) {
      approveReciept = { transactionHash: approveReciept.transactionHash };
      const usdAiApprovedArtifact: Artifact = {
        artifactId: 'transaction-history-display',
        name: 'transaction-history-display.json',
        description: 'Transaction history for the strategy (streamed)',
        parts: [
          {
            kind: 'data',
            data: {
              type: 'Approval',
              timestamp: new Date().toISOString(),
              token: 'USDAi',
              amount: userWalletAndAmount.amount,
              receiptHash: approveReciept.transactionHash,
              delegationsUsed: ['approveUsdai'],
            },
          },
        ],
      };
      yield { type: 'artifact', artifact: usdAiApprovedArtifact, append: true };
    } else {
      console.log('[Workflow] USDAi already approved...');
    }

    yield {
      type: 'status-update',
      message: `Supplying liquidity for ${userWalletAndAmount.amount} USDai...`,
    };

    // Dashboard - Settings
    yield {
      type: 'artifact',
      artifact: {
        artifactId: 'strategy-settings-display',
        name: 'strategy-settings-display.json',
        description: 'Strategy settings',
        parts: [
          {
            kind: 'data',
            data: {
              name: 'USDai Pendle Allo',
              description:
                'Total funds allocated to this strategy . Can be modified to increase exposure',
              amount: formatUnits(
                parseUnits(userWalletAndAmount.amount, USDAI_TOKEN.decimals) / 2n,
                USDAI_TOKEN.decimals,
              ),
            },
          },
          {
            kind: 'data',
            data: {
              name: 'Max Daily Movements',
              description:
                'The total volume of assets the A I agent is permitted to transfer, swap, or reallocate within a 24-hour period.',
              amount: formatUnits(
                parseUnits(userWalletAndAmount.amount, USDAI_TOKEN.decimals) / 10n,
                USDAI_TOKEN.decimals,
              ),
            },
          },
          {
            kind: 'data',
            data: {
              name: 'Preferred Asset',
              description:
                "The agent will first use the preferred asset to implement the strategy, and if it's unavailable, it will swap from whitelisted assets to fulfill the need.",
              asset: 'USDAi',
            },
          },
        ],
      },
    };

    // Dashboard - Policies
    yield {
      type: 'artifact',
      artifact: {
        artifactId: 'strategy-policies-display',
        name: 'strategy-policies-display.json',
        description: 'Policies for the strategy',
        parts: [
          {
            kind: 'data',
            data: {
              delegationId: 'approveUsdai',
              name: 'Policy 1: USDai Approval',
              assets: ['USDAi'],
              amount: userWalletAndAmount.amount,
            },
          },
          {
            kind: 'data',
            data: {
              delegationId: 'supplyPendle',
              name: 'Policy 2: Pendle Liquidity Supply',
              assets: ['USDAi'],
              amount: userWalletAndAmount.amount,
            },
          },
        ],
      },
    };

    // console.log('[Workflow] Settling payment...');

    // const state = await paymentSettlement.settlePayment(
    //   'Payment completed. Thank you for using the USDAi Points Trading Strategy!',
    //   DEBUG_MODE,
    // );
    // console.log('[Workflow] Payment settled: ', state);
    // yield state;

    for (let i = 0; i < STREAM_LIMIT; i++) {
      console.log('[Workflow] Running execution iteration...', i);
      // Dashboard - Transaction History

      // Supply liquidity
      // TODO: Use full receipt data in the future (blockNumber, status, gasUsed, etc.)
      // Currently extracting only transactionHash for consistency with DEBUG_MODE
      let receipt;
      if (DEBUG_MODE) {
        console.log(`[Workflow] DEBUG_MODE: Skipping supply liquidity transaction ${i + 1}`);
        receipt = {
          transactionHash: keccak256(toBytes(`debug-supply-tx-${i}`)),
        };
      } else {
        console.log('[Workflow] Executing supply liquidity transaction...');
        console.dir(signedDelegationsMap.supplyPendle.signature, { depth: null });
        //console.dir(agentsWallet, { depth: null });
        console.dir(userWalletAndAmount.walletAddress, { depth: null });
        //console.dir(clients, { depth: null });
        //console.dir(PENDLE_SWAP.address, { depth: null });
        //console.dir(PENDLE_SWAP.usdAiPool, { depth: null });
        //console.dir(USDAI_TOKEN.address, { depth: null });
        console.dir(exactAmount, { depth: null });
        const fullReceipt = await executeSupplyUsdaiLiquidity(
          signedDelegationsMap.supplyPendle,
          agentsWallet,
          userWalletAndAmount.walletAddress,
          clients,
          PENDLE_SWAP.address,
          PENDLE_SWAP.usdAiPool,
          USDAI_TOKEN.address,
          exactAmount,
        );
        receipt = { transactionHash: fullReceipt.transactionHash };
        console.dir(receipt, { depth: null });
      }

      const usdAiSupplyArtifact: Artifact = {
        artifactId: 'transaction-history-display',
        name: 'transaction-history-display.json',
        description: 'Transaction history for the strategy (streamed)',
        parts: [
          {
            kind: 'data',
            data: {
              type: 'Supply Liquidity',
              timestamp: new Date().toISOString(),
              token: 'USDAi',
              amount: formatUnits(exactAmount, USDAI_TOKEN.decimals),
              protocol: 'Pendle',
              receiptHash: receipt.transactionHash,
              delegationsUsed: ['supplyPendle'],
            },
          },
        ],
      };
      yield { type: 'artifact', artifact: usdAiSupplyArtifact, append: true };

      await new Promise((resolve) => setTimeout(resolve, STREAM_DELAY_MS));
    }

    // Allow the runtime to mark the task as completed
    return;
  },
};

export default plugin;
