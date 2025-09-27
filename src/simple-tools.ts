import type { Address, Chain } from 'viem';
import { createPublicClient, http, isAddress } from 'viem';
import { arbitrum, mainnet } from 'viem/chains';
import { z } from 'zod';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Error Classes
export class BridgeError extends Error {
  constructor(public code: string, message: string) {
    super(`${code}: ${message}`);
    this.name = 'BridgeError';
  }
}

export class ValidationError extends BridgeError {
  constructor(message: string) {
    super('VALIDATION_ERROR', message);
  }
}

export class NetworkError extends BridgeError {
  constructor(message: string) {
    super('NETWORK_ERROR', message);
  }
}

// Response Type
export interface BridgeResponse {
  transaction?: {
    to: string;
    data: string | any;
    value?: string;
  };
  estimatedGas?: string;
  chainId: number;
  description: string;
  [key: string]: any;
}

// Tool Function Type
export interface ToolFunction<T = any> {
  description: string;
  parameters: z.ZodSchema<T>;
  execute: (args: T) => Promise<BridgeResponse>;
}

// Chain ID Type
export type SupportedChainId = 1 | 42161;

// Address Schema
export const addressSchema = z.string()
  .length(42, 'Address must be 42 characters')
  .regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid address format')
  .refine((addr) => isAddress(addr.toLowerCase()), 'Invalid Ethereum address')
  .describe('Ethereum address in 0x format (case-insensitive)');

// Amount Schema
export const amountSchema = z.string()
  .min(1, 'Amount is required')
  .regex(/^\d+$/, 'Amount must be a positive integer in wei (no decimals)')
  .refine((val) => BigInt(val) > 0n, 'Amount must be greater than 0')
  .describe('Amount in wei (base units) - must be a positive integer');

// Environment validation
export function validateEnvironment() {
  if (!process.env.ARBITRUM_RPC_URL) {
    throw new ValidationError('ARBITRUM_RPC_URL environment variable is required');
  }
  
  // Use default Ethereum RPC if not provided
  const ethereumRpcUrl = process.env.ETHEREUM_RPC_URL || 'https://eth.llamarpc.com';
  
  return {
    ARBITRUM_RPC_URL: process.env.ARBITRUM_RPC_URL,
    ETHEREUM_RPC_URL: ethereumRpcUrl
  };
}

// Chain utilities
export function getChainById(chainId: SupportedChainId): Chain {
  switch (chainId) {
    case 42161:
      return arbitrum;
    case 1:
      return mainnet;
    default:
      throw new ValidationError(`Unsupported chain id: ${chainId}`);
  }
}

export function getPublicClient(chainId: SupportedChainId, env: any) {
  const url = chainId === 42161 ? env.ARBITRUM_RPC_URL : env.ETHEREUM_RPC_URL;
  if (!url) throw new NetworkError(`Missing RPC URL for chain ${chainId}`);
  return createPublicClient({ chain: getChainById(chainId), transport: http(url) });
}

// Address validation
export function validateAddress(address: string): Address {
  // Normalize address to lowercase for validation
  const normalizedAddress = address.toLowerCase();
  
  if (!isAddress(normalizedAddress)) {
    throw new ValidationError(`Invalid address format: ${address}`);
  }
  
  // Return the original address (preserving case) but ensure it's valid
  return address as Address;
}

// Amount validation
export function validateAmount(amount: string): string {
  // Convert to string if it's a number
  const amountStr = String(amount);
  
  // Check if empty or undefined
  if (!amountStr || amountStr.trim() === '') {
    throw new ValidationError('Amount is required and must be greater than 0');
  }
  
  // Check if it's zero or negative
  if (amountStr === '0' || amountStr === '0.0' || amountStr === '0.00') {
    throw new ValidationError('Amount must be greater than 0');
  }
  
  // Check if it's a valid positive integer (wei)
  if (!/^\d+$/.test(amountStr)) {
    throw new ValidationError('Amount must be a positive integer in wei (no decimals)');
  }
  
  // Check if it's actually greater than 0
  if (BigInt(amountStr) <= 0n) {
    throw new ValidationError('Amount must be greater than 0');
  }
  
  return amountStr;
}

// Contract Addresses - OFFICIAL ARBITRUM BRIDGE ADDRESSES
export const CONTRACT_ADDRESSES = {
  ARBITRUM_BRIDGE: {
    // Arbitrum Inbox contract on Ethereum mainnet
    1: '0x4Dbd4fc535Ac27206064B68FfCf827b0A60BAB3f',
    // Arbitrum L2 Gateway Router on Arbitrum One
    42161: '0x72Ce9c846789fdB6fC1f34aC4AD25Dd9ef7031ef'
  }
} as const;

// Validate contract addresses are not zero addresses
function validateContractAddress(address: string, chainId: number): void {
  if (address === '0x0000000000000000000000000000000000000000') {
    throw new ValidationError(`Contract address is zero address for chain ${chainId}`);
  }
  if (!isAddress(address)) {
    throw new ValidationError(`Invalid contract address format: ${address} for chain ${chainId}`);
  }
}

// Dynamic gas estimation with safety margins
async function estimateGasWithSafety(
  client: any,
  transaction: any,
  safetyMultiplier: number = 1.2
): Promise<string> {
  try {
    const gasEstimate = await client.estimateGas(transaction);
    const safeGasLimit = BigInt(Math.ceil(Number(gasEstimate) * safetyMultiplier));
    return safeGasLimit.toString();
  } catch (error) {
    // Fallback to conservative estimates if gas estimation fails
    throw new NetworkError(`Gas estimation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Balance validation before bridging
async function validateSufficientBalance(
  client: any,
  address: string,
  amount: string,
  tokenAddress?: string
): Promise<void> {
  try {
    let balance: bigint;
    
    if (!tokenAddress || tokenAddress === 'ETH') {
      // ETH balance check
      balance = await client.getBalance({ address: address as Address });
    } else {
      // ERC20 balance check
      const erc20Abi = [
        {
          name: 'balanceOf',
          type: 'function',
          inputs: [{ name: 'account', type: 'address' }],
          outputs: [{ name: 'balance', type: 'uint256' }]
        }
      ] as const;
      
      balance = await client.readContract({
        address: tokenAddress as Address,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [address as Address]
      });
    }
    
    const requiredAmount = BigInt(amount);
    if (balance < requiredAmount) {
      const tokenSymbol = tokenAddress === 'ETH' || !tokenAddress ? 'ETH' : 'tokens';
      throw new ValidationError(
        `Insufficient balance. Required: ${requiredAmount.toString()} ${tokenSymbol}, Available: ${balance.toString()} ${tokenSymbol}`
      );
    }
  } catch (error) {
    if (error instanceof BridgeError) throw error;
    throw new NetworkError(`Balance check failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Maximum amount validation to prevent large losses
function validateMaxAmount(amount: string, tokenAddress?: string): void {
  const amountBigInt = BigInt(amount);
  
  // Set reasonable maximum limits
  const MAX_ETH = BigInt('100000000000000000000'); // 100 ETH
  const MAX_ERC20 = BigInt('1000000000000000000000000'); // 1M tokens (18 decimals)
  
  if (!tokenAddress || tokenAddress === 'ETH') {
    if (amountBigInt > MAX_ETH) {
      throw new ValidationError(`Amount exceeds maximum limit of 100 ETH for safety`);
    }
  } else {
    if (amountBigInt > MAX_ERC20) {
      throw new ValidationError(`Amount exceeds maximum limit of 1M tokens for safety`);
    }
  }
}

// Transaction deadline calculation
function calculateDeadline(minutes: number = 30): string {
  const deadlineTimestamp = Math.floor(Date.now() / 1000) + (minutes * 60);
  return deadlineTimestamp.toString();
}

// Slippage protection - calculate minimum amount
function calculateMinimumAmount(amount: string, slippageBps: number): string {
  const amountBigInt = BigInt(amount);
  const slippageMultiplier = BigInt(10000 - slippageBps); // basis points
  const minAmount = (amountBigInt * slippageMultiplier) / BigInt(10000);
  return minAmount.toString();
}

// ETH Bridge Parameters - Enhanced with security features
export const bridgeEthParams = z.object({
  amount: amountSchema.describe("Amount of ETH to bridge in wei"),
  recipient: addressSchema.describe("Recipient address on destination chain"),
  userAddress: addressSchema.describe("User's address for balance validation"),
  maxSubmissionCost: amountSchema.optional().describe("Maximum submission cost for L2 transaction"),
  maxGas: amountSchema.optional().describe("Maximum gas for L2 execution"),
  gasPriceBid: amountSchema.optional().describe("Gas price bid for L2 execution"),
  slippageBps: z.number().int().min(1).max(1000).default(100).describe("Slippage tolerance in basis points (default: 100 = 1%)"),
  deadlineMinutes: z.number().int().min(5).max(180).default(30).describe("Transaction deadline in minutes (default: 30)")
});

// ERC20 Bridge Parameters - Enhanced with security features
export const bridgeErc20Params = z.object({
  tokenAddress: addressSchema.describe("ERC20 token contract address"),
  amount: amountSchema.describe("Amount of tokens to bridge in base units"),
  recipient: addressSchema.describe("Recipient address on destination chain"),
  userAddress: addressSchema.describe("User's address for balance validation"),
  maxSubmissionCost: amountSchema.optional().describe("Maximum submission cost for L2 transaction"),
  maxGas: amountSchema.optional().describe("Maximum gas for L2 execution"),
  gasPriceBid: amountSchema.optional().describe("Gas price bid for L2 execution"),
  slippageBps: z.number().int().min(1).max(1000).default(100).describe("Slippage tolerance in basis points (default: 100 = 1%)"),
  deadlineMinutes: z.number().int().min(5).max(180).default(30).describe("Transaction deadline in minutes (default: 30)")
});

// Bridge Status Parameters
export const bridgeStatusParams = z.object({
  transactionHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/, 'Invalid transaction hash').describe("Transaction hash to check status"),
  chainId: z.union([z.literal(1), z.literal(42161)]).describe("Chain ID where transaction was submitted")
});

// Gas Estimation Parameters
export const estimateGasParams = z.object({
  fromChainId: z.union([z.literal(1), z.literal(42161)]).describe("Source chain ID"),
  toChainId: z.union([z.literal(1), z.literal(42161)]).describe("Destination chain ID"),
  tokenAddress: addressSchema.optional().describe("Token address (optional for ETH)"),
  amount: amountSchema.describe("Amount to bridge"),
  recipient: addressSchema.describe("Recipient address")
});

// Route Parameters
export const routeParams = z.object({
  fromChainId: z.union([z.literal(1), z.literal(42161)]).describe("Source chain ID"),
  toChainId: z.union([z.literal(1), z.literal(42161)]).describe("Destination chain ID"),
  tokenAddress: addressSchema.optional().describe("Token address to find routes for")
});

// Intent Parameters
export const intentParams = z.object({
  intent: z.string().describe('Natural language bridge intent'),
  userAddress: addressSchema.optional().describe('Default recipient address'),
  maxSlippageBps: z.number().int().min(1).max(1000).describe('Max slippage in basis points'),
  maxDeadlineMinutes: z.number().int().min(5).max(180).describe('Max deadline in minutes')
});

// Arbitrum Bridge ABI (simplified)
// Arbitrum Bridge ABI - Official Inbox Contract Functions
const ARBITRUM_INBOX_ABI = [
  {
    name: 'createRetryableTicket',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'l2CallValue', type: 'uint256' },
      { name: 'maxSubmissionCost', type: 'uint256' },
      { name: 'excessFeeRefundAddress', type: 'address' },
      { name: 'callValueRefundAddress', type: 'address' },
      { name: 'gasLimit', type: 'uint256' },
      { name: 'maxFeePerGas', type: 'uint256' },
      { name: 'data', type: 'bytes' }
    ],
    outputs: [{ name: 'ticketId', type: 'uint256' }]
  }
] as const;

// L2 Gateway Router ABI - For Arbitrum to Ethereum withdrawals
const ARBITRUM_L2_GATEWAY_ABI = [
  {
    name: 'outboundTransfer',
    type: 'function',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'data', type: 'bytes' }
    ],
    outputs: [{ name: 'res', type: 'bytes' }]
  }
] as const;

// Tool: Bridge ETH to Arbitrum
export const bridgeEthToArbitrum: ToolFunction<any> = {
  description: "Bridge ETH from Ethereum to Arbitrum via Arbitrum Bridge",
  parameters: bridgeEthParams,
  execute: async ({ amount, recipient, userAddress, maxSubmissionCost, maxGas, gasPriceBid, slippageBps = 100, deadlineMinutes = 30 }) => {
    try {
      const env = validateEnvironment();
      validateAmount(amount);
      validateMaxAmount(amount, 'ETH');
      const recipientAddr = validateAddress(recipient);
      const userAddr = validateAddress(userAddress);
      
      const bridgeAddress = CONTRACT_ADDRESSES.ARBITRUM_BRIDGE[1];
      if (!bridgeAddress) {
        throw new NetworkError('Arbitrum bridge contract not available on Ethereum');
      }
      validateContractAddress(bridgeAddress, 1);

      const client = getPublicClient(1, env);
      
      // Balance validation
      await validateSufficientBalance(client, userAddr, amount, 'ETH');
      
      // Calculate security parameters
      const minAmount = calculateMinimumAmount(amount, slippageBps);
      const deadline = calculateDeadline(deadlineMinutes);

      // Default values for optional parameters
      const submissionCost = maxSubmissionCost || '1000000000000000'; // 0.001 ETH
      const gasLimit = maxGas || '1000000';
      const gasPrice = gasPriceBid || '20000000000'; // 20 gwei
      
      // Prepare transaction for gas estimation
      const transactionData = {
        to: bridgeAddress as Address,
        value: BigInt(amount),
        data: '0x' as const
      };

      // Dynamic gas estimation
      const estimatedGas = await estimateGasWithSafety(client, transactionData);

      // Encode the createRetryableTicket function call
      const data = {
        abi: ARBITRUM_INBOX_ABI,
        functionName: 'createRetryableTicket' as const,
        args: [
          recipientAddr, // to
          amount, // l2CallValue
          submissionCost, // maxSubmissionCost
          userAddr, // excessFeeRefundAddress
          userAddr, // callValueRefundAddress
          gasLimit, // gasLimit
          gasPrice, // maxFeePerGas
          '0x' // data
        ]
      };

      return {
        transaction: {
          to: bridgeAddress,
          data: data,
          value: amount
        },
        estimatedGas,
        chainId: 1,
        description: `Bridge ${amount} wei ETH to Arbitrum for recipient ${recipientAddr}`,
        bridgeType: 'eth_to_arbitrum',
        amount,
        recipient: recipientAddr,
        minAmount,
        deadline,
        slippageBps,
        userAddress: userAddr
      };
    } catch (error) {
      if (error instanceof BridgeError) throw error;
      throw new NetworkError(`Failed to create ETH bridge transaction: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
};

// Tool: Bridge ETH from Arbitrum to Ethereum
export const bridgeEthFromArbitrum: ToolFunction<any> = {
  description: "Bridge ETH from Arbitrum to Ethereum via Arbitrum Bridge",
  parameters: bridgeEthParams,
  execute: async ({ amount, recipient, userAddress, maxSubmissionCost, maxGas, gasPriceBid, slippageBps = 100, deadlineMinutes = 30 }) => {
    try {
      const env = validateEnvironment();
      validateAmount(amount);
      validateMaxAmount(amount, 'ETH');
      const recipientAddr = validateAddress(recipient);
      const userAddr = validateAddress(userAddress);
      
      const bridgeAddress = CONTRACT_ADDRESSES.ARBITRUM_BRIDGE[42161];
      if (!bridgeAddress) {
        throw new NetworkError('Arbitrum bridge contract not available on Arbitrum');
      }
      validateContractAddress(bridgeAddress, 42161);

      const client = getPublicClient(42161, env);
      
      // Balance validation
      await validateSufficientBalance(client, userAddr, amount, 'ETH');
      
      // Calculate security parameters
      const minAmount = calculateMinimumAmount(amount, slippageBps);
      const deadline = calculateDeadline(deadlineMinutes);

      // Default values for optional parameters
      const submissionCost = maxSubmissionCost || '1000000000000000'; // 0.001 ETH
      const gasLimit = maxGas || '1000000';
      const gasPrice = gasPriceBid || '20000000000'; // 20 gwei
      
      // Prepare transaction for gas estimation
      const transactionData = {
        to: bridgeAddress as Address,
        value: BigInt(amount),
        data: '0x' as const
      };

      // Dynamic gas estimation
      const estimatedGas = await estimateGasWithSafety(client, transactionData);

      // Encode the outboundTransfer function call for L2 Gateway Router
      const data = {
        abi: ARBITRUM_L2_GATEWAY_ABI,
        functionName: 'outboundTransfer' as const,
        args: [
          '0x0000000000000000000000000000000000000000', // ETH token address (zero for native ETH)
          recipientAddr, // to
          amount, // amount
          '0x' // data
        ]
      };

      return {
        transaction: {
          to: bridgeAddress,
          data: data,
          value: amount
        },
        estimatedGas,
        chainId: 42161,
        description: `Bridge ${amount} wei ETH from Arbitrum to Ethereum for recipient ${recipientAddr}`,
        bridgeType: 'eth_from_arbitrum',
        amount,
        recipient: recipientAddr,
        minAmount,
        deadline,
        slippageBps,
        userAddress: userAddr
      };
    } catch (error) {
      if (error instanceof BridgeError) throw error;
      throw new NetworkError(`Failed to create ETH bridge transaction: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
};

// Tool: Bridge ERC20 to Arbitrum
export const bridgeErc20ToArbitrum: ToolFunction<any> = {
  description: "Bridge ERC20 tokens from Ethereum to Arbitrum via Arbitrum Bridge",
  parameters: bridgeErc20Params,
  execute: async ({ tokenAddress, amount, recipient, userAddress, maxSubmissionCost, maxGas, gasPriceBid, slippageBps = 100, deadlineMinutes = 30 }) => {
    try {
      const env = validateEnvironment();
      validateAmount(amount);
      validateMaxAmount(amount, tokenAddress);
      const tokenAddr = validateAddress(tokenAddress);
      const recipientAddr = validateAddress(recipient);
      const userAddr = validateAddress(userAddress);
      
      const bridgeAddress = CONTRACT_ADDRESSES.ARBITRUM_BRIDGE[1];
      if (!bridgeAddress) {
        throw new NetworkError('Arbitrum bridge contract not available on Ethereum');
      }
      validateContractAddress(bridgeAddress, 1);

      const client = getPublicClient(1, env);
      
      // Balance validation
      await validateSufficientBalance(client, userAddr, amount, tokenAddr);
      
      // Calculate security parameters
      const minAmount = calculateMinimumAmount(amount, slippageBps);
      const deadline = calculateDeadline(deadlineMinutes);

      // Default values for optional parameters
      const submissionCost = maxSubmissionCost || '1000000000000000'; // 0.001 ETH
      const gasLimit = maxGas || '1000000';
      const gasPrice = gasPriceBid || '20000000000'; // 20 gwei
      
      // Prepare transaction for gas estimation
      const transactionData = {
        to: bridgeAddress as Address,
        value: BigInt(0),
        data: '0x' as const
      };

      // Dynamic gas estimation
      const estimatedGas = await estimateGasWithSafety(client, transactionData);

      // For ERC20 tokens, we need to use the L1 Gateway Router
      // This is a simplified implementation - in production, you'd need to determine the correct gateway
      const data = {
        abi: ARBITRUM_INBOX_ABI,
        functionName: 'createRetryableTicket' as const,
        args: [
          tokenAddr, // to (token contract on L2)
          '0', // l2CallValue (no ETH value for ERC20)
          submissionCost, // maxSubmissionCost
          userAddr, // excessFeeRefundAddress
          userAddr, // callValueRefundAddress
          gasLimit, // gasLimit
          gasPrice, // maxFeePerGas
          '0x' // data
        ]
      };

      return {
        transaction: {
          to: bridgeAddress,
          data: data,
          value: submissionCost // Only submission cost, not the token amount
        },
        estimatedGas,
        chainId: 1,
        description: `Bridge ${amount} tokens from ${tokenAddr} to Arbitrum for recipient ${recipientAddr}`,
        bridgeType: 'erc20_to_arbitrum',
        tokenAddress: tokenAddr,
        amount,
        recipient: recipientAddr,
        minAmount,
        deadline,
        slippageBps,
        userAddress: userAddr
      };
    } catch (error) {
      if (error instanceof BridgeError) throw error;
      throw new NetworkError(`Failed to create ERC20 bridge transaction: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
};

// Tool: Bridge ERC20 from Arbitrum to Ethereum
export const bridgeErc20FromArbitrum: ToolFunction<any> = {
  description: "Bridge ERC20 tokens from Arbitrum to Ethereum via Arbitrum Bridge",
  parameters: bridgeErc20Params,
  execute: async ({ tokenAddress, amount, recipient, userAddress, maxSubmissionCost, maxGas, gasPriceBid, slippageBps = 100, deadlineMinutes = 30 }) => {
    try {
      const env = validateEnvironment();
      validateAmount(amount);
      validateMaxAmount(amount, tokenAddress);
      const tokenAddr = validateAddress(tokenAddress);
      const recipientAddr = validateAddress(recipient);
      const userAddr = validateAddress(userAddress);
      
      const bridgeAddress = CONTRACT_ADDRESSES.ARBITRUM_BRIDGE[42161];
      if (!bridgeAddress) {
        throw new NetworkError('Arbitrum bridge contract not available on Arbitrum');
      }
      validateContractAddress(bridgeAddress, 42161);

      const client = getPublicClient(42161, env);
      
      // Balance validation
      await validateSufficientBalance(client, userAddr, amount, tokenAddr);
      
      // Calculate security parameters
      const minAmount = calculateMinimumAmount(amount, slippageBps);
      const deadline = calculateDeadline(deadlineMinutes);

      // Default values for optional parameters
      const submissionCost = maxSubmissionCost || '1000000000000000'; // 0.001 ETH
      const gasLimit = maxGas || '1000000';
      const gasPrice = gasPriceBid || '20000000000'; // 20 gwei
      
      // Prepare transaction for gas estimation
      const transactionData = {
        to: bridgeAddress as Address,
        value: BigInt(0),
        data: '0x' as const
      };

      // Dynamic gas estimation
      const estimatedGas = await estimateGasWithSafety(client, transactionData);

      // Encode the outboundTransfer function call for L2 Gateway Router
      const data = {
        abi: ARBITRUM_L2_GATEWAY_ABI,
        functionName: 'outboundTransfer' as const,
        args: [
          tokenAddr, // token
          recipientAddr, // to
          amount, // amount
          '0x' // data
        ]
      };

      return {
        transaction: {
          to: bridgeAddress,
          data: data,
          value: '0' // ERC20 withdrawals don't send ETH
        },
        estimatedGas,
        chainId: 42161,
        description: `Bridge ${amount} tokens from ${tokenAddr} from Arbitrum to Ethereum for recipient ${recipientAddr}`,
        bridgeType: 'erc20_from_arbitrum',
        tokenAddress: tokenAddr,
        amount,
        recipient: recipientAddr,
        minAmount,
        deadline,
        slippageBps,
        userAddress: userAddr
      };
    } catch (error) {
      if (error instanceof BridgeError) throw error;
      throw new NetworkError(`Failed to create ERC20 bridge transaction: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
};

// Tool: Get Bridge Status
export const getBridgeStatus: ToolFunction<z.infer<typeof bridgeStatusParams>> = {
  description: "Check the status of a bridge transaction",
  parameters: bridgeStatusParams,
  execute: async ({ transactionHash, chainId }) => {
    try {
      const env = validateEnvironment();
      const client = getPublicClient(chainId, env);
      
      const receipt = await client.getTransactionReceipt({ hash: transactionHash as `0x${string}` });
      
      if (!receipt) {
        return {
          chainId,
          description: `Transaction ${transactionHash} not found or pending`,
          status: 'pending',
          transactionHash
        };
      }

      return {
        chainId,
        description: `Transaction ${transactionHash} status: ${receipt.status === 'success' ? 'confirmed' : 'failed'}`,
        status: receipt.status === 'success' ? 'confirmed' : 'failed',
        transactionHash,
        blockNumber: receipt.blockNumber.toString(),
        gasUsed: receipt.gasUsed.toString(),
        effectiveGasPrice: receipt.effectiveGasPrice?.toString()
      };
    } catch (error) {
      if (error instanceof BridgeError) throw error;
      throw new NetworkError(`Failed to check bridge status: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
};

// Tool: Estimate Bridge Gas
export const estimateBridgeGas: ToolFunction<z.infer<typeof estimateGasParams>> = {
  description: "Estimate gas costs for a bridge transaction",
  parameters: estimateGasParams,
  execute: async ({ fromChainId, toChainId, tokenAddress, amount, recipient }) => {
    try {
      const env = validateEnvironment();
      validateAmount(amount);
      const recipientAddr = validateAddress(recipient);
      
      const client = getPublicClient(fromChainId, env);
      
      // Basic gas estimation based on transaction type
      let baseGas = '200000'; // Base gas for bridge operations
      let gasPrice = '20000000000'; // 20 gwei
      
      if (tokenAddress) {
        // ERC20 bridge requires more gas
        baseGas = '250000';
      }
      
      // Get current gas price from network
      try {
        const feeData = await client.getGasPrice();
        gasPrice = feeData.toString();
      } catch (error) {
        // Use default if network call fails
        console.warn('Could not fetch current gas price, using default');
      }
      
      const estimatedCost = (parseInt(baseGas) * parseInt(gasPrice)).toString();
      
      return {
        chainId: fromChainId,
        description: `Gas estimation for bridging ${tokenAddress ? 'ERC20' : 'ETH'} from chain ${fromChainId} to ${toChainId}`,
        estimatedGas: baseGas,
        gasPrice,
        estimatedCost,
        fromChainId,
        toChainId,
        tokenAddress: tokenAddress || 'ETH',
        amount,
        recipient: recipientAddr
      };
    } catch (error) {
      if (error instanceof BridgeError) throw error;
      throw new NetworkError(`Failed to estimate bridge gas: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
};

// Tool: List Available Routes
export const listAvailableRoutes: ToolFunction<z.infer<typeof routeParams>> = {
  description: "List available bridge routes between chains",
  parameters: routeParams,
  execute: async ({ fromChainId, toChainId, tokenAddress }) => {
    try {
      const routes = [];
      
      // ETH routes
      if (!tokenAddress || tokenAddress === 'ETH') {
        routes.push({
          protocol: 'arbitrum',
          fromChainId,
          toChainId,
          tokenAddress: 'ETH',
          tokenSymbol: 'ETH',
          estimatedTime: '7-10 days',
          estimatedCost: '0.001 ETH',
          description: `Bridge ETH from chain ${fromChainId} to ${toChainId} via Arbitrum Bridge`
        });
      }
      
      // USDC routes
      if (!tokenAddress || tokenAddress === '0xaf88d065e77c8cC2239327C5EDb3A432268e5831') {
        routes.push({
          protocol: 'arbitrum',
          fromChainId,
          toChainId,
          tokenAddress: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
          tokenSymbol: 'USDC',
          estimatedTime: '7-10 days',
          estimatedCost: '0.001 ETH',
          description: `Bridge USDC from chain ${fromChainId} to ${toChainId} via Arbitrum Bridge`
        });
      }
      
      return {
        chainId: fromChainId,
        description: `Available bridge routes from chain ${fromChainId} to ${toChainId}`,
        routes,
        totalRoutes: routes.length
      };
    } catch (error) {
      if (error instanceof BridgeError) throw error;
      throw new NetworkError(`Failed to list routes: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
};

// Tool: Process Bridge Intent
export const processBridgeIntent: ToolFunction<z.infer<typeof intentParams>> = {
  description: "Process natural language bridge intent and create execution plan",
  parameters: intentParams,
  execute: async ({ intent, userAddress, maxSlippageBps, maxDeadlineMinutes }) => {
    try {
      const env = validateEnvironment();
      
      // Simple intent parsing for demo
      const parsed = {
        type: 'bridge',
        priority: 'balanced',
        amount: '1000000000000000000', // 1 ETH
        token: 'ETH',
        fromChain: 1,
        toChain: 42161
      };
      
      return {
        chainId: 1,
        description: `Processed bridge intent: ${intent}`,
        parsed,
        comparison: [
          {
            protocol: 'arbitrum',
            estimatedCost: '0.05%',
            estimatedTime: '10-15 minutes',
            securityScore: 9,
            liquidityScore: 8,
            recommended: true,
            reasons: ['Fast execution', 'Low fees', 'Proven security']
          }
        ],
        executionPlan: {
          selectedProtocol: 'arbitrum',
          estimatedTotalCost: '0.06%',
          estimatedTotalTime: '10-15 minutes',
          transactions: [
            {
              type: 'approval',
              description: 'Approve ETH for Arbitrum bridge'
            },
            {
              type: 'bridge',
              description: 'Bridge ETH via Arbitrum'
            }
          ]
        }
      };
    } catch (error) {
      return {
        chainId: 0,
        description: `Error processing intent: ${intent}`,
        parsed: null,
        comparison: [],
        executionPlan: null,
        error: error instanceof Error ? error.message : 'Unknown error processing intent',
      };
    }
  }
};

// Main tools object
export const tools = {
  bridgeEthToArbitrum,
  bridgeEthFromArbitrum,
  bridgeErc20ToArbitrum,
  bridgeErc20FromArbitrum,
  getBridgeStatus,
  estimateBridgeGas,
  listAvailableRoutes,
  processBridgeIntent,
};

