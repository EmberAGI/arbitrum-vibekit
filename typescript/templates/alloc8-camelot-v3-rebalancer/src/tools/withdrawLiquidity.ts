import { z } from 'zod';
import type { VibkitToolDefinition } from 'arbitrum-vibekit-core';
import { createSuccessTask, createErrorTask } from 'arbitrum-vibekit-core';
import type { Task, Message } from '@google-a2a/types';
import type { RebalancerContext } from '../context/types.js';
import type { TransactionResult } from '../config/types.js';
import {
  createPublicClient,
  createWalletClient,
  http,
  type Address,
  type Abi,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { arbitrum } from 'viem/chains';

const withdrawLiquidityParametersSchema = z.object({
  positionId: z.string().describe('Position ID to withdraw liquidity from'),
  collectFees: z.boolean().optional().default(true).describe('Whether to collect accumulated fees'),
});

type WithdrawLiquidityParams = z.infer<typeof withdrawLiquidityParametersSchema>;

// Battle-tested ABI from test-camelot-pos.ts
const ALGEBRA_POSITION_MANAGER: Address = '0x00c7f3082833e796A5b3e4Bd59f6642FF44DCD15';

const algebraPositionManagerAbi = [
  // view: positions
  {
    inputs: [{ internalType: 'uint256', name: 'tokenId', type: 'uint256' }],
    name: 'positions',
    outputs: [
      { internalType: 'uint96', name: 'nonce', type: 'uint96' },
      { internalType: 'address', name: 'operator', type: 'address' },
      { internalType: 'address', name: 'token0', type: 'address' },
      { internalType: 'address', name: 'token1', type: 'address' },
      { internalType: 'int24', name: 'tickLower', type: 'int24' },
      { internalType: 'int24', name: 'tickUpper', type: 'int24' },
      { internalType: 'uint128', name: 'liquidity', type: 'uint128' },
      { internalType: 'uint256', name: 'feeGrowthInside0LastX128', type: 'uint256' },
      { internalType: 'uint256', name: 'feeGrowthInside1LastX128', type: 'uint256' },
      { internalType: 'uint128', name: 'tokensOwed0', type: 'uint128' },
      { internalType: 'uint128', name: 'tokensOwed1', type: 'uint128' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  // decreaseLiquidity
  {
    name: 'decreaseLiquidity',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      {
        name: 'params',
        type: 'tuple',
        components: [
          { name: 'tokenId', type: 'uint256' },
          { name: 'liquidity', type: 'uint128' },
          { name: 'amount0Min', type: 'uint256' },
          { name: 'amount1Min', type: 'uint256' },
          { name: 'deadline', type: 'uint256' },
        ],
      },
    ],
    outputs: [],
  },
  // collect
  {
    name: 'collect',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      {
        name: 'params',
        type: 'tuple',
        components: [
          { name: 'tokenId', type: 'uint256' },
          { name: 'recipient', type: 'address' },
          { name: 'amount0Max', type: 'uint128' },
          { name: 'amount1Max', type: 'uint128' },
        ],
      },
    ],
    outputs: [
      { name: 'amount0', type: 'uint256' },
      { name: 'amount1', type: 'uint256' },
    ],
  },
  // burn
  {
    name: 'burn',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [],
  },
] as const satisfies Abi;

export type PositionTuple = readonly [
  nonce: bigint,
  operator: Address,
  token0: Address,
  token1: Address,
  tickLower: number,
  tickUpper: number,
  liquidity: bigint,
  feeGrowthInside0LastX128: bigint,
  feeGrowthInside1LastX128: bigint,
  tokensOwed0: bigint,
  tokensOwed1: bigint,
];

/**
 * Get position data from contract
 */
async function getAlgebraPosition(
  tokenId: number | bigint,
  publicClient: ReturnType<typeof createPublicClient>
): Promise<PositionTuple> {
  const pos = await publicClient.readContract({
    address: ALGEBRA_POSITION_MANAGER,
    abi: algebraPositionManagerAbi,
    functionName: 'positions',
    args: [BigInt(tokenId)],
  });

  const t = pos as unknown as PositionTuple;

  console.log('Algebra Position:', {
    token0: t[2],
    token1: t[3],
    tickLower: t[4],
    tickUpper: t[5],
    liquidity: t[6].toString(),
    tokensOwed0: t[9].toString(),
    tokensOwed1: t[10].toString(),
  });

  return t;
}

/**
 * Withdraw liquidity from a Camelot v3 position using battle-tested logic
 */
export const withdrawLiquidityTool: VibkitToolDefinition<
  typeof withdrawLiquidityParametersSchema,
  Task | Message,
  RebalancerContext
> = {
  name: 'withdrawLiquidity',
  description: 'Withdraw liquidity from a Camelot v3 concentrated liquidity position',
  parameters: withdrawLiquidityParametersSchema,

  execute: async (params: WithdrawLiquidityParams, context: { custom: RebalancerContext }) => {
    try {
      console.log(`🔄 Withdrawing liquidity from position: ${params.positionId}`);

      // Get wallet address from private key
      const { getWalletAddressFromPrivateKey } = await import('../utils/walletUtils.js');
      const walletAddress = getWalletAddressFromPrivateKey(context.custom.config.walletPrivateKey);

      // Setup viem clients
      const publicClient = createPublicClient({
        chain: arbitrum,
        transport: http(context.custom.config.arbitrumRpcUrl),
      });

      const privateKey = context.custom.config.walletPrivateKey.startsWith('0x')
        ? (context.custom.config.walletPrivateKey as `0x${string}`)
        : (`0x${context.custom.config.walletPrivateKey}` as `0x${string}`);

      const account = privateKeyToAccount(privateKey);
      const walletClient = createWalletClient({
        account,
        chain: arbitrum,
        transport: http(context.custom.config.arbitrumRpcUrl),
      });

      console.log(`🔑 Wallet address: ${account.address}`);

      // Get position data
      const pos = await getAlgebraPosition(parseInt(params.positionId), publicClient);
      let liquidity = pos[6];
      let tokensOwed0 = pos[9];
      let tokensOwed1 = pos[10];

      if (liquidity === 0n && tokensOwed0 === 0n && tokensOwed1 === 0n) {
        console.log('⚠️ Position already empty');
        return createSuccessTask(
          'withdrawLiquidity',
          [
            {
              artifactId: 'withdrawLiquidity-' + Date.now(),
              parts: [
                {
                  kind: 'text',
                  text: JSON.stringify({
                    success: true,
                    transactionHash: 'none',
                    gasUsed: '0',
                    message: 'Position already empty',
                  }),
                },
              ],
            },
          ],
          'Position already empty'
        );
      }

      const MAX_UINT128 = (1n << 128n) - 1n;
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 60 * 10);

      // Get latest nonce
      let nonce = await publicClient.getTransactionCount({
        address: account.address as Address,
        blockTag: 'pending',
      });

      const transactionHashes: string[] = [];

      // 1) Decrease liquidity if > 0
      if (liquidity > 0n) {
        console.log('🔄 Decreasing liquidity...');
        const decTxHash = await walletClient.writeContract({
          address: ALGEBRA_POSITION_MANAGER,
          abi: algebraPositionManagerAbi,
          functionName: 'decreaseLiquidity',
          args: [
            {
              tokenId: BigInt(params.positionId),
              liquidity,
              amount0Min: 0n,
              amount1Min: 0n,
              deadline,
            },
          ],
          account,
          nonce,
        });
        console.log('✅ Decrease liquidity tx:', decTxHash);
        await publicClient.waitForTransactionReceipt({ hash: decTxHash });
        transactionHashes.push(decTxHash);
        nonce++;
      }

      // 2) Collect tokens + fees
      console.log('🔄 Collecting tokens and fees...');
      const collectTxHash = await walletClient.writeContract({
        address: ALGEBRA_POSITION_MANAGER,
        abi: algebraPositionManagerAbi,
        functionName: 'collect',
        args: [
          {
            tokenId: BigInt(params.positionId),
            recipient: account.address as Address,
            amount0Max: MAX_UINT128,
            amount1Max: MAX_UINT128,
          },
        ],
        account,
        nonce,
      });
      console.log('✅ Collect tx:', collectTxHash);
      await publicClient.waitForTransactionReceipt({ hash: collectTxHash });
      transactionHashes.push(collectTxHash);
      nonce++;

      // 3) Refresh position and burn if empty
      const posAfter = await getAlgebraPosition(parseInt(params.positionId), publicClient);
      liquidity = posAfter[6];
      tokensOwed0 = posAfter[9];
      tokensOwed1 = posAfter[10];

      if (liquidity === 0n && tokensOwed0 === 0n && tokensOwed1 === 0n) {
        console.log('🔥 Burning empty position...');
        const burnTxHash = await walletClient.writeContract({
          address: ALGEBRA_POSITION_MANAGER,
          abi: algebraPositionManagerAbi,
          functionName: 'burn',
          args: [BigInt(params.positionId)],
          account,
          nonce,
        });
        console.log('🔥 Burn tx:', burnTxHash);
        await publicClient.waitForTransactionReceipt({ hash: burnTxHash });
        transactionHashes.push(burnTxHash);
      } else {
        console.log('ℹ️ Position still has value, skipping burn');
      }

      // Prepare result
      const result: TransactionResult = {
        success: true,
        transactionHash: transactionHashes[transactionHashes.length - 1] || 'unknown',
        gasUsed: '0', // Could be calculated from receipts if needed
        error: undefined,
      };

      console.log(`🎉 Liquidity withdrawal completed successfully!`);
      console.log(`   Transactions: ${transactionHashes.length}`);
      console.log(`   Final TX: ${result.transactionHash}`);

      return createSuccessTask(
        'withdrawLiquidity',
        [
          {
            artifactId: 'withdrawLiquidity-' + Date.now(),
            parts: [{ kind: 'text', text: JSON.stringify(result) }],
          },
        ],
        'Operation completed successfully'
      );
    } catch (error) {
      console.error('❌ Error withdrawing liquidity:', error);
      return createErrorTask(
        'withdrawLiquidity',
        error instanceof Error ? error : new Error(`Failed to withdraw liquidity: ${error}`)
      );
    }
  },
};
