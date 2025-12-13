import { CurrencyAmount, Token, TradeType, Percent } from '@uniswap/sdk-core';
import { AlphaRouter, SwapType } from '@uniswap/smart-order-router';
// SwapRouter removed - using trade.methodParameters directly
import { utils } from 'ethers';
const { getAddress } = utils;
import { Contract } from 'ethers';
import type {
  GenerateSwapTransactionRequest,
  GenerateSwapTransactionResponse,
} from '../schemas/index.js';
import { getProvider } from '../utils/provider.js';
import { getChainConfig } from '../utils/chain-config.js';
import {
  validateAddress,
  validatePositiveAmount,
  validateSlippageTolerance,
} from '../utils/validation.js';
import { TransactionError, RoutingError } from '../errors/index.js';

/**
 * Generate executable swap transaction calldata
 */
export async function generateSwapTransaction(
  request: GenerateSwapTransactionRequest
): Promise<GenerateSwapTransactionResponse> {
  // Validate inputs
  const recipient = validateAddress(request.recipient);
  const slippageTolerance = validateSlippageTolerance(
    request.slippageTolerance
  );

  if (!request.amountIn && !request.amountOut) {
    throw new TransactionError(
      'Either amountIn or amountOut must be provided'
    );
  }

  const provider = getProvider(request.chainId);
  const chainConfig = getChainConfig(request.chainId);

  // Get first and last tokens from route
  const tokenInAddress = request.route.hops[0]?.tokenIn;
  const tokenOutAddress = request.route.hops[request.route.hops.length - 1]
    ?.tokenOut;

  if (!tokenInAddress || !tokenOutAddress) {
    throw new TransactionError('Invalid route: missing tokens');
  }

  // Create token instances
  const tokenInContract = new Contract(
    tokenInAddress,
    [
      'function decimals() view returns (uint8)',
      'function symbol() view returns (string)',
      'function name() view returns (string)',
    ],
    provider
  );

  const tokenOutContract = new Contract(
    tokenOutAddress,
    [
      'function decimals() view returns (uint8)',
      'function symbol() view returns (string)',
      'function name() view returns (string)',
    ],
    provider
  );

  const [tokenInDecimals, tokenOutDecimals, tokenInSymbol, tokenOutSymbol, tokenInName, tokenOutName] = await Promise.all([
    tokenInContract['decimals'](),
    tokenOutContract['decimals'](),
    tokenInContract['symbol'](),
    tokenOutContract['symbol'](),
    tokenInContract['name'](),
    tokenOutContract['name'](),
  ]);

  const tokenIn = new Token(
    request.chainId,
    tokenInAddress,
    tokenInDecimals,
    tokenInSymbol,
    tokenInName
  );

  const tokenOut = new Token(
    request.chainId,
    tokenOutAddress,
    tokenOutDecimals,
    tokenOutSymbol,
    tokenOutName
  );

  // Determine amount and trade type
  const isExactInput = !!request.amountIn;
  const amount = isExactInput
    ? validatePositiveAmount(request.amountIn!)
    : validatePositiveAmount(request.amountOut!);

  const currencyAmount = CurrencyAmount.fromRawAmount(
    isExactInput ? tokenIn : tokenOut,
    amount.toString()
  );

  // Initialize router to get the route
  const router = new AlphaRouter({
    chainId: request.chainId,
    provider,
  });

  const route = await router.route(
    isExactInput ? currencyAmount : CurrencyAmount.fromRawAmount(tokenIn, '0'),
    isExactInput ? tokenOut : currencyAmount.currency,
    isExactInput ? TradeType.EXACT_INPUT : TradeType.EXACT_OUTPUT,
    {
      recipient,
      slippageTolerance: new Percent(
        Math.floor(slippageTolerance * 100),
        10000
      ),
      deadline:
        request.deadline || Math.floor(Date.now() / 1000) + 60 * 20,
      type: SwapType.SWAP_ROUTER_02,
    }
  );

  if (!route) {
    throw new RoutingError('No route found for transaction generation');
  }

  // Generate transaction parameters using Universal Router
  // The route object from AlphaRouter contains methodParameters with calldata
  const calculatedDeadline = request.deadline || Math.floor(Date.now() / 1000) + 60 * 20;

  // Use the route's methodParameters which contains the encoded swap calldata
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const methodParameters = (route as any).methodParameters;

  if (!methodParameters || !methodParameters.calldata || methodParameters.calldata === '0x') {
    throw new TransactionError(
      'Unable to generate transaction calldata. Route may not support direct execution. Use getSwapQuote to verify route availability.'
    );
  }

  // Estimate gas
  const gasEstimate = route.estimatedGasUsed
    ? route.estimatedGasUsed.toString()
    : '200000'; // Default estimate

  return {
    to: getAddress(chainConfig.uniswap.universalRouter),
    data: methodParameters.calldata,
    value: methodParameters.value || '0',
    gasEstimate,
    deadline: calculatedDeadline,
  };
}

