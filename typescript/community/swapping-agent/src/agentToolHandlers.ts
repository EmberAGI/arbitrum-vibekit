import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { parseMcpToolResponsePayload } from '@emberai/arbitrum-vibekit-core';
import { TransactionPlanSchema, type TransactionPlan } from '@emberai/arbitrum-vibekit-core/ember-schemas';
import {
  parseUnits,
  createPublicClient,
  http,
  type Address,
  encodeFunctionData,
  type PublicClient,
} from 'viem';
import { z } from 'zod';

import { getChainConfigById } from './agent.js';

export type TokenInfo = {
  chainId: string;
  address: string;
  decimals: number;
};

export interface HandlerContext {
  mcpClient: Client;
  tokenMap: Record<string, TokenInfo[]>;
  userAddress: string;
  executeAction: (actionName: string, transactions: TransactionPlan[]) => Promise<string>;
  log: (...args: unknown[]) => void;
  quicknodeSubdomain: string;
  quicknodeApiKey: string;
}

function findTokensCaseInsensitive(
  tokenMap: Record<string, TokenInfo[]>,
  tokenName: string
): TokenInfo[] {
  const lowerCaseTokenName = tokenName.toLowerCase();
  for (const key in tokenMap) {
    if (key.toLowerCase() === lowerCaseTokenName) {
      return tokenMap[key]!;
    }
  }
  return [];
}

const chainMappings = [
  { id: '1', name: 'Ethereum', aliases: ['mainnet'] },
  { id: '42161', name: 'Arbitrum', aliases: [] },
  { id: '10', name: 'Optimism', aliases: [] },
  { id: '137', name: 'Polygon', aliases: ['matic'] },
  { id: '8453', name: 'Base', aliases: [] },
];

function mapChainNameToId(chainName: string): string | undefined {
  const normalized = chainName.toLowerCase();
  const found = chainMappings.find(
    mapping => mapping.name.toLowerCase() === normalized || mapping.aliases.includes(normalized)
  );
  return found?.id;
}

function mapChainIdToName(chainId: string): string {
  const found = chainMappings.find(mapping => mapping.id === chainId);
  return found?.name || chainId;
}

function findTokenDetail(
  tokenName: string,
  optionalChainName: string | undefined,
  tokenMap: Record<string, TokenInfo[]>,
  direction: 'from' | 'to'
): TokenInfo | string {
  const tokens = findTokensCaseInsensitive(tokenMap, tokenName);
  if (tokens.length === 0) {
    throw new Error(`Token ${tokenName} not supported.`);
  }

  let tokenDetail: TokenInfo | undefined;

  if (optionalChainName) {
    const chainId = mapChainNameToId(optionalChainName);
    if (!chainId) {
      throw new Error(`Chain name ${optionalChainName} is not recognized.`);
    }
    tokenDetail = tokens.find(token => token.chainId === chainId);
    if (!tokenDetail) {
      throw new Error(
        `Token ${tokenName} not supported on chain ${optionalChainName}. Available chains: ${tokens.map(t => mapChainIdToName(t.chainId)).join(', ')}`
      );
    }
  } else {
    if (tokens.length > 1) {
      const chainList = tokens
        .map((t, idx) => `${idx + 1}. ${mapChainIdToName(t.chainId)}`)
        .join('\n');
      return `Multiple chains supported for ${tokenName}:\n${chainList}\nPlease specify the '${direction}Chain'.`;
    }
    tokenDetail = tokens[0];
  }

  if (!tokenDetail) {
    throw new Error(
      `Could not resolve token details for ${tokenName} ${optionalChainName ? 'on chain ' + optionalChainName : ''}.`
    );
  }

  return tokenDetail;
}

async function validateAndExecuteAction(
  actionName: string,
  rawTransactions: unknown,
  context: HandlerContext
): Promise<string> {
  const validationResult = z.array(TransactionPlanSchema).safeParse(rawTransactions);
  if (!validationResult.success) {
    const errorMsg = `MCP tool '${actionName}' returned invalid transaction data.`;
    context.log('Validation Error:', errorMsg, validationResult.error);
    throw new Error(errorMsg);
  }
  return await context.executeAction(actionName, validationResult.data);
}

const minimalErc20Abi = [
  {
    constant: true,
    inputs: [
      { name: '_owner', type: 'address' },
      { name: '_spender', type: 'address' },
    ],
    name: 'allowance',
    outputs: [{ name: '', type: 'uint256' }],
    payable: false,
    stateMutability: 'view',
    type: 'function',
  },
  {
    constant: false,
    inputs: [
      { name: '_spender', type: 'address' },
      { name: '_value', type: 'uint256' },
    ],
    name: 'approve',
    outputs: [{ name: '', type: 'bool' }],
    payable: false,
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const;

export async function handleSwapTokens(
  params: {
    fromToken: string;
    toToken: string;
    amount: string;
    fromChain?: string;
    toChain?: string;
  },
  context: HandlerContext
): Promise<string> {
  const { fromToken, toToken, amount, fromChain, toChain } = params;

  const fromTokenResult = findTokenDetail(fromToken, fromChain, context.tokenMap, 'from');
  if (typeof fromTokenResult === 'string') {
    return fromTokenResult;
  }
  const fromTokenDetail = fromTokenResult;

  const toTokenResult = findTokenDetail(toToken, toChain, context.tokenMap, 'to');
  if (typeof toTokenResult === 'string') {
    return toTokenResult;
  }
  const toTokenDetail = toTokenResult;

  const atomicAmount = parseUnits(amount, fromTokenDetail.decimals);

  context.log(
    `Executing swap via MCP: ${fromToken} (address: ${fromTokenDetail.address}, chain: ${fromTokenDetail.chainId}) to ${toToken} (address: ${toTokenDetail.address}, chain: ${toTokenDetail.chainId}), amount: ${amount}, atomicAmount: ${atomicAmount}, userAddress: ${context.userAddress}`
  );

  const rawTransactions = await context.mcpClient.callTool({
    name: 'swapTokens',
    arguments: {
      fromTokenAddress: fromTokenDetail.address,
      fromTokenChainId: fromTokenDetail.chainId,
      toTokenAddress: toTokenDetail.address,
      toTokenChainId: toTokenDetail.chainId,
      amount: atomicAmount.toString(),
      userAddress: context.userAddress,
    },
  });

  const dataToValidate = parseMcpToolResponsePayload(rawTransactions, z.any());

  if (!Array.isArray(dataToValidate) || dataToValidate.length === 0) {
    context.log('Invalid or empty transaction plan received from MCP tool:', dataToValidate);
    if (
      typeof dataToValidate === 'object' &&
      dataToValidate !== null &&
      'error' in dataToValidate
    ) {
      throw new Error(`MCP tool returned an error: ${JSON.stringify(dataToValidate)}`);
    }
    throw new Error('Expected a transaction plan array from MCP tool, but received invalid data.');
  }

  const swapTx = dataToValidate[0] as TransactionPlan;
  if (!swapTx || typeof swapTx !== 'object' || !swapTx.to) {
    context.log('Invalid swap transaction object received from MCP:', swapTx);
    throw new Error('Invalid swap transaction structure in plan.');
  }

  const spenderAddress = swapTx.to as Address;
  const txChainId = fromTokenDetail.chainId;
  const fromTokenAddress = fromTokenDetail.address as Address;
  const userAddress = context.userAddress as Address;

  context.log(
    `Checking allowance: User ${userAddress} needs to allow Spender ${spenderAddress} to spend ${atomicAmount} of Token ${fromTokenAddress} on Chain ${txChainId}`
  );

  let tempPublicClient: PublicClient;
  try {
    const chainConfig = getChainConfigById(txChainId);
    const networkSegment = chainConfig.quicknodeSegment;
    const targetChain = chainConfig.viemChain;
    let dynamicRpcUrl: string;
    if (networkSegment === '') {
      dynamicRpcUrl = `https://${context.quicknodeSubdomain}.quiknode.pro/${context.quicknodeApiKey}`;
    } else {
      dynamicRpcUrl = `https://${context.quicknodeSubdomain}.${networkSegment}.quiknode.pro/${context.quicknodeApiKey}`;
    }
    tempPublicClient = createPublicClient({
      chain: targetChain,
      transport: http(dynamicRpcUrl),
    });
    context.log(`Public client created for chain ${txChainId} via ${dynamicRpcUrl.split('/')[2]}`);
  } catch (chainError) {
    context.log(`Failed to create public client for chain ${txChainId}:`, chainError);
    throw new Error(`Unsupported chain or configuration error for chainId ${txChainId}.`);
  }

  let currentAllowance: bigint = 0n;
  try {
    currentAllowance = await tempPublicClient.readContract({
      address: fromTokenAddress,
      abi: minimalErc20Abi,
      functionName: 'allowance',
      args: [userAddress, spenderAddress],
    });
    context.log(`Successfully read allowance: ${currentAllowance}. Required: ${atomicAmount}`);
  } catch (readError) {
    context.log(
      `Warning: Failed to read allowance via readContract (eth_call may be unsupported). Error: ${(readError as Error).message}`
    );
    context.log('Assuming allowance is insufficient due to check failure.');
  }

  if (currentAllowance < atomicAmount) {
    context.log(
      `Insufficient allowance or check failed. Need ${atomicAmount}, have ${currentAllowance}. Creating approval transaction...`
    );
    const approveTx: TransactionPlan = {
      to: fromTokenAddress,
      data: encodeFunctionData({
        abi: minimalErc20Abi,
        functionName: 'approve',
        args: [spenderAddress, BigInt(2) ** BigInt(256) - BigInt(1)],
      }),
      value: '0',
      chainId: txChainId,
    };

    try {
      context.log(
        `Executing approval transaction for ${params.fromToken} to spender ${spenderAddress}...`
      );
      const approvalResult = await context.executeAction('approve', [approveTx]);
      context.log(
        `Approval transaction sent: ${approvalResult}. Note: Ensure confirmation before proceeding if needed.`
      );
    } catch (approvalError) {
      context.log(`Approval transaction failed:`, approvalError);
      throw new Error(
        `Failed to approve token ${params.fromToken}: ${(approvalError as Error).message}`
      );
    }
  } else {
    context.log('Sufficient allowance already exists.');
  }

  context.log('Proceeding to execute the swap transaction received from MCP tool...');

  if (Array.isArray(dataToValidate) && dataToValidate.length > 0) {
    const swapTxPlan = dataToValidate[0] as Partial<TransactionPlan>;
    if (swapTxPlan && typeof swapTxPlan === 'object' && !swapTxPlan.chainId) {
      context.log(`Adding missing chainId (${txChainId}) to swap transaction plan.`);
      swapTxPlan.chainId = txChainId;
    }
  }

  return await validateAndExecuteAction('swapTokens', dataToValidate, context);
}
