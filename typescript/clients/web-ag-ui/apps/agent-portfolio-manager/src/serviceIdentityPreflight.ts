import {
  ensureAgentServiceIdentity,
  type AgentServiceIdentity,
} from '../../agent-workflow-core/src/index.js';

import {
  PORTFOLIO_MANAGER_SHARED_EMBER_AGENT_ID,
  type PortfolioManagerSharedEmberProtocolHost,
} from './sharedEmberAdapter.js';

type EnsurePortfolioManagerServiceIdentityInput = {
  protocolHost: PortfolioManagerSharedEmberProtocolHost;
  readControllerWalletAddress: () => Promise<`0x${string}`>;
  now?: () => Date;
};

type PortfolioManagerServiceIdentity = AgentServiceIdentity<'orchestrator'>;

const PORTFOLIO_MANAGER_SERVICE_ROLE = 'orchestrator';
const PORTFOLIO_MANAGER_WALLET_SOURCE = 'ember_local_write';
const PORTFOLIO_MANAGER_CAPABILITY_METADATA = {
  onboarding: true,
  root_registration: true,
};
const UNCONFIRMED_ORCHESTRATOR_IDENTITY_ERROR =
  'Portfolio-manager startup identity preflight failed because Shared Ember did not confirm the expected orchestrator identity.';

export async function ensurePortfolioManagerServiceIdentity(
  input: EnsurePortfolioManagerServiceIdentityInput,
): Promise<{
  revision: number | null;
  wroteIdentity: boolean;
  identity: PortfolioManagerServiceIdentity;
}> {
  return ensureAgentServiceIdentity({
    protocolHost: input.protocolHost,
    agentId: PORTFOLIO_MANAGER_SHARED_EMBER_AGENT_ID,
    role: PORTFOLIO_MANAGER_SERVICE_ROLE,
    walletSource: PORTFOLIO_MANAGER_WALLET_SOURCE,
    capabilityMetadata: PORTFOLIO_MANAGER_CAPABILITY_METADATA,
    readWalletAddress: input.readControllerWalletAddress,
    ...(input.now ? { now: input.now } : {}),
    unconfirmedIdentityErrorMessage: UNCONFIRMED_ORCHESTRATOR_IDENTITY_ERROR,
  });
}
