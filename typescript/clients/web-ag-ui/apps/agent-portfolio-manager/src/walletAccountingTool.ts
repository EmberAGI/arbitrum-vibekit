import type { CreateAgentRuntimeOptions } from 'agent-runtime';

import type { PortfolioManagerSharedEmberProtocolHost } from './sharedEmberAdapter.js';
import {
  buildPortfolioManagerWalletAccountingDetails,
  PORTFOLIO_MANAGER_DEFAULT_ACCOUNTING_AGENT_ID,
  PORTFOLIO_MANAGER_SHARED_EMBER_NETWORK,
  readManagedAgentAccountingState,
  type PortfolioManagerWalletAccountingDetails,
} from './sharedEmberOnboardingState.js';
import { formatTokenQuantityForAgentSummary } from './tokenQuantityDisplay.js';

type PortfolioManagerAgentTool = NonNullable<CreateAgentRuntimeOptions['tools']>[number];

const PORTFOLIO_MANAGER_WALLET_ACCOUNTING_TOOL = 'read_wallet_accounting_state';

type WalletAccountingToolArgs = {
  walletAddress: `0x${string}`;
};

function parseWalletAccountingToolArgs(args: unknown): WalletAccountingToolArgs {
  if (typeof args !== 'object' || args === null) {
    throw new Error('Wallet accounting tool requires a walletAddress.');
  }

  const walletAddress =
    'walletAddress' in args && typeof args.walletAddress === 'string'
      ? args.walletAddress.trim()
      : '';

  if (!walletAddress.startsWith('0x') || walletAddress.length < 4) {
    throw new Error('Wallet accounting tool requires a valid walletAddress.');
  }

  return {
    walletAddress: walletAddress as `0x${string}`,
  };
}

function buildWalletAccountingSummary(
  details: PortfolioManagerWalletAccountingDetails,
): string {
  if (details.assets.length === 0 && details.reservations.length === 0) {
    return `Wallet ${details.wallet.address} on ${details.wallet.network} has no durable onboarding/accounting state yet. Phase: ${details.onboarding.phase}. No baseline assets or reservations are recorded.`;
  }

  const assetSummary = details.assets
    .map(
      (asset) =>
        `${formatTokenQuantityForAgentSummary(asset)} (${asset.status}, ${asset.controlPath})`,
    )
    .join(', ');
  const reservationSummary = details.reservations
    .map((reservation) => {
      const allocationSummary = reservation.allocations
        .map((allocation) => formatTokenQuantityForAgentSummary(allocation))
        .join(', ');
      return `${allocationSummary} reserved for ${reservation.agentId} (${reservation.status}, ${reservation.controlPath})`;
    })
    .join('; ');

  return `Wallet ${details.wallet.address} on ${details.wallet.network} is ${details.onboarding.phase} at revision ${details.onboarding.revision}. Baseline assets: ${assetSummary}. Reservations: ${reservationSummary}.`;
}

export function createPortfolioManagerWalletAccountingTool(input: {
  protocolHost: PortfolioManagerSharedEmberProtocolHost;
  agentId: string;
}): PortfolioManagerAgentTool {
  return {
    name: PORTFOLIO_MANAGER_WALLET_ACCOUNTING_TOOL,
    label: 'Read Wallet Accounting State',
    description:
      'Read the durable wallet baseline, reservations, and onboarding proof state for a user wallet from the Shared Ember Domain Service.',
    parameters: {
      type: 'object',
      properties: {
        walletAddress: {
          type: 'string',
          description: 'The user wallet address to inspect in Shared Ember.',
        },
      },
      required: ['walletAddress'],
      additionalProperties: false,
    } as unknown as PortfolioManagerAgentTool['parameters'],
    execute: async (_toolCallId, args) => {
      const toolArgs = parseWalletAccountingToolArgs(args);
      const { revision, onboardingState } = await readManagedAgentAccountingState({
        protocolHost: input.protocolHost,
        agentId: input.agentId || PORTFOLIO_MANAGER_DEFAULT_ACCOUNTING_AGENT_ID,
        walletAddress: toolArgs.walletAddress,
        network: PORTFOLIO_MANAGER_SHARED_EMBER_NETWORK,
      });
      const details: PortfolioManagerWalletAccountingDetails =
        buildPortfolioManagerWalletAccountingDetails({
          revision,
          onboardingState,
        });

      return {
        content: [
          {
            type: 'text' as const,
            text: buildWalletAccountingSummary(details),
          },
        ],
        details,
      };
    },
  };
}
