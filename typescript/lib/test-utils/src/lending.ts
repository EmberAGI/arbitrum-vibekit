/**
 * Lending-specific test utilities
 */

import type { GetWalletLendingPositionsResponse, LendTokenDetail } from 'ember-api';
import type { Task } from '@emberai/arbitrum-vibekit-core/google-a2a-types';

import type { TransactionPlan } from './transactions.js';

/**
 * Extract transaction plan from lending artifacts
 */
export function extractLendingTransactionPlan(response: Task): Array<TransactionPlan> {
  if (!response.artifacts) {
    throw new Error('No artifacts found in response');
  }

  // Look for transaction-plan artifact
  for (const artifact of response.artifacts) {
    if (artifact.name === 'transaction-plan') {
      for (const part of artifact.parts) {
        if (part.kind === 'data' && part.data.txPlan) {
          return part.data.txPlan as Array<TransactionPlan>;
        }
      }
    }
  }

  throw new Error('No transaction plan found in artifacts');
}

/**
 * Extract positions data from response
 */
export function extractPositionsData(response: Task): GetWalletLendingPositionsResponse {
  if (!response.artifacts) {
    throw new Error(
      `No artifacts found in response. Response: ${JSON.stringify(response, null, 2)}`
    );
  }

  // Look for positions artifact (support both legacy and new names)
  for (const artifact of response.artifacts) {
    if (artifact.name === 'positions' || artifact.name === 'wallet-positions') {
      for (const part of artifact.parts) {
        if (part.kind === 'data' && part.data?.positions) {
          return part.data as unknown as GetWalletLendingPositionsResponse;
        }
      }
    }
  }

  // Debug: log available artifact names before throwing an error
  try {
    const names = response.artifacts.map(a => a.name).join(', ');

    console.log(`[extractPositionsData] Available artifact names: ${names}`);
  } catch (_) {
    // ignore logging errors
  }

  throw new Error(
    `No positions data found in artifacts. Response: ${JSON.stringify(response, null, 2)}`
  );
}

/**
 * Finds the reserve information for a given token symbol or name within the positions response.
 */
export function getReserveForToken(
  response: GetWalletLendingPositionsResponse,
  tokenNameOrSymbol: string
): LendTokenDetail {
  for (const position of response.positions) {
    for (const reserve of position.userReserves) {
      const name = reserve.token!.name;
      const symbol = reserve.token!.symbol;

      if (name === tokenNameOrSymbol || symbol === tokenNameOrSymbol) {
        try {
          return reserve;
        } catch (error) {
          console.error('Failed to parse LendTokenDetail:', error);
          console.error('Reserve object that failed parsing:', reserve);
          throw new Error(
            `Failed to parse reserve data for token ${tokenNameOrSymbol}. Reserve: ${JSON.stringify(reserve, null, 2)}`
          );
        }
      }
    }
  }

  throw new Error(
    `No reserve found for token ${tokenNameOrSymbol}. Response: ${JSON.stringify(response, null, 2)}`
  );
}

/**
 * Helper to get reserve for a token
 */
export async function getTokenReserve(
  agent: {
    processUserInput: (input: string, userAddress: string) => Promise<Task>;
  },
  userAddress: string,
  tokenName: string
): Promise<LendTokenDetail> {
  const response = await agent.processUserInput('show my positions', userAddress);
  const positionsData = extractPositionsData(response);
  return getReserveForToken(positionsData, tokenName);
}
