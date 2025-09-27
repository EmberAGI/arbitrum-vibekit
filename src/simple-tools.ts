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

// ETH Bridge Parameters
export const bridgeEthParams = z.object({
  amount: amountSchema.describe("Amount of ETH to bridge in wei"),
  recipient: addressSchema.describe("Recipient address on destination chain"),
  maxSubmissionCost: amountSchema.optional().describe("Maximum submission cost for L2 transaction"),
  maxGas: amountSchema.optional().describe("Maximum gas for L2 execution"),
  gasPriceBid: amountSchema.optional().describe("Gas price bid for L2 execution")
});

// ERC20 Bridge Parameters
export const bridgeErc20Params = z.object({
  tokenAddress: addressSchema.describe("ERC20 token contract address"),
  amount: amountSchema.describe("Amount of tokens to bridge in base units"),
  recipient: addressSchema.describe("Recipient address on destination chain"),
  maxSubmissionCost: amountSchema.optional().describe("Maximum submission cost for L2 transaction"),
  maxGas: amountSchema.optional().describe("Maximum gas for L2 execution"),
  gasPriceBid: amountSchema.optional().describe("Gas price bid for L2 execution")
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
const ARBITRUM_BRIDGE_ABI = [
  {
    type: 'function',
    stateMutability: 'payable',
    name: 'depositEth',
    inputs: [
      { name: 'maxSubmissionCost', type: 'uint256' },
      { name: 'maxGas', type: 'uint256' },
      { name: 'gasPriceBid', type: 'uint256' },
      { name: 'data', type: 'bytes' }
    ],
    outputs: [{ name: 'ticketId', type: 'uint256' }]
  },
  {
    type: 'function',
    stateMutability: 'nonpayable',
    name: 'depositERC20',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'maxSubmissionCost', type: 'uint256' },
      { name: 'maxGas', type: 'uint256' },
      { name: 'gasPriceBid', type: 'uint256' },
      { name: 'data', type: 'bytes' }
    ],
    outputs: [{ name: 'ticketId', type: 'uint256' }]
  }
] as const;

// Tool: Bridge ETH to Arbitrum
export const bridgeEthToArbitrum: ToolFunction<z.infer<typeof bridgeEthParams>> = {
  description: "Bridge ETH from Ethereum to Arbitrum via Arbitrum Bridge",
  parameters: bridgeEthParams,
  execute: async ({ amount, recipient, maxSubmissionCost, maxGas, gasPriceBid }) => {
    try {
      const env = validateEnvironment();
      validateAmount(amount);
      const recipientAddr = validateAddress(recipient);
      
      const bridgeAddress = CONTRACT_ADDRESSES.ARBITRUM_BRIDGE[1];
      if (!bridgeAddress) {
        throw new NetworkError('Arbitrum bridge contract not available on Ethereum');
      }
      validateContractAddress(bridgeAddress, 1);

      // Default values for optional parameters
      const submissionCost = maxSubmissionCost || '1000000000000000'; // 0.001 ETH
      const gasLimit = maxGas || '1000000';
      const gasPrice = gasPriceBid || '20000000000'; // 20 gwei

      const client = getPublicClient(1, env);
      
      // Encode the deposit function call
      const data = {
        abi: ARBITRUM_BRIDGE_ABI,
        functionName: 'depositEth' as const,
        args: [
          submissionCost,
          gasLimit,
          gasPrice,
          '0x' // Empty data
        ]
      };

      return {
        transaction: {
          to: bridgeAddress,
          data: data,
          value: amount
        },
        estimatedGas: '200000',
        chainId: 1,
        description: `Bridge ${amount} wei ETH to Arbitrum for recipient ${recipientAddr}`,
        bridgeType: 'eth_to_arbitrum',
        amount,
        recipient: recipientAddr
      };
    } catch (error) {
      if (error instanceof BridgeError) throw error;
      throw new NetworkError(`Failed to create ETH bridge transaction: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
};

// Tool: Bridge ETH from Arbitrum to Ethereum
export const bridgeEthFromArbitrum: ToolFunction<z.infer<typeof bridgeEthParams>> = {
  description: "Bridge ETH from Arbitrum to Ethereum via Arbitrum Bridge",
  parameters: bridgeEthParams,
  execute: async ({ amount, recipient, maxSubmissionCost, maxGas, gasPriceBid }) => {
    try {
      const env = validateEnvironment();
      validateAmount(amount);
      const recipientAddr = validateAddress(recipient);
      
      const bridgeAddress = CONTRACT_ADDRESSES.ARBITRUM_BRIDGE[42161];
      if (!bridgeAddress) {
        throw new NetworkError('Arbitrum bridge contract not available on Arbitrum');
      }
      validateContractAddress(bridgeAddress, 42161);

      // Default values for optional parameters
      const submissionCost = maxSubmissionCost || '1000000000000000'; // 0.001 ETH
      const gasLimit = maxGas || '1000000';
      const gasPrice = gasPriceBid || '20000000000'; // 20 gwei

      const client = getPublicClient(42161, env);
      
      // Encode the deposit function call
      const data = {
        abi: ARBITRUM_BRIDGE_ABI,
        functionName: 'depositEth' as const,
        args: [
          submissionCost,
          gasLimit,
          gasPrice,
          '0x' // Empty data
        ]
      };

      return {
        transaction: {
          to: bridgeAddress,
          data: data,
          value: amount
        },
        estimatedGas: '200000',
        chainId: 42161,
        description: `Bridge ${amount} wei ETH from Arbitrum to Ethereum for recipient ${recipientAddr}`,
        bridgeType: 'eth_from_arbitrum',
        amount,
        recipient: recipientAddr
      };
    } catch (error) {
      if (error instanceof BridgeError) throw error;
      throw new NetworkError(`Failed to create ETH bridge transaction: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
};

// Tool: Bridge ERC20 to Arbitrum
export const bridgeErc20ToArbitrum: ToolFunction<z.infer<typeof bridgeErc20Params>> = {
  description: "Bridge ERC20 tokens from Ethereum to Arbitrum via Arbitrum Bridge",
  parameters: bridgeErc20Params,
  execute: async ({ tokenAddress, amount, recipient, maxSubmissionCost, maxGas, gasPriceBid }) => {
    try {
      const env = validateEnvironment();
      validateAmount(amount);
      const tokenAddr = validateAddress(tokenAddress);
      const recipientAddr = validateAddress(recipient);
      
      const bridgeAddress = CONTRACT_ADDRESSES.ARBITRUM_BRIDGE[1];
      if (!bridgeAddress) {
        throw new NetworkError('Arbitrum bridge contract not available on Ethereum');
      }
      validateContractAddress(bridgeAddress, 1);

      // Default values for optional parameters
      const submissionCost = maxSubmissionCost || '1000000000000000'; // 0.001 ETH
      const gasLimit = maxGas || '1000000';
      const gasPrice = gasPriceBid || '20000000000'; // 20 gwei

      const client = getPublicClient(1, env);
      
      // Encode the deposit function call
      const data = {
        abi: ARBITRUM_BRIDGE_ABI,
        functionName: 'depositERC20' as const,
        args: [
          tokenAddr,
          amount,
          submissionCost,
          gasLimit,
          gasPrice,
          '0x' // Empty data
        ]
      };

      return {
        transaction: {
          to: bridgeAddress,
          data: data,
          value: '0' // ERC20 deposits don't send ETH
        },
        estimatedGas: '250000',
        chainId: 1,
        description: `Bridge ${amount} tokens from ${tokenAddr} to Arbitrum for recipient ${recipientAddr}`,
        bridgeType: 'erc20_to_arbitrum',
        tokenAddress: tokenAddr,
        amount,
        recipient: recipientAddr
      };
    } catch (error) {
      if (error instanceof BridgeError) throw error;
      throw new NetworkError(`Failed to create ERC20 bridge transaction: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
};

// Tool: Bridge ERC20 from Arbitrum to Ethereum
export const bridgeErc20FromArbitrum: ToolFunction<z.infer<typeof bridgeErc20Params>> = {
  description: "Bridge ERC20 tokens from Arbitrum to Ethereum via Arbitrum Bridge",
  parameters: bridgeErc20Params,
  execute: async ({ tokenAddress, amount, recipient, maxSubmissionCost, maxGas, gasPriceBid }) => {
    try {
      const env = validateEnvironment();
      validateAmount(amount);
      const tokenAddr = validateAddress(tokenAddress);
      const recipientAddr = validateAddress(recipient);
      
      const bridgeAddress = CONTRACT_ADDRESSES.ARBITRUM_BRIDGE[42161];
      if (!bridgeAddress) {
        throw new NetworkError('Arbitrum bridge contract not available on Arbitrum');
      }
      validateContractAddress(bridgeAddress, 42161);

      // Default values for optional parameters
      const submissionCost = maxSubmissionCost || '1000000000000000'; // 0.001 ETH
      const gasLimit = maxGas || '1000000';
      const gasPrice = gasPriceBid || '20000000000'; // 20 gwei

      const client = getPublicClient(42161, env);
      
      // Encode the deposit function call
      const data = {
        abi: ARBITRUM_BRIDGE_ABI,
        functionName: 'depositERC20' as const,
        args: [
          tokenAddr,
          amount,
          submissionCost,
          gasLimit,
          gasPrice,
          '0x' // Empty data
        ]
      };

      return {
        transaction: {
          to: bridgeAddress,
          data: data,
          value: '0' // ERC20 deposits don't send ETH
        },
        estimatedGas: '250000',
        chainId: 42161,
        description: `Bridge ${amount} tokens from ${tokenAddr} from Arbitrum to Ethereum for recipient ${recipientAddr}`,
        bridgeType: 'erc20_from_arbitrum',
        tokenAddress: tokenAddr,
        amount,
        recipient: recipientAddr
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

