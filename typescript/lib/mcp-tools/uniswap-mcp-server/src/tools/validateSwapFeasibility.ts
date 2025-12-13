import { Contract } from 'ethers';
import type {
  ValidateSwapFeasibilityRequest,
  ValidationResult,
} from '../schemas/index.js';
import { getProvider } from '../utils/provider.js';
import {
  validateAddress,
  validatePositiveAmount,
  validateDifferentTokens,
  validateSlippageTolerance,
} from '../utils/validation.js';
import { getSwapQuote } from './getSwapQuote.js';
import { loadConfig } from '../utils/config.js';
import {
  TokenError,
  LiquidityError,
} from '../errors/index.js';

/**
 * Validate swap feasibility before execution
 */
export async function validateSwapFeasibility(
  request: ValidateSwapFeasibilityRequest
): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Validate inputs
  const tokenIn = validateAddress(request.tokenIn);
  const tokenOut = validateAddress(request.tokenOut);
  validateDifferentTokens(tokenIn, tokenOut);
  const amount = validatePositiveAmount(request.amount);
  const userAddress = validateAddress(request.userAddress);
  const slippageTolerance =
    request.slippageTolerance !== undefined
      ? validateSlippageTolerance(request.slippageTolerance)
      : loadConfig().defaultSlippage;

  const provider = getProvider(request.chainId);

  // Check token validity
  try {
    const tokenInCode = await provider.getCode(tokenIn);
    const tokenOutCode = await provider.getCode(tokenOut);

    if (tokenInCode === '0x' && tokenIn.toLowerCase() !== '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee') {
      errors.push(`Token in address ${tokenIn} is not a contract`);
    }

    if (tokenOutCode === '0x' && tokenOut.toLowerCase() !== '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee') {
      errors.push(`Token out address ${tokenOut} is not a contract`);
    }
  } catch (error) {
    errors.push(
      `Failed to validate token addresses: ${(error as Error).message}`
    );
  }

  // Check user balance
  let userBalance: bigint;
  try {
    if (tokenIn.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee') {
      // Native token
      const balance = await provider.getBalance(userAddress);
      userBalance = BigInt(balance.toString());
    } else {
      const erc20Contract = new Contract(
        tokenIn,
        ['function balanceOf(address) view returns (uint256)'],
        provider
      );
      const balance = await erc20Contract['balanceOf'](userAddress);
      userBalance = BigInt(balance.toString());
    }

    if (userBalance < amount) {
      errors.push(
        `Insufficient balance: have ${userBalance.toString()}, need ${amount.toString()}`
      );
    }
  } catch (error) {
    errors.push(`Failed to check balance: ${(error as Error).message}`);
    userBalance = 0n;
  }

  // Check liquidity availability by attempting to get a quote
  let estimatedAmountOut: string | undefined;
  try {
    const quote = await getSwapQuote({
      tokenIn,
      tokenOut,
      amount,
      chainId: request.chainId,
      slippageTolerance,
    });
    estimatedAmountOut = quote.expectedAmountOut;

    // Check if price impact is too high
    const priceImpact = parseFloat(quote.priceImpact);
    if (priceImpact > 5) {
      warnings.push(
        `High price impact: ${priceImpact.toFixed(2)}%. Consider using a different route or smaller amount.`
      );
    }
  } catch (error) {
    if (error instanceof LiquidityError || error instanceof TokenError) {
      errors.push(`Liquidity check failed: ${error.message}`);
    } else {
      warnings.push(
        `Could not verify liquidity: ${(error as Error).message}`
      );
    }
  }

  // Check approval requirements (for ERC20 tokens)
  let requiresApproval = false;
  let currentAllowance: string | undefined;

  if (tokenIn.toLowerCase() !== '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee') {
    try {
      const erc20Contract = new Contract(
        tokenIn,
        [
          'function allowance(address owner, address spender) view returns (uint256)',
        ],
        provider
      );

      // Universal Router address
      const { getChainConfig } = await import('../utils/chain-config.js');
      const chainConfig = getChainConfig(request.chainId);
      const routerAddress = chainConfig.uniswap.universalRouter;

      const allowance = await erc20Contract['allowance'](userAddress, routerAddress);
      currentAllowance = allowance.toString();

      if (currentAllowance && BigInt(currentAllowance) < amount) {
        requiresApproval = true;
        warnings.push(
          `Approval required: current allowance ${currentAllowance} is less than amount ${amount.toString()}`
        );
      }
    } catch (error) {
      warnings.push(
        `Could not check approval status: ${(error as Error).message}`
      );
    }
  }

  // Check slippage bounds
  if (slippageTolerance > 10) {
    warnings.push(
      `High slippage tolerance: ${slippageTolerance}%. This may result in significant price impact.`
    );
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    requiresApproval,
    currentAllowance,
    userBalance: userBalance.toString(),
    estimatedAmountOut,
  };
}

