import { getAddress } from 'ethers/lib/utils';
import type {
  ProcessSwapIntentRequest,
  ProcessSwapIntentResponse,
} from '../schemas/index.js';
import { getSwapQuote } from './getSwapQuote.js';
import { getBestRoute } from './getBestRoute.js';
import { generateSwapTransaction } from './generateSwapTransaction.js';
import { validateSwapFeasibility } from './validateSwapFeasibility.js';
import {
  validateAddress,
  validateSlippageTolerance,
} from '../utils/validation.js';
import { loadConfig } from '../utils/config.js';
import { ValidationError } from '../errors/index.js';

/**
 * Common token addresses for intent parsing
 */
const COMMON_TOKENS: Record<string, Record<number, string>> = {
  ETH: {
    1: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
    42161: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
  },
  WETH: {
    1: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    42161: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
  },
  USDC: {
    1: '0xA0b86991c6218b36c1d19D4a2e9Eb0c3606eB48',
    42161: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
  },
  USDT: {
    1: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    42161: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
  },
  DAI: {
    1: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
    42161: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1',
  },
};

/**
 * Parse natural language swap intent into structured parameters
 */
function parseSwapIntent(
  intent: string,
  chainId: number
): {
  tokenIn: string;
  tokenOut: string;
  amount: bigint;
  slippageTolerance?: number;
} {
  const lowerIntent = intent.toLowerCase();

  // Extract amount (look for numbers followed by token symbols)
  const amountMatch = lowerIntent.match(/(\d+\.?\d*)\s*(eth|weth|usdc|usdt|dai)/i);
  if (!amountMatch) {
    throw new ValidationError(
      'Could not parse amount and token from intent. Format: "Swap X TOKEN to TOKEN"'
    );
  }

  const amount = parseFloat(amountMatch[1]!);
  const fromTokenSymbol = amountMatch[2]!.toUpperCase();

  // Extract destination token
  const toTokenMatch = lowerIntent.match(/to\s+(\w+)/i);
  if (!toTokenMatch) {
    throw new ValidationError(
      'Could not parse destination token from intent. Format: "Swap X TOKEN to TOKEN"'
    );
  }

  const toTokenSymbol = toTokenMatch[1]!.toUpperCase();

  // Resolve token addresses
  const tokenInAddress = COMMON_TOKENS[fromTokenSymbol]?.[chainId];
  const tokenOutAddress = COMMON_TOKENS[toTokenSymbol]?.[chainId];

  if (!tokenInAddress) {
    throw new ValidationError(
      `Token "${fromTokenSymbol}" not recognized. Please provide a token address.`
    );
  }

  if (!tokenOutAddress) {
    throw new ValidationError(
      `Token "${toTokenSymbol}" not recognized. Please provide a token address.`
    );
  }

  // Extract slippage if mentioned
  let slippageTolerance: number | undefined;
  const slippageMatch = lowerIntent.match(
    /(?:slippage|max.*slippage|tolerance)[:\s]+(\d+\.?\d*)%/i
  );
  if (slippageMatch) {
    slippageTolerance = parseFloat(slippageMatch[1]!);
  }

  // Convert amount to wei (assuming 18 decimals for now)
  // In production, you'd fetch actual decimals
  const amountWei = BigInt(Math.floor(amount * 10 ** 18));

  return {
    tokenIn: tokenInAddress,
    tokenOut: tokenOutAddress,
    amount: amountWei,
    slippageTolerance,
  };
}

/**
 * Process natural language swap intent into structured swap plan
 */
export async function processSwapIntent(
  request: ProcessSwapIntentRequest
): Promise<ProcessSwapIntentResponse> {
  const config = loadConfig();

  // Parse intent
  const parsed = parseSwapIntent(request.intent, request.chainId);

  // Get quote
  const slippageTolerance =
    parsed.slippageTolerance ?? config.defaultSlippage;
  const quote = await getSwapQuote({
    tokenIn: parsed.tokenIn,
    tokenOut: parsed.tokenOut,
    amount: parsed.amount,
    chainId: request.chainId,
    slippageTolerance,
  });

  // Get best route
  const route = await getBestRoute({
    tokenIn: parsed.tokenIn,
    tokenOut: parsed.tokenOut,
    amount: parsed.amount,
    chainId: request.chainId,
  });

  // Generate transaction if user address provided
  let transaction;
  if (request.userAddress) {
    const userAddress = validateAddress(request.userAddress);
    transaction = await generateSwapTransaction({
      route: route.route,
      amountIn: parsed.amount,
      slippageTolerance,
      recipient: userAddress,
      chainId: request.chainId,
    });
  }

  // Validate feasibility if user address provided
  let validation;
  if (request.userAddress) {
    const userAddress = validateAddress(request.userAddress);
    validation = await validateSwapFeasibility({
      tokenIn: parsed.tokenIn,
      tokenOut: parsed.tokenOut,
      amount: parsed.amount,
      chainId: request.chainId,
      userAddress,
      slippageTolerance,
    });
  }

  return {
    tokenIn: parsed.tokenIn,
    tokenOut: parsed.tokenOut,
    amount: parsed.amount.toString(),
    slippageTolerance,
    quote,
    transaction,
    validation,
  };
}

