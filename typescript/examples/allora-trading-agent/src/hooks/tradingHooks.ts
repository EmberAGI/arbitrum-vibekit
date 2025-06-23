/**
 * Trading Hooks - Pre and post processing for trading tools
 * Implements risk management and validation logic
 */

import type { HookFunction } from 'arbitrum-vibekit-core';
import { VibkitError } from 'arbitrum-vibekit-core';
import { getTokenInfo, SUPPORTED_CHAINS, getChainName } from '../utils/tokenRegistry.js';
import { DEFAULT_RISK_PARAMS, validateTradeParameters } from '../utils/riskAssessment.js';

/**
 * Pre-hook for trade execution - validates and enhances trade parameters
 */
export const validateTradeHook: HookFunction<any, any> = async (args, context) => {
  console.log('[ValidateTradeHook] Validating trade parameters:', args);

  // Ensure required parameters
  if (!args.fromToken || !args.toToken) {
    throw new VibkitError('ValidationError', -32602, 'Missing required token parameters');
  }

  if (!args.userAddress) {
    throw new VibkitError('ValidationError', -32602, 'User address is required for trade execution');
  }

  // Set defaults
  args.chainId = args.chainId || SUPPORTED_CHAINS.ARBITRUM;
  args.slippage = args.slippage || DEFAULT_RISK_PARAMS.defaultSlippagePercent;

  // Validate trade parameters
  const validation = validateTradeParameters(args.amount, args.slippage, args.userAddress);

  if (!validation.valid) {
    throw new VibkitError('ValidationError', -32602, `Invalid trade parameters: ${validation.errors.join(', ')}`);
  }

  // Check token support
  const fromTokenInfo = getTokenInfo(args.fromToken, args.chainId);
  const toTokenInfo = getTokenInfo(args.toToken, args.chainId);

  if (!fromTokenInfo || !toTokenInfo) {
    const unsupportedToken = !fromTokenInfo ? args.fromToken : args.toToken;
    throw new VibkitError(
      'TokenError',
      -32602,
      `Token ${unsupportedToken} not supported on ${getChainName(args.chainId)}`,
    );
  }

  // Add token info to args for use in the tool
  args._tokenInfo = {
    from: fromTokenInfo,
    to: toTokenInfo,
  };

  console.log('[ValidateTradeHook] Validation passed, enhanced args:', args);
  return args;
};

/**
 * Post-hook for trade execution - adds risk warnings and summary
 */
export const enhanceTradeResultHook: HookFunction<any, any> = async (result, context) => {
  console.log('[EnhanceTradeResultHook] Enhancing trade result');

  // If the task failed, return as-is
  if (result.status?.state === 'failed') {
    return result;
  }

  // Extract trade details from the result if available
  const originalMessage = result.status?.message?.parts?.[0]?.text || '';

  // Add risk warnings
  const riskWarnings = [
    '',
    '⚠️  Risk Warnings:',
    '• This is a decentralized transaction - always verify details',
    '• Slippage may result in receiving less than expected',
    '• Gas fees are not included in the displayed amounts',
    '• Always check your wallet for the final transaction details',
  ];

  // Enhance the message with warnings
  const enhancedMessage = originalMessage + riskWarnings.join('\n');

  // Update the result message
  if (result.status?.message?.parts?.[0]) {
    result.status.message.parts[0].text = enhancedMessage;
  }

  return result;
};

/**
 * Pre-hook for analysis tools - ensures minimum data quality
 */
export const validateAnalysisDataHook: HookFunction<any, any> = async (args, context) => {
  console.log('[ValidateAnalysisDataHook] Validating analysis data:', args);

  // Ensure prediction data quality
  if (args.currentPrice && args.predictedPrice) {
    // Check for unrealistic price movements (>50%)
    const priceChange = Math.abs((args.predictedPrice - args.currentPrice) / args.currentPrice);
    if (priceChange > 0.5) {
      console.warn('[ValidateAnalysisDataHook] Warning: Extreme price movement detected (>50%)');
      args._warnings = args._warnings || [];
      args._warnings.push('Extreme price movement detected - prediction may be unreliable');
    }
  }

  // Ensure confidence is within bounds
  if (args.confidence !== undefined) {
    args.confidence = Math.max(0, Math.min(1, args.confidence));
  }

  // Set default portfolio value if not provided
  args.portfolioValue = args.portfolioValue || 10000;

  return args;
};

/**
 * Post-hook for workflow tools - adds execution summary
 */
export const summarizeWorkflowHook: HookFunction<any, any> = async (result, context) => {
  console.log('[SummarizeWorkflowHook] Adding workflow summary');

  // Only process successful results
  if (result.status?.state !== 'completed') {
    return result;
  }

  // Add timestamp to the result
  const timestamp = new Date().toISOString();
  const summaryFooter = ['', '---', `⏰ Executed at: ${timestamp}`, '💡 Tip: Save this summary for your records'].join(
    '\n',
  );

  // Append to existing message
  if (result.status?.message?.parts?.[0]?.text) {
    result.status.message.parts[0].text += summaryFooter;
  }

  return result;
};
