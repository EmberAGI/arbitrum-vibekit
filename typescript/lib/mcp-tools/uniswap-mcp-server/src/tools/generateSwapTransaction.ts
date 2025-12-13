import { CurrencyAmount, Token, TradeType } from '@uniswap/sdk-core';
import { AlphaRouter, SwapType } from '@uniswap/smart-order-router';
import { SwapRouter02 } from '@uniswap/universal-router-sdk';
import { getAddress } from 'ethers/lib/utils';
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

  const [tokenInDecimals, tokenOutDecimals] = await Promise.all([
    tokenInContract.decimals(),
    tokenOutContract.decimals(),
  ]);

  const tokenIn = new Token(
    request.chainId,
    tokenInAddress,
    tokenInDecimals,
    await tokenInContract.symbol(),
    await tokenInContract.name()
  );

  const tokenOut = new Token(
    request.chainId,
    tokenOutAddress,
    tokenOutDecimals,
    await tokenOutContract.symbol(),
    await tokenOutContract.name()
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
      slippageTolerance: {
        numerator: Math.floor(slippageTolerance * 100),
        denominator: 10000,
      },
      deadline:
        request.deadline || Math.floor(Date.now() / 1000) + 60 * 20,
      type: SwapType.SWAP_ROUTER_02,
    }
  );

  if (!route) {
    throw new RoutingError('No route found for transaction generation');
  }

  // Generate transaction parameters
  const methodParameters = SwapRouter02.swapCallParameters(route.trade, {
    recipient,
    slippageTolerance: {
      numerator: Math.floor(slippageTolerance * 100),
      denominator: 10000,
    },
    deadline:
      request.deadline || Math.floor(Date.now() / 1000) + 60 * 20,
  });

  // Estimate gas
  const gasEstimate = route.estimatedGasUsed
    ? route.estimatedGasUsed.toString()
    : '200000'; // Default estimate

  return {
    to: getAddress(chainConfig.uniswap.universalRouter),
    data: methodParameters.calldata,
    value: methodParameters.value || '0',
    gasEstimate,
    deadline: request.deadline || Math.floor(Date.now() / 1000) + 60 * 20,
  };
}

