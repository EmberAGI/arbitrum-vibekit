/**
 * Lending-specific test utilities
 */

import type { GetWalletPositionsResponse } from '@emberai/sdk-typescript';
import type { UserReserve } from 'ember-schemas';
import type { TransactionPlan } from './transactions.js';

/**
 * Extract transaction plan from artifacts
 */
export function extractTransactionPlan(
  response: any
): Array<TransactionPlan> {
  if (!response.artifacts) {
    throw new Error('No artifacts found in response');
  }

  // Look for transaction-plan artifact
  for (const artifact of response.artifacts) {
    if (artifact.name === 'transaction-plan') {
      for (const part of artifact.parts || []) {
        if (part.type === 'data' && part.data?.txPlan) {
          return part.data.txPlan;
        }
      }
    }
  }

  throw new Error('No transaction plan found in artifacts');
}

/**
 * Extract positions data from response
 */
export function extractPositionsData(response: any): GetWalletPositionsResponse {
  if (!response.artifacts) {
    throw new Error('No artifacts found in response');
  }

  // Look for positions artifact (support both legacy and new names)
  for (const artifact of response.artifacts) {
    if (artifact.name === 'positions' || artifact.name === 'wallet-positions') {
      for (const part of artifact.parts || []) {
        if (part.type === 'data' && part.data?.positions) {
          return part.data;
        }
      }
    }
  }

  // Debug: log available artifact names before throwing an error
  try {
    const names = response.artifacts.map((a: any) => a.name).join(', ');
    // eslint-disable-next-line no-console
    console.log(`[extractPositionsData] Available artifact names: ${names}`);
  } catch (_) {
    // ignore logging errors
  }

  throw new Error('No positions data found in artifacts');
}

/**
 * Finds the reserve information for a given token symbol or name within the positions response.
 */
export function getReserveForToken(
  response: GetWalletPositionsResponse,
  tokenNameOrSymbol: string
): UserReserve {
  for (const position of response.positions) {
    if (!position.lendingPosition) continue;

    for (const reserve of position.lendingPosition.userReserves) {
      const name = reserve.token!.name;
      const symbol = reserve.token!.symbol;

      if (name === tokenNameOrSymbol || symbol === tokenNameOrSymbol) {
        // Cast the reserve to UserReserve type since we know it has the required structure
        return reserve as unknown as UserReserve;
      }
    }
  }

  throw new Error(`No reserve found for token ${tokenNameOrSymbol}`);
}

/**
 * Helper to get reserve for a token
 */
export async function getTokenReserve(
  agent: any,
  userAddress: string,
  tokenName: string
): Promise<UserReserve> {
  const response = await agent.processUserInput('show my positions', userAddress);
  const positionsData = extractPositionsData(response);
  return getReserveForToken(positionsData, tokenName);
} 