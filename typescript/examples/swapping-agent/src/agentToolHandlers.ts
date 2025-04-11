// Remove import from emberai-mcp index.js since we can't access it
// import {
//   // No longer directly importing from emberai-mcp
//   // ToolFunctions,
//   // TransactionPlan,
//   // GetWalletPositionsResponse,
//   // CapabilityType,
// } from "../../../typescript/mcp-tools/emberai-mcp/index.js";

import { z } from 'zod';
import {
  parseUnits,
  createPublicClient,
  http,
  type Address,
  erc20Abi,
  encodeFunctionData,
  type PublicClient,
} from 'viem';
import { getChainConfigById } from './agent.js'; // Assuming chainIdMap is accessible via agent export

// Add a type alias for token information
export type TokenInfo = {
  chainId: string;
  address: string;
  decimals: number;
};

// Define a minimal MCPClient interface to match @modelcontextprotocol/sdk Client
interface MCPClient {
  callTool: (params: {
    name: string;
    arguments: Record<string, any>;
    _meta?: Record<string, unknown>;
  }) => Promise<any>;
  close: () => Promise<void>;
}

// Define Zod schema for TransactionPlan
export const TransactionPlanSchema = z
  .object({
    to: z.string(),
    data: z.string(),
    value: z.string().optional(),
    chainId: z.string(),
    // Add other fields if needed based on actual server response
  })
  .passthrough(); // Allow unknown fields
// Infer type for use in handlers
export type TransactionPlan = z.infer<typeof TransactionPlanSchema>;

// --- Handler Context Type ---

// Defines the state/methods handlers receive from the Agent
export interface HandlerContext {
  mcpClient: MCPClient;
  tokenMap: Record<string, TokenInfo[]>;
  userAddress: string;
  executeAction: (actionName: string, transactions: TransactionPlan[]) => Promise<string>;
  log: (...args: unknown[]) => void;
  quicknodeSubdomain: string;
  quicknodeApiKey: string;
}

// Helper function for case-insensitive token lookup
function findTokensCaseInsensitive(
  tokenMap: Record<string, TokenInfo[]>,
  tokenName: string
): TokenInfo[] {
  const lowerCaseTokenName = tokenName.toLowerCase();
  for (const key in tokenMap) {
    if (key.toLowerCase() === lowerCaseTokenName) {
      return tokenMap[key];
    }
  }
  return [];
}

// Define the single source of truth for chain mappings
// Insert this near the top of the file, replacing the two old map functions

// CHAIN MAPPING START
const chainMappings = [
  { id: '1', name: 'Ethereum', aliases: ['mainnet'] },
  { id: '42161', name: 'Arbitrum', aliases: [] },
  { id: '10', name: 'Optimism', aliases: [] },
  { id: '137', name: 'Polygon', aliases: ['matic'] },
  { id: '8453', name: 'Base', aliases: [] },
  // Add more chains here
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
  // Return the canonical name, or the ID itself if not found
  return found?.name || chainId;
}
// CHAIN MAPPING END

// --- Stateless Handler Functions ---

// Helper function for validating transaction results
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
  // Use validated data
  return await context.executeAction(actionName, validationResult.data);
}

// Re-add Minimal ERC20 ABI for allowance and approve
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
] as const; // Use 'as const' for stricter typing with viem

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

  const fromTokens = findTokensCaseInsensitive(context.tokenMap, fromToken);
  if (fromTokens.length === 0) {
    throw new Error(`Token ${fromToken} not supported.`);
  }
  let fromTokenDetail;
  if (fromChain) {
    const fromChainId = mapChainNameToId(fromChain);
    if (!fromChainId) {
      throw new Error(`Chain name ${fromChain} is not recognized.`);
    }
    fromTokenDetail = fromTokens.find(token => token.chainId === fromChainId);
    if (!fromTokenDetail) {
      throw new Error(
        `Token ${fromToken} not supported on chain ${fromChain}. Available chains: ${fromTokens.map(t => t.chainId).join(', ')}`
      );
    }
  } else {
    if (fromTokens.length > 1) {
      const chainList = fromTokens
        .map((t, idx) => `${idx + 1}. ${mapChainIdToName(t.chainId)}`)
        .join('\n');
      return `Multiple tokens supported for ${fromToken} on chains:\n${chainList}\nPlease specify 'fromChain'.`;
    }
    fromTokenDetail = fromTokens[0];
  }

  const toTokens = findTokensCaseInsensitive(context.tokenMap, toToken);
  if (toTokens.length === 0) {
    throw new Error(`Token ${toToken} not supported.`);
  }
  let toTokenDetail;
  if (toChain) {
    const toChainId = mapChainNameToId(toChain);
    if (!toChainId) {
      throw new Error(`Chain name ${toChain} is not recognized.`);
    }
    toTokenDetail = toTokens.find(token => token.chainId === toChainId);
    if (!toTokenDetail) {
      throw new Error(
        `Token ${toToken} not supported on chain ${toChain}. Available chains: ${toTokens.map(t => t.chainId).join(', ')}`
      );
    }
  } else {
    if (toTokens.length > 1) {
      const chainList = toTokens
        .map((t, idx) => `${idx + 1}. ${mapChainIdToName(t.chainId)}`)
        .join('\n');
      return `Multiple tokens supported for ${toToken} on chains:\n${chainList}\nPlease specify 'toChain'.`;
    }
    toTokenDetail = toTokens[0];
  }

  // Convert amount to atomic units using fromTokenDetail.decimals
  const atomicAmount = parseUnits(amount, fromTokenDetail.decimals);

  context.log(
    `Executing swap via MCP: ${fromToken} (address: ${fromTokenDetail.address}, chain: ${fromTokenDetail.chainId}) to ${toToken} (address: ${toTokenDetail.address}, chain: ${toTokenDetail.chainId}), amount: ${amount}, atomicAmount: ${atomicAmount}, userAddress: ${context.userAddress}`
  );

  // Fetch the transaction plan from the MCP tool
  const rawTransactions = await context.mcpClient.callTool({
    name: 'swapTokens',
    arguments: {
      fromTokenAddress: fromTokenDetail.address,
      fromTokenChainId: fromTokenDetail.chainId,
      toTokenAddress: toTokenDetail.address,
      toTokenChainId: toTokenDetail.chainId,
      amount: atomicAmount.toString(), // Send atomic amount
      userAddress: context.userAddress,
    },
  });

  // --- Start Edit: Unwrap potential nested structure ---
  let dataToValidate: unknown;

  if (
    rawTransactions &&
    typeof rawTransactions === 'object' &&
    'content' in rawTransactions &&
    Array.isArray((rawTransactions as any).content) &&
    (rawTransactions as any).content.length > 0 &&
    (rawTransactions as any).content[0]?.type === 'text' &&
    typeof (rawTransactions as any).content[0]?.text === 'string'
  ) {
    context.log('Raw swapTokens result has nested structure, parsing inner text...');
    try {
      const parsedData = JSON.parse((rawTransactions as any).content[0].text);
      context.log('Parsed inner text content for validation:', parsedData);
      if (Array.isArray(parsedData)) {
        dataToValidate = parsedData;
      } else {
        context.log('Parsed inner data is not an array, validating structure as is.');
        dataToValidate = parsedData;
      }
    } catch (e) {
      context.log('Error parsing inner text content from swapTokens result:', e);
      throw new Error(
        `Failed to parse nested JSON response from swapTokens: ${(e as Error).message}`
      );
    }
  } else {
    context.log('Raw swapTokens result does not have expected nested structure, validating as is.');
    dataToValidate = rawTransactions;
    if (Array.isArray(rawTransactions)) {
      // Log length for debugging if needed
      // context.log('Number of transactions received from MCP (direct):', (dataToValidate as any[]).length);
    }
  }
  // --- End Edit ---

  // --- Custom Allowance Check Logic ---

  // Validate the structure received (expecting an array)
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

  // We know MCP returns a single tx plan, which is the swap itself.
  const swapTx = dataToValidate[0] as TransactionPlan;
  if (!swapTx || typeof swapTx !== 'object' || !swapTx.to) {
    context.log('Invalid swap transaction object received from MCP:', swapTx);
    throw new Error('Invalid swap transaction structure in plan.');
  }

  // Spender is the recipient of the swap transaction
  const spenderAddress = swapTx.to as Address;
  // Chain ID comes from the source token, as MCP response lacks it
  const txChainId = fromTokenDetail.chainId;
  const fromTokenAddress = fromTokenDetail.address as Address;
  const userAddress = context.userAddress as Address;

  context.log(
    `Checking allowance: User ${userAddress} needs to allow Spender ${spenderAddress} to spend ${atomicAmount} of Token ${fromTokenAddress} on Chain ${txChainId}`
  );

  // Create Public Client for the check
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

  // --- Attempt Allowance Read ---
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
    // currentAllowance remains 0n, forcing approval attempt below
  }

  // --- Approve if Necessary ---
  if (currentAllowance < atomicAmount) {
    context.log(
      `Insufficient allowance or check failed. Need ${atomicAmount}, have ${currentAllowance}. Creating approval transaction...`
    );
    const approveTx: TransactionPlan = {
      to: fromTokenAddress,
      data: encodeFunctionData({
        abi: minimalErc20Abi,
        functionName: 'approve',
        args: [spenderAddress, BigInt(2) ** BigInt(256) - BigInt(1)], // Max allowance
      }),
      value: '0',
      chainId: txChainId, // Use inferred chain ID
    };

    try {
      context.log(
        `Executing approval transaction for ${params.fromToken} to spender ${spenderAddress}...`
      );
      // IMPORTANT: Execute *only* the approval here
      const approvalResult = await context.executeAction('approve', [approveTx]);
      context.log(
        `Approval transaction sent: ${approvalResult}. Note: Ensure confirmation before proceeding if needed.`
      );
      // Depending on executeAction implementation, might need to wait for confirmation here.
    } catch (approvalError) {
      context.log(`Approval transaction failed:`, approvalError);
      throw new Error(
        `Failed to approve token ${params.fromToken}: ${(approvalError as Error).message}`
      );
    }
  } else {
    context.log('Sufficient allowance already exists.');
  }

  // --- Execute Original Swap Transaction Plan ---
  context.log('Proceeding to execute the swap transaction received from MCP tool...');

  // Add the inferred chainId to the transaction plan before final validation/execution
  if (Array.isArray(dataToValidate) && dataToValidate.length > 0) {
    // Assuming the first (and likely only) tx is the swap tx
    const swapTxPlan = dataToValidate[0] as Partial<TransactionPlan>; // Use partial to avoid type errors before assignment
    if (swapTxPlan && typeof swapTxPlan === 'object' && !swapTxPlan.chainId) {
      context.log(`Adding missing chainId (${txChainId}) to swap transaction plan.`);
      swapTxPlan.chainId = txChainId;
    }
    // If there were multiple transactions, loop through dataToValidate and add chainId if needed
  }

  // Pass the potentially unwrapped and now chainId-populated data to validation
  return await validateAndExecuteAction('swapTokens', dataToValidate, context);
}
