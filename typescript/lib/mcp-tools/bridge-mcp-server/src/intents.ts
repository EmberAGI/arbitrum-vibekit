import { z } from 'zod';
import type { Address } from 'viem';
import { isAddress } from 'viem';
import { SupportedChainId, addressSchema, envSchema } from './bridge.js';
import { StargateChainId, findBestStargateRoute, type EnhancedBridgeRoute } from './stargate.js';

// Intent Types
export enum IntentType {
  BRIDGE = 'bridge',
  BRIDGE_AND_STAKE = 'bridge_and_stake',
  BRIDGE_AND_SWAP = 'bridge_and_swap',
  BRIDGE_AND_LEND = 'bridge_and_lend',
  FASTEST_BRIDGE = 'fastest_bridge',
  CHEAPEST_BRIDGE = 'cheapest_bridge',
}

export enum Priority {
  SPEED = 'speed',
  COST = 'cost',
  SECURITY = 'security',
  BALANCED = 'balanced',
}

// Token Symbol to Address Mapping
export const TOKEN_ADDRESSES: Record<string, Record<number, Address>> = {
  'USDC': {
    1: '0xA0b86a33E6417c4b7E0b27c4E1b3E6F2f8b3b8c2',
    42161: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    137: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
    10: '0x7F5c764cBc14f9669B88837ca1490cCa17c31607',
  },
  'USDT': {
    1: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    42161: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
  },
  'ETH': {
    1: '0x0000000000000000000000000000000000000000',
    42161: '0x0000000000000000000000000000000000000000',
  },
};

// Chain Name to ID Mapping
export const CHAIN_NAMES: Record<string, number> = {
  'ethereum': 1,
  'mainnet': 1,
  'eth': 1,
  'arbitrum': 42161,
  'arb': 42161,
  'polygon': 137,
  'matic': 137,
  'optimism': 10,
  'op': 10,
};

// Intent Parsing Result Types
interface BasicBridgeExtract {
  amount: string;
  token: string;
  fromChain: string;
  toChain: string;
}

interface RecipientBridgeExtract extends BasicBridgeExtract {
  recipient: string;
}

interface PriorityBridgeExtract extends BasicBridgeExtract {
  priority: string;
}

interface SlippageBridgeExtract extends BasicBridgeExtract {
  maxSlippage: number;
}

interface DeFiBridgeExtract extends BasicBridgeExtract {
  action: string;
}

type ExtractResult = BasicBridgeExtract | RecipientBridgeExtract | PriorityBridgeExtract | SlippageBridgeExtract | DeFiBridgeExtract;

// Intent Parsing Patterns
const INTENT_PATTERNS: Array<{
  pattern: RegExp;
  type: IntentType;
  extract: (match: RegExpMatchArray) => ExtractResult;
}> = [
  // Basic bridge: "bridge 100 USDC from arbitrum to ethereum"
  {
    pattern: /bridge\s+(\d+(?:\.\d+)?)\s+(\w+)\s+from\s+(\w+)\s+to\s+(\w+)/i,
    type: IntentType.BRIDGE,
    extract: (match: RegExpMatchArray): BasicBridgeExtract => ({
      amount: match[1]!,
      token: match[2]!.toUpperCase(),
      fromChain: match[3]!.toLowerCase(),
      toChain: match[4]!.toLowerCase(),
    }),
  },
  // With recipient: "send 500 USDC from arbitrum to polygon to 0x123..."
  {
    pattern: /send\s+(\d+(?:\.\d+)?)\s+(\w+)\s+from\s+(\w+)\s+to\s+(\w+)\s+to\s+(0x[a-fA-F0-9]{40})/i,
    type: IntentType.BRIDGE,
    extract: (match: RegExpMatchArray): RecipientBridgeExtract => ({
      amount: match[1]!,
      token: match[2]!.toUpperCase(),
      fromChain: match[3]!.toLowerCase(),
      toChain: match[4]!.toLowerCase(),
      recipient: match[5]!,
    }),
  },
  // Priority-based: "fastest bridge 1000 USDC arbitrum to ethereum"
  {
    pattern: /(fastest|cheapest|safest)\s+bridge\s+(\d+(?:\.\d+)?)\s+(\w+)\s+(\w+)\s+to\s+(\w+)/i,
    type: IntentType.FASTEST_BRIDGE,
    extract: (match: RegExpMatchArray): PriorityBridgeExtract => ({
      priority: match[1]!.toLowerCase(),
      amount: match[2]!,
      token: match[3]!.toUpperCase(),
      fromChain: match[4]!.toLowerCase(),
      toChain: match[5]!.toLowerCase(),
    }),
  },
  // With slippage: "bridge 100 USDC arbitrum to ethereum max 0.5% slippage"
  {
    pattern: /bridge\s+(\d+(?:\.\d+)?)\s+(\w+)\s+(\w+)\s+to\s+(\w+)\s+max\s+(\d+(?:\.\d+)?)%\s+slippage/i,
    type: IntentType.BRIDGE,
    extract: (match: RegExpMatchArray): SlippageBridgeExtract => ({
      amount: match[1]!,
      token: match[2]!.toUpperCase(),
      fromChain: match[3]!.toLowerCase(),
      toChain: match[4]!.toLowerCase(),
      maxSlippage: parseFloat(match[5]!) * 100, // Convert to bps
    }),
  },
  // DeFi composition: "bridge and stake 100 USDC from arbitrum to ethereum"
  {
    pattern: /bridge\s+and\s+(stake|swap|lend)\s+(\d+(?:\.\d+)?)\s+(\w+)\s+from\s+(\w+)\s+to\s+(\w+)/i,
    type: IntentType.BRIDGE_AND_STAKE,
    extract: (match: RegExpMatchArray): DeFiBridgeExtract => ({
      action: match[1]!.toLowerCase(),
      amount: match[2]!,
      token: match[3]!.toUpperCase(),
      fromChain: match[4]!.toLowerCase(),
      toChain: match[5]!.toLowerCase(),
    }),
  },
];

// Parsed Intent Structure
export interface ParsedIntent {
  type: IntentType;
  priority: Priority;
  amount: string;
  token: string;
  fromChain: number;
  toChain: number;
  recipient?: Address;
  maxSlippage?: number;
  maxDeadline?: number;
  additionalActions?: {
    type: 'stake' | 'swap' | 'lend';
    protocol?: string;
    parameters?: Record<string, any>;
  }[];
}

// Intent Input Schema
export const intentInput = z.object({
  intent: z.string().describe('Natural language bridge intent'),
  userAddress: addressSchema.optional().describe('Default recipient address'),
  maxSlippageBps: z.number().int().min(1).max(1000).default(50).describe('Max slippage in basis points'),
  maxDeadlineMinutes: z.number().int().min(5).max(180).default(20).describe('Max deadline in minutes'),
});

// Protocol Comparison Result
export interface ProtocolComparison {
  protocol: 'across' | 'stargate';
  route: EnhancedBridgeRoute;
  estimatedCost: string;
  estimatedTime: string;
  securityScore: number;
  liquidityScore: number;
  recommended: boolean;
  reasons: string[];
}

// Intent Execution Plan
export interface IntentExecutionPlan {
  intent: ParsedIntent;
  selectedProtocol: 'across' | 'stargate';
  route: EnhancedBridgeRoute;
  transactions: {
    type: 'approval' | 'permit' | 'bridge' | 'defi';
    description: string;
    transaction: any;
  }[];
  estimatedTotalCost: string;
  estimatedTotalTime: string;
  warnings: string[];
}

// Intent Parser Functions
export function parseIntent(intentText: string): ParsedIntent | null {
  const normalizedIntent = intentText.trim().toLowerCase();
  
  for (const { pattern, type, extract } of INTENT_PATTERNS) {
    const match = normalizedIntent.match(pattern);
    if (match) {
      try {
        const extracted = extract(match);
        
        // Resolve chain names to IDs
        const fromChainId = CHAIN_NAMES[extracted.fromChain];
        const toChainId = CHAIN_NAMES[extracted.toChain];
        
        if (!fromChainId || !toChainId) {
          throw new Error(`Unsupported chain: ${extracted.fromChain} or ${extracted.toChain}`);
        }
        
        // Resolve token symbol to address
        const tokenAddresses = TOKEN_ADDRESSES[extracted.token];
        if (!tokenAddresses || !tokenAddresses[fromChainId]) {
          throw new Error(`Token ${extracted.token} not supported on chain ${extracted.fromChain}`);
        }
        
        // Determine priority
        let priority = Priority.BALANCED;
        if ('priority' in extracted) {
          if (extracted.priority === 'fastest') priority = Priority.SPEED;
          else if (extracted.priority === 'cheapest') priority = Priority.COST;
          else if (extracted.priority === 'safest') priority = Priority.SECURITY;
        }
        
        // Convert amount to base units (assuming token decimals)
        const decimals = extracted.token === 'USDC' || extracted.token === 'USDT' ? 6 : 18;
        const baseAmount = (parseFloat(extracted.amount) * Math.pow(10, decimals)).toString();
        
        const result: ParsedIntent = {
          type,
          priority,
          amount: baseAmount,
          token: extracted.token,
          fromChain: fromChainId,
          toChain: toChainId,
        };
        
        // Add optional fields
        if ('recipient' in extracted) {
          result.recipient = extracted.recipient as Address;
        }
        if ('maxSlippage' in extracted) {
          result.maxSlippage = extracted.maxSlippage;
        }
        if ('action' in extracted) {
          result.additionalActions = [{
            type: extracted.action as 'stake' | 'swap' | 'lend'
          }];
        }
        
        return result;
      } catch (error) {
        console.error('Intent parsing error:', error);
        return null;
      }
    }
  }
  
  return null;
}

export function compareProtocols(
  intent: ParsedIntent,
  acrossRoute: EnhancedBridgeRoute | null,
  stargateRoute: EnhancedBridgeRoute | null
): ProtocolComparison[] {
  const comparisons: ProtocolComparison[] = [];
  
  if (acrossRoute) {
    comparisons.push({
      protocol: 'across',
      route: acrossRoute,
      estimatedCost: acrossRoute.estimatedFee || '0.05%',
      estimatedTime: '10-15 minutes',
      securityScore: 9, // Across has strong security record
      liquidityScore: 8, // Good liquidity on major pairs
      recommended: false,
      reasons: ['Fast execution', 'Low fees', 'Proven security'],
    });
  }
  
  if (stargateRoute) {
    const isCreditBased = stargateRoute.poolInfo?.creditBased;
    comparisons.push({
      protocol: 'stargate',
      route: stargateRoute,
      estimatedCost: isCreditBased ? '0.03%' : '0.06%',
      estimatedTime: isCreditBased ? '1-5 minutes' : '10-20 minutes',
      securityScore: 8, // Stargate is well-audited
      liquidityScore: 9, // Excellent liquidity through unified pools
      recommended: false,
      reasons: [
        isCreditBased ? 'Instant settlement' : 'Reliable execution',
        'Unified liquidity',
        'Multi-chain support',
      ],
    });
  }
  
  // Apply priority-based recommendations
  if (comparisons.length > 0) {
    let recommended: ProtocolComparison;
    
    switch (intent.priority) {
      case Priority.SPEED:
        recommended = comparisons.reduce((best, current) => 
          parseFloat(current.estimatedTime) < parseFloat(best.estimatedTime) ? current : best
        );
        break;
      case Priority.COST:
        recommended = comparisons.reduce((best, current) => 
          parseFloat(current.estimatedCost) < parseFloat(best.estimatedCost) ? current : best
        );
        break;
      case Priority.SECURITY:
        recommended = comparisons.reduce((best, current) => 
          current.securityScore > best.securityScore ? current : best
        );
        break;
      default:
        // Balanced: weighted score
        recommended = comparisons.reduce((best, current) => {
          const currentScore = (current.securityScore + current.liquidityScore) / 2;
          const bestScore = (best.securityScore + best.liquidityScore) / 2;
          return currentScore > bestScore ? current : best;
        });
    }
    
    recommended.recommended = true;
    recommended.reasons.unshift('⭐ Recommended based on your priority');
  }
  
  return comparisons;
}

export async function createExecutionPlan(
  intent: ParsedIntent,
  comparison: ProtocolComparison[],
  userAddress?: Address
): Promise<IntentExecutionPlan> {
  const recommended = comparison.find(c => c.recommended);
  if (!recommended) {
    throw new Error('No suitable protocol found for this intent');
  }
  
  const recipient = intent.recipient || userAddress;
  if (!recipient) {
    throw new Error('Recipient address required');
  }
  
  const transactions = [];
  const warnings = [];
  
  // Add approval/permit transaction
  const tokenAddresses = TOKEN_ADDRESSES[intent.token];
  const tokenAddress = tokenAddresses?.[intent.fromChain];
  if (!tokenAddress) {
    throw new Error(`Token ${intent.token} not supported on chain ${intent.fromChain}`);
  }
  
  if (recommended.protocol === 'across') {
    transactions.push({
      type: 'permit' as const,
      description: `Approve ${intent.token} for Across bridge`,
      transaction: {
        // This would be built using existing permit functions
        type: 'permit2',
        token: tokenAddress,
        amount: intent.amount,
      },
    });
  } else {
    transactions.push({
      type: 'approval' as const,
      description: `Approve ${intent.token} for Stargate bridge`,
      transaction: {
        type: 'approval',
        token: tokenAddress,
        amount: intent.amount,
      },
    });
  }
  
  // Add bridge transaction
  transactions.push({
    type: 'bridge' as const,
    description: `Bridge ${intent.token} via ${recommended.protocol}`,
    transaction: recommended.route,
  });
  
  // Add DeFi actions if specified
  if (intent.additionalActions) {
    for (const action of intent.additionalActions) {
      transactions.push({
        type: 'defi' as const,
        description: `${action.type.charAt(0).toUpperCase() + action.type.slice(1)} ${intent.token} on destination`,
        transaction: {
          type: action.type,
          // This would be expanded with actual DeFi protocol integration
        },
      });
      warnings.push(`DeFi action (${action.type}) requires additional setup on destination chain`);
    }
  }
  
  // Calculate totals
  const bridgeCost = parseFloat(recommended.estimatedCost.replace('%', ''));
  const estimatedTotalCost = `${bridgeCost + 0.01}%`; // Add gas estimation
  
  return {
    intent,
    selectedProtocol: recommended.protocol,
    route: recommended.route,
    transactions,
    estimatedTotalCost,
    estimatedTotalTime: recommended.estimatedTime,
    warnings,
  };
}

// Main Intent Processing Function
export async function processIntent(
  input: z.infer<typeof intentInput>,
  env: z.infer<typeof envSchema>
): Promise<{
  parsed: ParsedIntent | null;
  comparison: ProtocolComparison[];
  executionPlan: IntentExecutionPlan | null;
  error?: string;
}> {
  try {
    // Parse the natural language intent
    const parsed = parseIntent(input.intent);
    if (!parsed) {
      return {
        parsed: null,
        comparison: [],
        executionPlan: null,
        error: 'Could not understand the intent. Try: "bridge 100 USDC from arbitrum to ethereum"',
      };
    }
    
    // Apply user preferences
    if (input.maxSlippageBps) {
      parsed.maxSlippage = input.maxSlippageBps;
    }
    if (input.maxDeadlineMinutes) {
      parsed.maxDeadline = input.maxDeadlineMinutes;
    }
    
    // Find available routes
    const tokenAddressesIn = TOKEN_ADDRESSES[parsed.token];
    const tokenAddressesOut = TOKEN_ADDRESSES[parsed.token];
    const tokenInAddress = tokenAddressesIn?.[parsed.fromChain];
    const tokenOutAddress = tokenAddressesOut?.[parsed.toChain];
    
    if (!tokenInAddress || !tokenOutAddress) {
      return {
        parsed,
        comparison: [],
        executionPlan: null,
        error: `Token ${parsed.token} not supported on source or destination chain`,
      };
    }
    
    // Check Across route (simplified - would use existing functions)
    const acrossRoute: EnhancedBridgeRoute | null = {
      protocol: 'across',
      originChainId: parsed.fromChain,
      destinationChainId: parsed.toChain,
      tokenIn: tokenInAddress,
      tokenOut: tokenOutAddress,
      estimatedFee: '0.05%',
      estimatedTime: '10-15 minutes',
    };
    
    // Check Stargate route
    const stargateRoute = findBestStargateRoute(
      parsed.fromChain,
      parsed.toChain,
      tokenInAddress,
      tokenOutAddress
    );
    
    // Compare protocols
    const comparison = compareProtocols(parsed, acrossRoute, stargateRoute);
    
    // Create execution plan
    let executionPlan: IntentExecutionPlan | null = null;
    if (comparison.length > 0) {
      executionPlan = await createExecutionPlan(
        parsed,
        comparison,
        input.userAddress
      );
    }
    
    return {
      parsed,
      comparison,
      executionPlan,
    };
  } catch (error) {
    return {
      parsed: null,
      comparison: [],
      executionPlan: null,
      error: error instanceof Error ? error.message : 'Unknown error processing intent',
    };
  }
}
