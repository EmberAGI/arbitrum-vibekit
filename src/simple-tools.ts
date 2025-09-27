import { z } from 'zod';
import { createPublicClient, http, isAddress, encodeFunctionData } from 'viem';
import type { Address } from 'viem';
import { mainnet, arbitrum } from 'viem/chains';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Security: Private key validation (optional for testing)
export const PRIVATE_KEY = (() => {
  const key = process.env.PRIVATE_KEY;
  if (!key) {
    console.warn('PRIVATE_KEY environment variable not set - some features may be limited');
    return null;
  }
  if (!key.startsWith('0x') || key.length !== 66) {
    throw new Error('Invalid private key format');
  }
  return key;
})();

// Security: Maximum gas limits
const MAX_GAS_LIMIT = BigInt(5000000);
const MAX_ETH_AMOUNT = BigInt('100000000000000000000'); // 100 ETH
const MAX_TOKEN_AMOUNT = BigInt('1000000000000000000000000'); // 1M tokens

// Error Classes
export class BridgeError extends Error {
  constructor(public code: string, message: string) {
    super(`${code}: ${message}`);
    this.name = 'BridgeError';
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(`VALIDATION_ERROR: ${message}`);
    this.name = 'ValidationError';
  }
}

export class NetworkError extends Error {
  constructor(message: string) {
    super(`NETWORK_ERROR: ${message}`);
    this.name = 'NetworkError';
  }
}

export class InsufficientFundsError extends Error {
  constructor(message: string) {
    super(`INSUFFICIENT_FUNDS: ${message}`);
    this.name = 'InsufficientFundsError';
  }
}

export class InvalidAddressError extends Error {
  constructor(message: string) {
    super(`INVALID_ADDRESS: ${message}`);
    this.name = 'InvalidAddressError';
  }
}

// Environment validation
function validateEnvironment() {
  const ethRpcUrl = process.env.ETHEREUM_RPC_URL || 'https://eth.llamarpc.com';
  const arbRpcUrl = process.env.ARBITRUM_RPC_URL;
  
  if (!arbRpcUrl) {
    throw new ValidationError('ARBITRUM_RPC_URL environment variable is required');
  }
  
  return { ethRpcUrl, arbRpcUrl };
}

// Public client factory
function getPublicClient(chainId: number, env: { ethRpcUrl: string; arbRpcUrl: string }) {
  if (chainId === 1) {
    return createPublicClient({
      chain: mainnet,
      transport: http(env.ethRpcUrl)
    });
  } else if (chainId === 42161) {
    return createPublicClient({
      chain: arbitrum,
      transport: http(env.arbRpcUrl)
    });
  } else {
    throw new NetworkError(`Unsupported chain ID: ${chainId}`);
  }
}

// Address validation - STANDARDIZED
export function validateAddress(address: string): Address {
  // Security: Check for zero address
  if (address === '0x0000000000000000000000000000000000000000') {
    throw new ValidationError('Zero address is not allowed');
  }
  
  // Normalize to lowercase for validation
  const normalizedAddress = address.toLowerCase();
  
  // Validate address format
  if (!isAddress(normalizedAddress)) {
    throw new ValidationError(`Invalid address format: ${address}`);
  }
  
  // Return the original address (preserving case) but ensure it's valid
  return address as Address;
}

// Amount validation - STANDARDIZED TO HEX FORMAT
export function validateAmount(amount: string): string {
  // Convert to string if it's a number
  const amountStr = String(amount);
  
  // Check if empty or undefined
  if (!amountStr || amountStr.trim() === '') {
    throw new ValidationError('Amount is required and must be greater than 0');
  }
  
  // Security: Check for hex format FIRST
  if (!amountStr.match(/^0x[0-9a-fA-F]+$/)) {
    throw new ValidationError('Amount must be hex string (e.g., 0xde0b6b3a7640000)');
  }
  
  // Check if it's greater than 0
  if (BigInt(amountStr) <= BigInt(0)) {
    throw new ValidationError('Amount must be positive');
  }
  
  return amountStr;
}

// Contract address validation
function validateContractAddress(address: string, chainId: number): void {
  if (address === '0x0000000000000000000000000000000000000000') {
    throw new ValidationError(`Zero address not allowed for contract on chain ${chainId}`);
  }
  validateAddress(address);
}

// Maximum amount validation to prevent large losses
function validateMaxAmount(amount: string, tokenAddress?: string): void {
  const amountBigInt = BigInt(amount);
  
  if (!tokenAddress || tokenAddress === 'ETH') {
    if (amountBigInt > MAX_ETH_AMOUNT) {
      throw new ValidationError(`Amount exceeds maximum limit of 100 ETH for safety`);
    }
  } else {
    if (amountBigInt > MAX_TOKEN_AMOUNT) {
      throw new ValidationError(`Amount exceeds maximum limit of 1M tokens for safety`);
    }
  }
}

// Balance validation
async function validateSufficientBalance(client: any, userAddress: Address, amount: string, tokenAddress?: string): Promise<void> {
  try {
    let balance: bigint;
    
    if (!tokenAddress || tokenAddress === 'ETH') {
      balance = await client.getBalance({ address: userAddress });
    } else {
      // ERC20 balance check
      const tokenAddr = validateAddress(tokenAddress);
      balance = await client.readContract({
        address: tokenAddr,
        abi: [{
          name: 'balanceOf',
          type: 'function',
          stateMutability: 'view',
          inputs: [{ name: 'account', type: 'address' }],
          outputs: [{ name: '', type: 'uint256' }]
        }],
        functionName: 'balanceOf',
        args: [userAddress]
      });
    }
    
    const requiredAmount = BigInt(amount);
    if (balance < requiredAmount) {
      const tokenName = tokenAddress === 'ETH' ? 'ETH' : 'tokens';
      throw new InsufficientFundsError(`Insufficient balance. Required: ${requiredAmount.toString()} ${tokenName}, Available: ${balance.toString()} ${tokenName}`);
    }
  } catch (error) {
    throw new NetworkError(`Balance check failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Gas estimation with safety
async function estimateGasWithSafety(
  client: any,
  transaction: any,
  safetyMultiplier: number = 1.2
): Promise<string> {
  try {
    const gasEstimate = await client.estimateGas(transaction);
    const safeGasLimit = BigInt(Math.ceil(Number(gasEstimate) * safetyMultiplier));
    
    // Security: Enforce maximum gas limit
    if (safeGasLimit > MAX_GAS_LIMIT) {
      return MAX_GAS_LIMIT.toString();
    }
    
    return safeGasLimit.toString();
  } catch (error) {
    // Fallback to conservative estimate
    return '200000';
  }
}

// Calculate minimum amount with slippage
function calculateMinimumAmount(amount: string, slippageBps: number): string {
  const amountBigInt = BigInt(amount);
  const slippageMultiplier = BigInt(10000 - slippageBps);
  const minAmount = (amountBigInt * slippageMultiplier) / BigInt(10000);
  return minAmount.toString();
}

// Calculate deadline
function calculateDeadline(minutes: number): string {
  const deadline = Math.floor(Date.now() / 1000) + (minutes * 60);
  return deadline.toString();
}

// Contract Addresses - CORRECTED OFFICIAL ARBITRUM BRIDGE ADDRESSES
export const CONTRACT_ADDRESSES = {
  // Ethereum Mainnet (Chain ID: 1)
  1: {
    inbox: '0x4Dbd4fc535Ac27206064B68FfCf827b0A60BAB3f', // Arbitrum Inbox
    gatewayRouter: '0x72Ce9c846789fdB6fC1f34aC4AD25Dd9ef7031ef' // L1 Gateway Router
  },
  // Arbitrum One (Chain ID: 42161)
  42161: {
    bridge: '0x8315177aB297bA92A06054cE80a67Ed4DBd7ed3a', // Arbitrum L2 Bridge (for withdrawals)
    gatewayRouter: '0x5288c571Fd7aD117beA99bF60FE0846C4E84F933' // L2 Gateway Router
  }
} as const;

// Helper function to get contract addresses
export const getContractAddress = (chainId: number, contract: string): string => {
  const addresses = CONTRACT_ADDRESSES[chainId as keyof typeof CONTRACT_ADDRESSES];
  if (!addresses) {
    throw new NetworkError(`Unsupported chainId: ${chainId}`);
  }
  const address = addresses[contract as keyof typeof addresses];
  if (!address) {
    throw new NetworkError(`Contract ${contract} not available on chain ${chainId}`);
  }
  return address;
};

// ABIs
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
    outputs: [{ name: '', type: 'uint256' }]
  }
] as const;

// L2 Bridge ABI for withdrawals (L2 -> L1)
const ARBITRUM_L2_BRIDGE_ABI = [
  {
    name: 'withdrawEth',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      { name: 'destination', type: 'address' }
    ],
    outputs: [{ name: '', type: 'uint256' }]
  }
] as const;

const L1_GATEWAY_ROUTER_ABI = [
  {
    name: 'outboundTransfer',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'maxGas', type: 'uint256' },
      { name: 'gasPriceBid', type: 'uint256' },
      { name: 'data', type: 'bytes' }
    ],
    outputs: [{ name: '', type: 'bytes' }]
  }
] as const;

const ARBITRUM_L2_GATEWAY_ABI = [
  {
    name: 'outboundTransfer',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'maxGas', type: 'uint256' },
      { name: 'gasPriceBid', type: 'uint256' },
      { name: 'data', type: 'bytes' }
    ],
    outputs: [{ name: '', type: 'bytes' }]
  }
] as const;

// Schemas - STANDARDIZED TO HEX FORMAT
export const addressSchema = z.string()
  .length(42, 'Address must be 42 characters')
  .regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid address format')
  .refine((addr) => isAddress(addr.toLowerCase()), 'Invalid Ethereum address')
  .describe('Ethereum address in 0x format (case-insensitive)');

// Amount Schema - STANDARDIZED TO HEX FORMAT
export const amountSchema = z.string()
  .min(1, 'Amount is required')
  .regex(/^0x[0-9a-fA-F]+$/, 'Amount must be hex string (e.g., 0xde0b6b3a7640000)')
  .refine((val) => BigInt(val) > 0n, 'Amount must be greater than 0')
  .describe('Amount in wei as hex string (e.g., 0xde0b6b3a7640000 for 1 ETH)');

// ETH Bridge Parameters - Enhanced with security features
export const bridgeEthParams = z.object({
  amount: amountSchema.describe("Amount of ETH to bridge in wei as hex string"),
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
  amount: amountSchema.describe("Amount of tokens to bridge in base units as hex string"),
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
  transactionHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/, 'Invalid transaction hash format'),
  chainId: z.union([z.literal(1), z.literal(42161)]).default(1).describe("Chain ID where transaction was submitted")
});

// Gas Estimation Parameters
export const estimateGasParams = z.object({
  fromChain: z.enum(['ethereum', 'arbitrum']).describe("Source chain"),
  toChain: z.enum(['ethereum', 'arbitrum']).describe("Destination chain"),
  tokenAddress: addressSchema.optional().describe("Token address (optional for ETH)"),
  amount: amountSchema.describe("Amount to bridge as hex string")
});

// Route Parameters
export const routeParams = z.object({
  fromChainId: z.union([z.literal(1), z.literal(42161)]).describe("Source chain ID"),
  toChainId: z.union([z.literal(1), z.literal(42161)]).describe("Destination chain ID"),
  tokenAddress: addressSchema.optional().describe("Token address (optional for ETH)")
});

// Intent Parameters
export const intentParams = z.object({
  intent: z.string().min(1, 'Intent is required').describe("Natural language bridge intent"),
  userAddress: addressSchema.describe("User's address"),
  maxSlippageBps: z.number().int().min(1).max(1000).default(100).describe("Maximum slippage tolerance"),
  maxDeadlineMinutes: z.number().int().min(5).max(180).default(30).describe("Maximum deadline in minutes")
});

// Response Types
export interface BridgeResponse {
  transaction?: {
    to: string;
    data: any;
    value: string;
  };
  estimatedGas?: string;
  chainId: number;
  description: string;
  [key: string]: any;
}

export interface ToolFunction<T = any> {
  description: string;
  parameters: z.ZodType<T>;
  execute: (params: T) => Promise<BridgeResponse>;
}

export type SupportedChainId = 1 | 42161;

// Validation Tool: Check Bridge Feasibility
export const validateBridgeFeasibility: ToolFunction<any> = {
  description: "Validate if bridge transaction is feasible",
  parameters: bridgeEthParams,
  execute: async ({ amount, recipient, userAddress, maxSubmissionCost, maxGas, gasPriceBid, slippageBps = 100, deadlineMinutes = 30 }) => {
    try {
      const env = validateEnvironment();
      validateAmount(amount);
      validateMaxAmount(amount, 'ETH');
      const recipientAddr = validateAddress(recipient);
      const userAddr = validateAddress(userAddress);
      
      const bridgeAddress = getContractAddress(1, 'inbox');
      validateContractAddress(bridgeAddress, 1);

      const client = getPublicClient(1, env);
      
      // Balance validation
      await validateSufficientBalance(client, userAddr, amount, 'ETH');
      
      // Calculate security parameters
      const minAmount = calculateMinimumAmount(amount, slippageBps);
      const deadline = calculateDeadline(deadlineMinutes);
      
      // Default values for optional parameters
      const submissionCost = maxSubmissionCost || '0x1000000000000000'; // 0.001 ETH
      const gasLimit = maxGas || '0x100000'; // 1M gas
      const gasPrice = gasPriceBid || '0x4a817c800'; // 20 gwei
      
      // Convert to BigInt for calculations
      const amountWei = BigInt(amount);
      const submissionCostWei = BigInt(submissionCost);
      const gasLimitWei = BigInt(gasLimit);
      const gasPriceWei = BigInt(gasPrice);
      
      // Calculate estimated cost
      const estimatedCost = (submissionCostWei + (gasLimitWei * gasPriceWei)).toString();
      
      return {
        feasible: true,
        estimatedCost,
        estimatedGas: '200000',
        minAmount,
        deadline,
        slippageBps,
        chainId: 1,
        description: `Bridge validation successful for ${amount} wei ETH to Arbitrum`
      };
    } catch (error) {
      throw error;
    }
  }
};

// Transaction Generation Tool: Generate Bridge Transaction (NO network calls)
export const generateBridgeTransaction: ToolFunction<any> = {
  description: "Generate unsigned bridge transaction",
  parameters: bridgeEthParams,
  execute: async ({ amount, recipient, userAddress, maxSubmissionCost, maxGas, gasPriceBid, slippageBps = 100, deadlineMinutes = 30 }) => {
    try {
      // Pure function - only generates tx data
      validateAmount(amount);
      validateMaxAmount(amount, 'ETH');
      const recipientAddr = validateAddress(recipient);
      const userAddr = validateAddress(userAddress);
      
      const bridgeAddress = getContractAddress(1, 'inbox');
      validateContractAddress(bridgeAddress, 1);
      
      // Calculate security parameters
      const minAmount = calculateMinimumAmount(amount, slippageBps);
      const deadline = calculateDeadline(deadlineMinutes);
      
      // Default values for optional parameters
      const submissionCost = maxSubmissionCost || '0x1000000000000000'; // 0.001 ETH
      const gasLimit = maxGas || '0x100000'; // 1M gas
      const gasPrice = gasPriceBid || '0x4a817c800'; // 20 gwei
      
      // Convert to BigInt for ABI encoding
      const amountWei = BigInt(amount);
      const submissionCostWei = BigInt(submissionCost);
      const gasLimitWei = BigInt(gasLimit);
      const gasPriceWei = BigInt(gasPrice);
      
      const data = {
        abi: ARBITRUM_INBOX_ABI,
        functionName: 'createRetryableTicket' as const,
        args: [
          recipientAddr, // to
          amountWei, // l2CallValue
          submissionCostWei, // maxSubmissionCost
          userAddr, // excessFeeRefundAddress
          userAddr, // callValueRefundAddress
          gasLimitWei, // gasLimit
          gasPriceWei, // maxFeePerGas
          '0x' // data
        ]
      };
      
      return {
        transaction: { to: bridgeAddress, data: data, value: amount },
        estimatedGas: '200000', // Conservative estimate
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
      throw error;
    }
  }
};

// ETH Bridge Tool: Bridge ETH from Ethereum to Arbitrum
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
      
      const bridgeAddress = getContractAddress(1, 'inbox');
      validateContractAddress(bridgeAddress, 1);

      const client = getPublicClient(1, env);
      
      // Balance validation
      await validateSufficientBalance(client, userAddr, amount, 'ETH');
      
      // Calculate security parameters
      const minAmount = calculateMinimumAmount(amount, slippageBps);
      const deadline = calculateDeadline(deadlineMinutes);
      
      // Default values for optional parameters
      const submissionCost = maxSubmissionCost || '0x1000000000000000'; // 0.001 ETH
      const gasLimit = maxGas || '0x100000'; // 1M gas
      const gasPrice = gasPriceBid || '0x4a817c800'; // 20 gwei
      
      // Convert to BigInt for ABI encoding
      const amountWei = BigInt(amount);
      const submissionCostWei = BigInt(submissionCost);
      const gasLimitWei = BigInt(gasLimit);
      const gasPriceWei = BigInt(gasPrice);
      
      const data = {
        abi: ARBITRUM_INBOX_ABI,
        functionName: 'createRetryableTicket' as const,
        args: [
          recipientAddr, // to
          amountWei, // l2CallValue
          submissionCostWei, // maxSubmissionCost
          userAddr, // excessFeeRefundAddress
          userAddr, // callValueRefundAddress
          gasLimitWei, // gasLimit
          gasPriceWei, // maxFeePerGas
          '0x' // data
        ]
      };
      
      const encodedData = encodeFunctionData({
        abi: ARBITRUM_INBOX_ABI,
        functionName: 'createRetryableTicket',
        args: [
          recipientAddr,
          amountWei,
          submissionCostWei,
          userAddr,
          userAddr,
          gasLimitWei,
          gasPriceWei,
          '0x'
        ]
      });
      
      // Gas estimation with actual encoded data
      const transactionData = {
        to: bridgeAddress as Address,
        value: amountWei,
        data: encodedData
      };
      const estimatedGas = await estimateGasWithSafety(client, transactionData);
      
      return {
        transaction: { to: bridgeAddress, data: data, value: amount },
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
      throw error;
    }
  }
};

// ETH Bridge Tool: Bridge ETH from Arbitrum to Ethereum
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
      
      const bridgeAddress = getContractAddress(42161, 'bridge');
      validateContractAddress(bridgeAddress, 42161);

      const client = getPublicClient(42161, env);
      
      // Balance validation
      await validateSufficientBalance(client, userAddr, amount, 'ETH');
      
      // Calculate security parameters
      const minAmount = calculateMinimumAmount(amount, slippageBps);
      const deadline = calculateDeadline(deadlineMinutes);
      
      // For L2->L1 withdrawals, use the L2 bridge contract with withdrawEth function
      const data = {
        abi: ARBITRUM_L2_BRIDGE_ABI,
        functionName: 'withdrawEth' as const,
        args: [
          recipientAddr // destination
        ]
      };
      
      const encodedData = encodeFunctionData({
        abi: ARBITRUM_L2_BRIDGE_ABI,
        functionName: 'withdrawEth',
        args: [
          recipientAddr
        ]
      });
      
      // Gas estimation with actual encoded data
      const transactionData = {
        to: bridgeAddress as Address,
        value: BigInt(amount), // ETH amount to withdraw
        data: encodedData
      };
      const estimatedGas = await estimateGasWithSafety(client, transactionData);
      
      return {
        transaction: { to: bridgeAddress, data: data, value: amount },
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
      throw error;
    }
  }
};

// ERC20 Bridge Tool: Bridge ERC20 tokens from Ethereum to Arbitrum
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
      
      const gatewayRouterAddress = getContractAddress(1, 'gatewayRouter');
      validateContractAddress(gatewayRouterAddress, 1);

      const client = getPublicClient(1, env);
      
      // Balance validation
      await validateSufficientBalance(client, userAddr, amount, tokenAddr);
      
      // Calculate security parameters
      const minAmount = calculateMinimumAmount(amount, slippageBps);
      const deadline = calculateDeadline(deadlineMinutes);
      
      // Default values for optional parameters
      const submissionCost = maxSubmissionCost || '0x1000000000000000'; // 0.001 ETH
      const gasLimit = maxGas || '0x100000'; // 1M gas
      const gasPrice = gasPriceBid || '0x4a817c800'; // 20 gwei
      
      // Convert to BigInt for ABI encoding
      const amountWei = BigInt(amount);
      const submissionCostWei = BigInt(submissionCost);
      const gasLimitWei = BigInt(gasLimit);
      const gasPriceWei = BigInt(gasPrice);
      
      // Use L1 Gateway Router for ERC20 bridging (already validated above)
      
      const data = {
        abi: L1_GATEWAY_ROUTER_ABI,
        functionName: 'outboundTransfer' as const,
        args: [
          tokenAddr, // token
          recipientAddr, // to
          amountWei, // amount
          gasLimitWei, // maxGas
          gasPriceWei, // gasPriceBid
          '0x' // data
        ]
      };
      
      const encodedData = encodeFunctionData({
        abi: L1_GATEWAY_ROUTER_ABI,
        functionName: 'outboundTransfer',
        args: [
          tokenAddr,
          recipientAddr,
          amountWei,
          gasLimitWei,
          gasPriceWei,
          '0x'
        ]
      });
      
      // Gas estimation with actual encoded data
      const transactionData = {
        to: gatewayRouterAddress as Address,
        value: BigInt(0), // ERC20 bridges don't send ETH
        data: encodedData
      };
      const estimatedGas = await estimateGasWithSafety(client, transactionData);
      
      return {
        transaction: { to: gatewayRouterAddress, data: data, value: '0' },
        estimatedGas,
        chainId: 1,
        description: `Bridge ${amount} wei of token ${tokenAddr} to Arbitrum for recipient ${recipientAddr}`,
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
      throw error;
    }
  }
};

// ERC20 Bridge Tool: Bridge ERC20 tokens from Arbitrum to Ethereum
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
      
      const gatewayRouterAddress = getContractAddress(42161, 'gatewayRouter');
      validateContractAddress(gatewayRouterAddress, 42161);

      const client = getPublicClient(42161, env);
      
      // Balance validation
      await validateSufficientBalance(client, userAddr, amount, tokenAddr);
      
      // Calculate security parameters
      const minAmount = calculateMinimumAmount(amount, slippageBps);
      const deadline = calculateDeadline(deadlineMinutes);
      
      // Default values for optional parameters
      const submissionCost = maxSubmissionCost || '0x1000000000000000'; // 0.001 ETH
      const gasLimit = maxGas || '0x100000'; // 1M gas
      const gasPrice = gasPriceBid || '0x4a817c800'; // 20 gwei
      
      // Convert to BigInt for ABI encoding
      const amountWei = BigInt(amount);
      
      // Use L2 Gateway Router for ERC20 withdrawals (already validated above)
      
      // Encode the outboundTransfer function call for L2 Gateway Router
      const data = {
        abi: ARBITRUM_L2_GATEWAY_ABI,
        functionName: 'outboundTransfer' as const,
        args: [
          tokenAddr, // token
          recipientAddr, // to
          amountWei, // amount
          BigInt(gasLimit), // maxGas
          BigInt(gasPrice), // gasPriceBid
          '0x' // data
        ]
      };
      
      const encodedData = encodeFunctionData({
        abi: ARBITRUM_L2_GATEWAY_ABI,
        functionName: 'outboundTransfer',
        args: [
          tokenAddr,
          recipientAddr,
          amountWei,
          BigInt(gasLimit),
          BigInt(gasPrice),
          '0x'
        ]
      });
      
      // Gas estimation with actual encoded data
      const transactionData = {
        to: gatewayRouterAddress as Address,
        value: BigInt(0), // ERC20 bridges don't send ETH
        data: encodedData
      };
      const estimatedGas = await estimateGasWithSafety(client, transactionData);
      
      return {
        transaction: { to: gatewayRouterAddress, data: data, value: '0' },
        estimatedGas,
        chainId: 42161,
        description: `Bridge ${amount} wei of token ${tokenAddr} from Arbitrum to Ethereum for recipient ${recipientAddr}`,
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
      throw error;
    }
  }
};

// Bridge Status Tool
export const getBridgeStatus: ToolFunction<any> = {
  description: "Get the status of a bridge transaction",
  parameters: bridgeStatusParams,
  execute: async ({ transactionHash, chainId = 1 }) => {
    try {
      const env = validateEnvironment();
      const client = getPublicClient(chainId, env);
      
      const receipt = await client.getTransactionReceipt({ hash: transactionHash as `0x${string}` });
      
      if (!receipt) {
        throw new NetworkError(`Transaction receipt with hash "${transactionHash}" could not be found. The Transaction may not be processed on a block yet.`);
      }
      
      return {
        chainId,
        description: `Bridge transaction status for ${transactionHash}`,
        status: receipt.status === 'success' ? 'completed' : 'failed',
        blockNumber: receipt.blockNumber.toString(),
        gasUsed: receipt.gasUsed.toString(),
        transactionHash: receipt.transactionHash
      };
    } catch (error) {
      throw new NetworkError(`Failed to check bridge status: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
};

// Gas Estimation Tool
export const estimateBridgeGas: ToolFunction<any> = {
  description: "Estimate gas costs for a bridge transaction",
  parameters: estimateGasParams,
  execute: async ({ fromChain, toChain, tokenAddress, amount }) => {
    try {
      const env = validateEnvironment();
      validateAmount(amount);
      
      // Convert chain names to IDs
      const fromChainId = fromChain === 'ethereum' ? 1 : 42161;
      const toChainId = toChain === 'ethereum' ? 1 : 42161;
      
      const client = getPublicClient(fromChainId, env);
      
      // Basic gas estimation based on transaction type
      let baseGas = '200000'; // Base gas for bridge operations
      let gasPrice = '20000000000'; // 20 gwei
      
      if (tokenAddress) {
        // ERC20 bridge - higher gas
        baseGas = '300000';
      }
      
      // Calculate estimated cost
      const estimatedCost = (BigInt(baseGas) * BigInt(gasPrice)).toString();
      
      return {
        chainId: fromChainId,
        description: `Gas estimation for bridging ${tokenAddress ? 'ERC20' : 'ETH'} from ${fromChain} to ${toChain}`,
        estimatedGas: baseGas,
        gasPrice,
        estimatedCost,
        fromChainId,
        toChainId,
        tokenAddress,
        amount
      };
    } catch (error) {
      throw new NetworkError(`Failed to estimate bridge gas: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
};

// Route Listing Tool
export const listAvailableRoutes: ToolFunction<any> = {
  description: "List available bridge routes between chains",
  parameters: routeParams,
  execute: async ({ fromChainId, toChainId, tokenAddress }) => {
    try {
      const routes = [];
      
      // ETH routes
      routes.push({
        fromChain: fromChainId,
        toChain: toChainId,
        token: 'ETH',
        tokenAddress: '0x0000000000000000000000000000000000000000',
        supported: true,
        estimatedTime: '10-15 minutes'
      });
      
      // ERC20 routes if token specified
      if (tokenAddress) {
        routes.push({
          fromChain: fromChainId,
          toChain: toChainId,
          token: 'ERC20',
          tokenAddress,
          supported: true,
          estimatedTime: '10-15 minutes'
        });
      }
      
      return {
        chainId: fromChainId,
        description: `Available bridge routes from chain ${fromChainId} to ${toChainId}`,
        routes,
        totalRoutes: routes.length
      };
    } catch (error) {
      throw new NetworkError(`Failed to list routes: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
};

// Bridge Intent Processing Tool
export const processBridgeIntent: ToolFunction<any> = {
  description: "Process natural language bridge intent and create execution plan",
  parameters: intentParams,
  execute: async ({ intent, userAddress, maxSlippageBps, maxDeadlineMinutes }) => {
    try {
      const userAddr = validateAddress(userAddress);
      
      // Enhanced NLP processing with regex patterns
      const amountMatch = intent.match(/(\d+(?:\.\d+)?)\s*(ETH|USDC|USDT|DAI|ARB)/i);
      const fromChainMatch = intent.match(/from\s+(ethereum|arbitrum)/i);
      const toChainMatch = intent.match(/to\s+(ethereum|arbitrum)/i);
      
      if (!amountMatch) {
        throw new ValidationError('Could not parse amount and token from intent');
      }
      
      const amount = parseFloat(amountMatch[1]);
      const token = amountMatch[2].toUpperCase();
      const fromChain = fromChainMatch ? fromChainMatch[1].toLowerCase() : 'ethereum';
      const toChain = toChainMatch ? toChainMatch[1].toLowerCase() : 'arbitrum';
      
      // Convert amount to wei based on token (return as hex string)
      let amountWei: string;
      if (token === 'ETH') {
        amountWei = '0x' + (BigInt(Math.floor(amount * 1e18))).toString(16);
      } else {
        // Assume 6 decimals for stablecoins
        amountWei = '0x' + (BigInt(Math.floor(amount * 1e6))).toString(16);
      }
      
      const parsed = {
        type: 'bridge',
        priority: 'balanced',
        amount: amountWei,
        token,
        fromChain: fromChain === 'ethereum' ? 1 : 42161,
        toChain: toChain === 'ethereum' ? 1 : 42161
      };
      
      return {
        chainId: 1,
        description: `Processed bridge intent: ${intent}`,
        parsed,
        comparison: [
          {
            method: 'Arbitrum Bridge',
            estimatedTime: '10-15 minutes',
            cost: 'Low',
            security: 'High'
          }
        ],
        executionPlan: {
          steps: [
            'Validate parameters',
            'Check balances',
            'Generate transaction',
            'Execute bridge'
          ],
          estimatedGas: '200000',
          estimatedCost: '0.001 ETH'
        }
      };
    } catch (error) {
      throw new ValidationError(`Failed to process bridge intent: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
};

// Main tools object
export const tools = {
  validateBridgeFeasibility,
  generateBridgeTransaction,
  // Legacy tools (for backward compatibility)
  bridgeEthToArbitrum,
  bridgeEthFromArbitrum,
  bridgeErc20ToArbitrum,
  bridgeErc20FromArbitrum,
  getBridgeStatus,
  estimateBridgeGas,
  listAvailableRoutes,
  processBridgeIntent,
};
