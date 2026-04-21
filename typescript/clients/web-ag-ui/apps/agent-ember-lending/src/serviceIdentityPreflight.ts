import {
  ensureAgentServiceIdentity,
  type AgentServiceIdentity,
} from '../../agent-workflow-core/src/index.js';

import {
  EMBER_LENDING_SHARED_EMBER_AGENT_ID,
  type EmberLendingSharedEmberProtocolHost,
} from './sharedEmberAdapter.js';

type EnsureEmberLendingServiceIdentityInput = {
  protocolHost: EmberLendingSharedEmberProtocolHost;
  readSignerWalletAddress: () => Promise<`0x${string}`>;
  now?: () => Date;
};

type EmberLendingServiceIdentity = AgentServiceIdentity<'subagent'>;

const EMBER_LENDING_SERVICE_ROLE = 'subagent';
const EMBER_LENDING_WALLET_SOURCE = 'ember_local_write';
const EMBER_LENDING_CAPABILITY_METADATA = {
  execution: true,
  onboarding: true,
};
const UNCONFIRMED_SUBAGENT_IDENTITY_ERROR =
  'Lending startup identity preflight failed because Shared Ember did not confirm the expected subagent identity.';

export async function ensureEmberLendingServiceIdentity(
  input: EnsureEmberLendingServiceIdentityInput,
): Promise<{
  revision: number | null;
  wroteIdentity: boolean;
  identity: EmberLendingServiceIdentity;
}> {
  return ensureAgentServiceIdentity({
    protocolHost: input.protocolHost,
    agentId: EMBER_LENDING_SHARED_EMBER_AGENT_ID,
    role: EMBER_LENDING_SERVICE_ROLE,
    walletSource: EMBER_LENDING_WALLET_SOURCE,
    capabilityMetadata: EMBER_LENDING_CAPABILITY_METADATA,
    readWalletAddress: input.readSignerWalletAddress,
    ...(input.now ? { now: input.now } : {}),
    unconfirmedIdentityErrorMessage: UNCONFIRMED_SUBAGENT_IDENTITY_ERROR,
  });
}
