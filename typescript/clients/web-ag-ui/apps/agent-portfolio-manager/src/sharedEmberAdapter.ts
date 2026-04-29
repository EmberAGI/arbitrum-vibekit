import { createHash } from 'node:crypto';

import { getDeleGatorEnvironment, ROOT_AUTHORITY } from '@metamask/delegation-toolkit';
import { getDelegationHashOffchain } from '@metamask/delegation-toolkit/utils';
import type { AgentRuntimeDomainConfig } from 'agent-runtime';
import type { AgentRuntimeSigningService } from 'agent-runtime/internal';
import { signPreparedDelegation } from 'agent-runtime/internal';
import { keccak256, toHex } from 'viem';
import type {
  HiddenOcaReservationConflictHandling,
  HiddenOcaSpotSwapInput,
  HiddenOcaSpotSwapResult,
} from './hiddenOcaSwapExecutor.js';
import {
  buildPortfolioManagerWalletAccountingDetails,
  buildSharedEmberAccountingContextXml,
  resolvePortfolioManagerAccountingAgentId,
  readManagedAgentAccountingState,
  type OnboardingState as SharedEmberOnboardingState,
} from './sharedEmberOnboardingState.js';
import { buildTokenDisplayQuantity } from './tokenQuantityDisplay.js';

export type PortfolioManagerSharedEmberProtocolHost = {
  handleJsonRpc: (input: unknown) => Promise<unknown>;
  readCommittedEventOutbox: (input: unknown) => Promise<unknown>;
  acknowledgeCommittedEventOutbox: (input: unknown) => Promise<unknown>;
};

export const PORTFOLIO_MANAGER_SHARED_EMBER_AGENT_ID = 'portfolio-manager';
const PORTFOLIO_MANAGER_REDELEGATION_OUTBOX_CONSUMER_ID = 'portfolio-manager-redelegation';

export type PortfolioManagerLifecycleState = {
  phase: 'prehire' | 'onboarding' | 'active';
  lastPortfolioState: unknown;
  lastSharedEmberRevision: number | null;
  lastRootDelegation: unknown;
  lastOnboardingBootstrap: unknown;
  lastRootedWalletContextId: string | null;
  activeWalletAddress: `0x${string}` | null;
  pendingOnboardingWalletAddress: `0x${string}` | null;
  pendingApprovedSetup?: PortfolioManagerApprovedSetup | null;
  pendingSpotSwapConflict?: PortfolioManagerPendingSpotSwapConflict | null;
  portfolioManagerMandate?: PortfolioManagerMandatePayload | null;
};

type PortfolioManagerPendingSpotSwapConflict = {
  dispatch: HiddenOcaSpotSwapInput;
  conflict: NonNullable<HiddenOcaSpotSwapResult['conflict']>;
};

type CreatePortfolioManagerDomainOptions = {
  protocolHost?: PortfolioManagerSharedEmberProtocolHost;
  agentId?: string;
  controllerWalletAddress?: `0x${string}`;
  controllerSignerAddress?: `0x${string}`;
  runtimeSigning?: AgentRuntimeSigningService;
  runtimeSignerRef?: string;
  hiddenOcaSpotSwapExecutor?: {
    executeSpotSwap(input: {
      threadId: string;
      currentRevision?: number | null;
      input: HiddenOcaSpotSwapInput;
    }): Promise<HiddenOcaSpotSwapResult>;
  };
};

type SharedEmberRevisionResponse = {
  result?: {
    revision?: number;
  };
};

type OnboardingMandateSource = {
  mandate_ref: string;
  agent_id: string;
};

type AgentServiceIdentityRole = 'orchestrator' | 'subagent';

type AgentServiceIdentity = {
  identity_ref: string;
  agent_id: string;
  role: AgentServiceIdentityRole;
  wallet_address: `0x${string}`;
  wallet_source: string;
  capability_metadata: Record<string, unknown>;
  registration_version: number;
  registered_at: string;
};

type SharedEmberCommittedEvent = {
  event_id: string;
  sequence: number;
  aggregate: string;
  aggregate_id: string;
  event_type: string;
  payload: Record<string, unknown> | null;
};

type SharedEmberRedelegationWork = {
  eventId: string;
  sequence: number;
  requestId: string;
  transactionPlanId: string;
  phase: 'ready_for_redelegation';
  redelegationSigningPackage: Record<string, unknown>;
};

const OWS_SIGNING_CHAIN = 'evm';
const DEFAULT_RUNTIME_SIGNER_REF = 'controller-wallet';
const PORTFOLIO_MANAGER_CHAIN_ID = 42161;
const PORTFOLIO_MANAGER_NETWORK = 'arbitrum';
const PORTFOLIO_MANAGER_SMART_ACCOUNT_ENVIRONMENT = getDeleGatorEnvironment(
  PORTFOLIO_MANAGER_CHAIN_ID,
);
const PORTFOLIO_MANAGER_DELEGATION_MANAGER =
  PORTFOLIO_MANAGER_SMART_ACCOUNT_ENVIRONMENT.DelegationManager as `0x${string}`;
const METAMASK_DELEGATION_ARTIFACT_PREFIX = 'metamask-delegation:';

function buildDefaultLifecycleState(): PortfolioManagerLifecycleState {
  return {
    phase: 'prehire',
    lastPortfolioState: null,
    lastSharedEmberRevision: null,
    lastRootDelegation: null,
    lastOnboardingBootstrap: null,
    lastRootedWalletContextId: null,
    activeWalletAddress: null,
    pendingOnboardingWalletAddress: null,
    pendingApprovedSetup: null,
    pendingSpotSwapConflict: null,
    portfolioManagerMandate: null,
  };
}

function readOnboardingBootstrapWalletAddress(value: unknown): `0x${string}` | null {
  if (typeof value !== 'object' || value === null || !('rootedWalletContext' in value)) {
    return null;
  }

  const rootedWalletContext = value.rootedWalletContext;
  if (
    typeof rootedWalletContext !== 'object' ||
    rootedWalletContext === null ||
    !('wallet_address' in rootedWalletContext) ||
    typeof rootedWalletContext.wallet_address !== 'string'
  ) {
    return null;
  }

  return rootedWalletContext.wallet_address.startsWith('0x')
    ? (rootedWalletContext.wallet_address as `0x${string}`)
    : null;
}

function readOnboardingBootstrapRootedWalletContextId(value: unknown): string | null {
  if (typeof value !== 'object' || value === null || !('rootedWalletContext' in value)) {
    return null;
  }

  const rootedWalletContext = value.rootedWalletContext;
  if (
    typeof rootedWalletContext !== 'object' ||
    rootedWalletContext === null ||
    !('rooted_wallet_context_id' in rootedWalletContext)
  ) {
    return null;
  }

  return readString(rootedWalletContext.rooted_wallet_context_id);
}

function readPortfolioManagerContextWalletAddress(
  state: PortfolioManagerLifecycleState,
): `0x${string}` | null {
  return (
    state.activeWalletAddress ?? readOnboardingBootstrapWalletAddress(state.lastOnboardingBootstrap)
  );
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function readHexAddress(value: unknown): `0x${string}` | null {
  const normalized = readString(value);
  return normalized?.startsWith('0x') ? (normalized as `0x${string}`) : null;
}

function readHexValue(value: unknown): `0x${string}` | null {
  const normalized = readString(value);
  return normalized?.startsWith('0x') ? (normalized as `0x${string}`) : null;
}

function readDelegationCaveats(value: unknown): PortfolioManagerSignedDelegation['caveats'] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const parsed = value
    .map((entry) => {
      if (!isRecord(entry)) {
        return null;
      }

      const enforcer = readHexAddress(entry['enforcer']);
      const terms = readHexValue(entry['terms']);
      const args = readHexValue(entry['args']);

      if (enforcer === null || terms === null || args === null) {
        return null;
      }

      return {
        enforcer,
        terms,
        args,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  return parsed.length === value.length ? parsed : null;
}

function encodeDelegationArtifactRef(delegation: PortfolioManagerSignedDelegation): string {
  return `${METAMASK_DELEGATION_ARTIFACT_PREFIX}${Buffer.from(
    JSON.stringify(delegation),
    'utf8',
  ).toString('base64url')}`;
}

function decodeDelegationArtifactRef(artifactRef: string): PortfolioManagerSignedDelegation {
  if (!artifactRef.startsWith(METAMASK_DELEGATION_ARTIFACT_PREFIX)) {
    throw new Error(`Unsupported delegation artifact ref "${artifactRef}".`);
  }

  const decoded = JSON.parse(
    Buffer.from(
      artifactRef.slice(METAMASK_DELEGATION_ARTIFACT_PREFIX.length),
      'base64url',
    ).toString('utf8'),
  ) as unknown;
  if (!isRecord(decoded)) {
    throw new Error('Delegation artifact must decode to an object.');
  }

  const delegate = readHexAddress(decoded['delegate']);
  const delegator = readHexAddress(decoded['delegator']);
  const authority = readHexValue(decoded['authority']);
  const caveats = readDelegationCaveats(decoded['caveats']);
  const salt = readHexValue(decoded['salt']);
  const signature = readHexValue(decoded['signature']);

  if (
    delegate === null ||
    delegator === null ||
    authority === null ||
    caveats === null ||
    salt === null ||
    signature === null
  ) {
    throw new Error('Delegation artifact payload is missing required signed delegation fields.');
  }

  return {
    delegate,
    delegator,
    authority,
    caveats,
    salt,
    signature,
  };
}

function readInt(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
}

function readAgentServiceIdentity(
  value: unknown,
  expectedAgentId: string,
  expectedRole: AgentServiceIdentityRole,
): AgentServiceIdentity | null {
  if (!isRecord(value)) {
    return null;
  }

  const identityRef = readString(value['identity_ref']);
  const agentId = readString(value['agent_id']);
  const walletAddress = readHexAddress(value['wallet_address']);
  const walletSource = readString(value['wallet_source']);
  const registrationVersion = readInt(value['registration_version']);
  const registeredAt = readString(value['registered_at']);
  const capabilityMetadata = isRecord(value['capability_metadata'])
    ? value['capability_metadata']
    : null;

  if (
    identityRef === null ||
    agentId === null ||
    agentId !== expectedAgentId ||
    readString(value['role']) !== expectedRole ||
    walletAddress === null ||
    walletSource === null ||
    registrationVersion === null ||
    registeredAt === null ||
    capabilityMetadata === null
  ) {
    return null;
  }

  return {
    identity_ref: identityRef,
    agent_id: agentId,
    role: expectedRole,
    wallet_address: walletAddress,
    wallet_source: walletSource,
    capability_metadata: capabilityMetadata,
    registration_version: registrationVersion,
    registered_at: registeredAt,
  };
}

function readCommittedEvent(value: unknown): SharedEmberCommittedEvent | null {
  if (!isRecord(value)) {
    return null;
  }

  const eventId = readString(value['event_id']);
  const sequence = readInt(value['sequence']);
  const aggregate = readString(value['aggregate']);
  const aggregateId = readString(value['aggregate_id']);
  const eventType = readString(value['event_type']);
  const payload = isRecord(value['payload']) ? value['payload'] : null;

  if (
    eventId === null ||
    sequence === null ||
    aggregate === null ||
    aggregateId === null ||
    eventType === null
  ) {
    return null;
  }

  return {
    event_id: eventId,
    sequence,
    aggregate,
    aggregate_id: aggregateId,
    event_type: eventType,
    payload,
  };
}

function readNextReadyForRedelegationWork(
  events: unknown[],
  acknowledgedThroughSequence: number,
  expected?: {
    requestId?: string;
    transactionPlanId?: string;
  },
): SharedEmberRedelegationWork | null {
  let latestWork: SharedEmberRedelegationWork | null = null;

  for (const rawEvent of events) {
    const event = readCommittedEvent(rawEvent);
    if (
      event === null ||
      event.sequence <= acknowledgedThroughSequence ||
      event.aggregate !== 'request' ||
      event.event_type !== 'requestExecution.prepared.v1'
    ) {
      continue;
    }

    const requestId = readString(event.payload?.['request_id']);
    const transactionPlanId = readString(event.payload?.['transaction_plan_id']);
    const phase = readString(event.payload?.['phase']);
    const redelegationSigningPackage = isRecord(event.payload?.['redelegation_signing_package'])
      ? event.payload['redelegation_signing_package']
      : null;

    if (
      requestId === null ||
      transactionPlanId === null ||
      phase !== 'ready_for_redelegation' ||
      redelegationSigningPackage === null ||
      (expected?.requestId !== undefined && requestId !== expected.requestId) ||
      (expected?.transactionPlanId !== undefined && transactionPlanId !== expected.transactionPlanId)
    ) {
      continue;
    }

    latestWork = {
      eventId: event.event_id,
      sequence: event.sequence,
      requestId,
      transactionPlanId,
      phase: 'ready_for_redelegation',
      redelegationSigningPackage,
    };
  }

  return latestWork;
}

function isSharedEmberRevisionConflict(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message.includes('Shared Ember Domain Service JSON-RPC error: protocol_conflict') &&
    error.message.includes('expected_revision')
  );
}

function resolveRuntimeRedelegationChainId(network: string): number {
  switch (network.trim().toLowerCase()) {
    case 'arbitrum':
      return 42161;
    case 'ethereum':
    case 'mainnet':
      return 1;
    default:
      throw new Error(`Unsupported redelegation network "${network}".`);
  }
}

function buildRuntimeRedelegationAuthority(rootDelegationArtifactRef: string): `0x${string}` {
  return getDelegationHashOffchain(
    decodeDelegationArtifactRef(rootDelegationArtifactRef),
  ) as `0x${string}`;
}

function buildRuntimeRedelegationSalt(requestId: string): `0x${string}` {
  return keccak256(toHex(requestId));
}

function buildRuntimeRedelegationUnsignedDelegation(input: {
  redelegationSigningPackage: Record<string, unknown>;
  delegatorAddress: `0x${string}`;
}): PortfolioManagerUnsignedDelegation {
  const requestId = readString(input.redelegationSigningPackage['request_id']);
  const rootDelegationArtifactRef = readString(
    input.redelegationSigningPackage['root_delegation_artifact_ref'],
  );
  const agentWallet = readHexAddress(input.redelegationSigningPackage['agent_wallet']);

  if (!requestId || !rootDelegationArtifactRef || !agentWallet) {
    throw new Error('missing redelegation package metadata');
  }

  return {
    delegate: agentWallet,
    delegator: input.delegatorAddress,
    authority: buildRuntimeRedelegationAuthority(rootDelegationArtifactRef),
    caveats: [],
    salt: buildRuntimeRedelegationSalt(requestId),
  };
}

function buildRuntimeSignedRedelegationRecord(input: {
  redelegationSigningPackage: Record<string, unknown>;
  artifactRef: string;
}): Record<string, unknown> {
  const requestId = readString(input.redelegationSigningPackage['request_id']);
  const rootDelegationArtifactRef = readString(
    input.redelegationSigningPackage['root_delegation_artifact_ref'],
  );
  const agentWallet = readHexAddress(input.redelegationSigningPackage['agent_wallet']);
  const policySnapshotRef = readString(input.redelegationSigningPackage['policy_snapshot_ref']);

  if (!requestId || !rootDelegationArtifactRef || !agentWallet || !policySnapshotRef) {
    throw new Error('missing signed redelegation metadata');
  }
  const issuedAt = new Date().toISOString();

  return {
    ...input.redelegationSigningPackage,
    artifact_ref: input.artifactRef,
    issued_at: issuedAt,
    activated_at: issuedAt,
    policy_hash: `policy-${policySnapshotRef}`,
  };
}

function readOutboxErrorMessage(value: unknown): string | null {
  if (!isRecord(value) || !isRecord(value['error'])) {
    return null;
  }

  return readString(value['error']['message']);
}

async function readCurrentSharedEmberRevision(input: {
  protocolHost: PortfolioManagerSharedEmberProtocolHost;
  threadId: string;
  agentId: string;
}): Promise<number> {
  const response = (await input.protocolHost.handleJsonRpc({
    jsonrpc: '2.0',
    id: `shared-ember-${input.threadId}-read-current-revision`,
    method: 'subagent.readPortfolioState.v1',
    params: {
      agent_id: input.agentId,
    },
  })) as SharedEmberRevisionResponse;

  return response.result?.revision ?? 0;
}

async function runSharedEmberCommandWithResolvedRevision<T>(input: {
  protocolHost: PortfolioManagerSharedEmberProtocolHost;
  threadId: string;
  agentId: string;
  currentRevision: number | null;
  buildRequest: (expectedRevision: number) => unknown;
}): Promise<T> {
  let expectedRevision = input.currentRevision ?? (await readCurrentSharedEmberRevision(input));

  try {
    return (await input.protocolHost.handleJsonRpc(input.buildRequest(expectedRevision))) as T;
  } catch (error) {
    if (!isSharedEmberRevisionConflict(error)) {
      throw error;
    }

    const refreshedRevision = await readCurrentSharedEmberRevision(input);
    if (refreshedRevision === expectedRevision) {
      throw error;
    }

    expectedRevision = refreshedRevision;
    return (await input.protocolHost.handleJsonRpc(input.buildRequest(expectedRevision))) as T;
  }
}

export async function refreshPortfolioManagerRedelegationWork(input: {
  protocolHost: PortfolioManagerSharedEmberProtocolHost;
  threadId: string;
  agentId?: string;
  currentRevision?: number | null;
  runtimeSigning?: AgentRuntimeSigningService;
  runtimeSignerRef?: string;
  controllerWalletAddress?: `0x${string}`;
  controllerSignerAddress?: `0x${string}`;
  expectedRequestId?: string;
  expectedTransactionPlanId?: string;
}): Promise<{
  status: 'completed' | 'empty' | 'failed';
  revision: number | null;
  statusMessage: string;
  artifact?: Record<string, unknown>;
}> {
  const outboxPage = await input.protocolHost.readCommittedEventOutbox({
    protocol_version: 'v1',
    consumer_id: PORTFOLIO_MANAGER_REDELEGATION_OUTBOX_CONSUMER_ID,
    after_sequence: 0,
    limit: 100,
  });
  const outboxRecord = isRecord(outboxPage) ? outboxPage : {};
  const revision = readInt(outboxRecord['revision']) ?? input.currentRevision ?? null;
  const redelegationWork = readNextReadyForRedelegationWork(
    Array.isArray(outboxRecord['events']) ? outboxRecord['events'] : [],
    readInt(outboxRecord['acknowledged_through_sequence']) ?? 0,
    {
      ...(input.expectedRequestId ? { requestId: input.expectedRequestId } : {}),
      ...(input.expectedTransactionPlanId
        ? { transactionPlanId: input.expectedTransactionPlanId }
        : {}),
    },
  );

  if (redelegationWork === null) {
    return {
      status: 'empty',
      revision,
      statusMessage: 'No redelegation work is currently pending in the Shared Ember outbox.',
    };
  }

  if (!input.runtimeSigning) {
    return {
      status: 'failed',
      revision,
      statusMessage:
        'Runtime-owned signing service is not configured for portfolio-manager redelegation signing.',
    };
  }

  if (!input.controllerWalletAddress) {
    return {
      status: 'failed',
      revision,
      statusMessage:
        'Portfolio-manager redelegation signing is blocked because the controller smart-account address is not configured.',
    };
  }

  if (!input.controllerSignerAddress) {
    return {
      status: 'failed',
      revision,
      statusMessage:
        'Portfolio-manager redelegation signing is blocked because the controller signer address is not configured.',
    };
  }

  let unsignedRedelegation: PortfolioManagerUnsignedDelegation;
  try {
    unsignedRedelegation = buildRuntimeRedelegationUnsignedDelegation({
      redelegationSigningPackage: redelegationWork.redelegationSigningPackage,
      delegatorAddress: input.controllerWalletAddress,
    });
  } catch {
    return {
      status: 'failed',
      revision,
      statusMessage:
        'Portfolio-manager redelegation signing could not continue because the canonical signing package was incomplete.',
    };
  }

  const redelegationNetwork = readString(redelegationWork.redelegationSigningPackage['network']);
  if (!redelegationNetwork) {
    return {
      status: 'failed',
      revision,
      statusMessage:
        'Portfolio-manager redelegation signing could not continue because the canonical signing package was incomplete.',
    };
  }

  const signedRedelegation = await signPreparedDelegation({
    signing: input.runtimeSigning,
    signerRef: input.runtimeSignerRef ?? DEFAULT_RUNTIME_SIGNER_REF,
    expectedAddress: input.controllerSignerAddress,
    chain: OWS_SIGNING_CHAIN,
    chainId: resolveRuntimeRedelegationChainId(redelegationNetwork),
    delegationManager: PORTFOLIO_MANAGER_DELEGATION_MANAGER,
    delegation: unsignedRedelegation,
  });

  let signedRedelegationRecord: Record<string, unknown>;
  try {
    signedRedelegationRecord = buildRuntimeSignedRedelegationRecord({
      redelegationSigningPackage: redelegationWork.redelegationSigningPackage,
      artifactRef: signedRedelegation.artifactRef,
    });
  } catch {
    return {
      status: 'failed',
      revision,
      statusMessage:
        'Portfolio-manager redelegation signing could not continue because the canonical signing package was incomplete.',
    };
  }

  const registrationResponse = await runSharedEmberCommandWithResolvedRevision<{
    result?: {
      revision?: number;
      committed_event_ids?: string[];
      execution_result?: unknown;
    };
  }>({
    protocolHost: input.protocolHost,
    threadId: input.threadId,
    agentId: input.agentId ?? PORTFOLIO_MANAGER_SHARED_EMBER_AGENT_ID,
    currentRevision: revision,
    buildRequest: (expectedRevision) => ({
      jsonrpc: '2.0',
      id: `shared-ember-${input.threadId}-register-signed-redelegation`,
      method: 'orchestrator.registerSignedRedelegation.v1',
      params: {
        idempotency_key: `idem-refresh-redelegation-work-${input.threadId}:register-redelegation:${redelegationWork.requestId}`,
        expected_revision: expectedRevision,
        transaction_plan_id: redelegationWork.transactionPlanId,
        signed_redelegation: signedRedelegationRecord,
      },
    }),
  });

  const acknowledgeResponse = await input.protocolHost.acknowledgeCommittedEventOutbox({
    protocol_version: 'v1',
    consumer_id: PORTFOLIO_MANAGER_REDELEGATION_OUTBOX_CONSUMER_ID,
    delivered_through_sequence: redelegationWork.sequence,
  });
  const acknowledgeErrorMessage = readOutboxErrorMessage(acknowledgeResponse);
  if (acknowledgeErrorMessage !== null) {
    throw new Error(
      `Shared Ember committed outbox acknowledgement failed: ${acknowledgeErrorMessage}`,
    );
  }

  const registeredRevision = readInt(registrationResponse.result?.revision) ?? revision;
  const acknowledgedRevision =
    readInt(isRecord(acknowledgeResponse) ? acknowledgeResponse['revision'] : null) ??
    registeredRevision;
  const acknowledgedThroughSequence =
    readInt(
      isRecord(acknowledgeResponse) ? acknowledgeResponse['acknowledged_through_sequence'] : null,
    ) ?? redelegationWork.sequence;

  return {
    status: 'completed',
    revision: acknowledgedRevision,
    statusMessage: 'Redelegation signed, registered, and acknowledged through Shared Ember.',
    artifact: {
      type: 'shared-ember-redelegation-registration',
      revision: acknowledgedRevision,
      consumerId: PORTFOLIO_MANAGER_REDELEGATION_OUTBOX_CONSUMER_ID,
      eventId: redelegationWork.eventId,
      sequence: redelegationWork.sequence,
      requestId: redelegationWork.requestId,
      transactionPlanId: redelegationWork.transactionPlanId,
      committedEventIds: registrationResponse.result?.committed_event_ids ?? [],
      acknowledgedThroughSequence,
    },
  };
}

async function readSharedEmberAgentServiceIdentity(input: {
  protocolHost: PortfolioManagerSharedEmberProtocolHost;
  agentId: string;
  role: AgentServiceIdentityRole;
}): Promise<{
  revision: number;
  identity: AgentServiceIdentity | null;
}> {
  const response = await input.protocolHost.handleJsonRpc({
    jsonrpc: '2.0',
    id: 'rpc-agent-service-identity-read',
    method: 'orchestrator.readAgentServiceIdentity.v1',
    params: {
      agent_id: input.agentId,
      role: input.role,
    },
  });
  const result = isRecord(response) && isRecord(response['result']) ? response['result'] : null;

  return {
    revision: readInt(result?.['revision']) ?? 0,
    identity: readAgentServiceIdentity(
      result?.['agent_service_identity'] ?? null,
      input.agentId,
      input.role,
    ),
  };
}

async function readSharedEmberSubagentWalletAddress(input: {
  protocolHost: PortfolioManagerSharedEmberProtocolHost;
  agentId: string;
}): Promise<{
  revision: number | null;
  walletAddress: `0x${string}` | null;
}> {
  const response = await input.protocolHost.handleJsonRpc({
    jsonrpc: '2.0',
    id: 'shared-ember-read-managed-subagent-execution-context',
    method: 'subagent.readExecutionContext.v1',
    params: {
      agent_id: input.agentId,
    },
  });
  const result = isRecord(response) && isRecord(response['result']) ? response['result'] : null;
  const executionContext = isRecord(result?.['execution_context'])
    ? result['execution_context']
    : null;

  return {
    revision: readInt(result?.['revision']),
    walletAddress: readHexAddress(executionContext?.['subagent_wallet_address']),
  };
}

async function readSharedEmberPortfolioState(input: {
  protocolHost: PortfolioManagerSharedEmberProtocolHost;
  threadId: string;
  agentId: string;
}): Promise<{
  revision: number | null;
  portfolioState: Record<string, unknown> | null;
}> {
  const requestId =
    input.agentId === PORTFOLIO_MANAGER_SHARED_EMBER_AGENT_ID
      ? `shared-ember-${input.threadId}-read-portfolio-state`
      : `shared-ember-${input.threadId}-read-managed-agent-portfolio-state`;
  const response = await input.protocolHost.handleJsonRpc({
    jsonrpc: '2.0',
    id: requestId,
    method: 'subagent.readPortfolioState.v1',
    params: {
      agent_id: input.agentId,
    },
  });
  const result = isRecord(response) && isRecord(response['result']) ? response['result'] : null;

  return {
    revision: readInt(result?.['revision']),
    portfolioState: isRecord(result?.['portfolio_state']) ? result['portfolio_state'] : null,
  };
}

const PORTFOLIO_MANAGER_SETUP_INTERRUPT_TYPE = 'portfolio-manager-setup-request';
const PORTFOLIO_MANAGER_SETUP_MESSAGE =
  'Connect the wallet you want the portfolio manager to onboard.';
const PORTFOLIO_MANAGER_SIGNING_INTERRUPT_TYPE = 'portfolio-manager-delegation-signing-request';
const PORTFOLIO_MANAGER_SIGNING_MESSAGE =
  'Review and sign the delegation needed to activate your portfolio manager.';
const PORTFOLIO_MANAGER_SPOT_SWAP_COMMAND = 'dispatch_spot_swap';
const PORTFOLIO_MANAGER_CONFIRM_SPOT_SWAP_COMMAND = 'confirm_spot_swap_reserved_capital';
const PORTFOLIO_MANAGER_SPOT_SWAP_COMMAND_DESCRIPTION = [
  'Dispatch a structured spot swap through the portfolio-manager owned hidden Onchain Actions executor.',
  'When using this command, put a JSON object string in inputJson with required fields walletAddress, amount, amountType, fromChain, toChain, fromToken, and toToken.',
  'Optional fields are slippageTolerance, expiration, idempotencyKey, rootedWalletContextId, and capitalPool.',
  'amount should be a base-unit integer string; decimal token-unit strings are accepted only when token decimals are known.',
  'amountType must be "exactIn" or "exactOut"; for requests like "half my WETH" or "$3 of WETH", infer the token amount from current portfolio state when possible before dispatching.',
  'Before calculating a spot swap amount, exclude deployed protocol positions such as lending collateral, aTokens, debt units, LP positions, and other non-wallet positions unless the user explicitly asks to unwind, withdraw, repay, close, or swap deployed position capital.',
  'For spot swaps, all remaining, available, wallet, free, unassigned, reserved, assigned, and hybrid refer only to idle wallet units unless the user explicitly names deployed protocol capital.',
  'capitalPool may be "unassigned_only", "reserved_or_assigned", or "all"; use reserved_or_assigned when the user explicitly asks to use reserved or assigned idle wallet units, and use all when the selected idle wallet asset pool should include both free and reserved idle wallet units.',
  'Never suggest releasing or adjusting a reservation for spot swaps; dispatch with capitalPool instead and let the reserved-capital confirmation interrupt ask the user to proceed or retry with unassigned capital only.',
  `If ${PORTFOLIO_MANAGER_SPOT_SWAP_COMMAND} returns a reserved-capital confirmation, stop the current assistant turn and wait for the user's next reply before calling ${PORTFOLIO_MANAGER_CONFIRM_SPOT_SWAP_COMMAND}.`,
  'Do not set reservationConflictHandling in inputJson; it is supplied only by the portfolio-manager conflict confirmation retry.',
  'Example inputJson: {"walletAddress":"0x...","amount":"894102247158860","amountType":"exactIn","fromChain":"arbitrum","toChain":"arbitrum","fromToken":"WETH","toToken":"USDC","capitalPool":"reserved_or_assigned"}.',
].join(' ');
const PORTFOLIO_MANAGER_CONFIRM_SPOT_SWAP_COMMAND_DESCRIPTION = [
  'Resolve the exact pending reserved-capital spot swap confirmation through the tool-callable command path.',
  'Use this command when pending_spot_swap_conflict is present and the user replies yes, confirm, proceed, use reserved funds, use unassigned only, or cancel.',
  'Required inputJson field: outcome.',
  'For yes, confirm, proceed, or use reserved funds, set outcome to "allow_reserved_for_other_agent".',
  'For unassigned/free capital only, set outcome to "unassigned_only".',
  'For cancel/stop, set outcome to "cancel".',
  'Do not call dispatch_spot_swap again for the same pending reserved-capital confirmation.',
  'If the confirmation fails, report the exact failure and wait for another user instruction; do not retry with unassigned_only unless the user explicitly asks for unassigned-only execution.',
  'Example inputJson: {"outcome":"allow_reserved_for_other_agent"}.',
].join(' ');
const PORTFOLIO_MANAGER_SWAP_CONFLICT_INTERRUPT_TYPE =
  'portfolio-manager-swap-reservation-conflict-request';
const PORTFOLIO_MANAGER_SWAP_CONFLICT_MESSAGE =
  'This swap would touch capital reserved for another agent. Confirm whether to proceed or retry with unassigned capital only.';
const PORTFOLIO_MANAGER_SWAP_CONFLICT_INTERRUPT_DESCRIPTION = [
  'Ask whether a spot swap may touch capital reserved for another agent or should retry with unassigned capital only.',
  `In normal chat, use the ${PORTFOLIO_MANAGER_CONFIRM_SPOT_SWAP_COMMAND} command because lifecycle interrupts are not model tool-callable.`,
  'When a client forwards an interrupt resume directly and the user says yes, confirm, proceed, or equivalent, resume with inputJson {"outcome":"allow_reserved_for_other_agent"}.',
  'When the user asks for unassigned/free capital only, resume with inputJson {"outcome":"unassigned_only"}.',
  'When the user cancels, resume with inputJson {"outcome":"cancel"}.',
  'Do not repeat dispatch_spot_swap for a pending reserved-capital confirmation.',
].join(' ');
const PORTFOLIO_MANAGER_ROOT_AUTHORITY = ROOT_AUTHORITY;
const PORTFOLIO_MANAGER_DELEGATION_SALT =
  '0x1111111111111111111111111111111111111111111111111111111111111111';
const PORTFOLIO_MANAGER_BOOTSTRAP_TIMESTAMP = '2026-03-30T00:00:00.000Z';
const PORTFOLIO_MANAGER_PROTOCOL_SOURCE = 'onboarding_scan';
const PORTFOLIO_MANAGER_DEFAULT_RISK_LEVEL = 'medium';
const FIRST_MANAGED_AGENT_TYPE = 'ember-lending';
const FIRST_MANAGED_AGENT_BENCHMARK_ASSET = 'USD';
const FIRST_MANAGED_AGENT_KEY = 'ember-lending-primary';
const PORTFOLIO_MANAGER_ROUTE_AGENT_ID = 'agent-portfolio-manager';
const FIRST_MANAGED_AGENT_ROUTE_ID = 'agent-ember-lending';
const PORTFOLIO_MANAGER_MANDATE_ROUTE_ID = 'agent-portfolio-manager';
const PORTFOLIO_MANAGER_MANDATE_KEY = 'portfolio-manager-primary';
const PORTFOLIO_MANAGER_MANDATE_TITLE = 'Portfolio Manager Mandate';
const FIRST_MANAGED_AGENT_TITLE = 'Ember Lending';
const PORTFOLIO_MANAGER_MANDATE_REF = 'mandate-portfolio-manager';
const PM_SIGNING_TRACE_ENABLED = process.env['DEBUG_PM_SIGNING'] === '1';

function tracePmSigning(step: string, details?: Record<string, unknown>) {
  if (!PM_SIGNING_TRACE_ENABLED) {
    return;
  }

  const suffix = details ? ` ${JSON.stringify(details)}` : '';
  console.log(`[pm-signing] ${new Date().toISOString()} ${step}${suffix}`);
}

type PortfolioManagerPortfolioMandate = {
  approved: true;
  riskLevel: typeof PORTFOLIO_MANAGER_DEFAULT_RISK_LEVEL;
};

type PortfolioManagerMandatePayload = Record<string, unknown>;

type ManagedMandate = Record<string, unknown> & {
  lending_policy: Record<string, unknown> & {
    collateral_policy: Record<string, unknown> & {
      assets: Array<
        Record<string, unknown> & {
          asset: string;
          max_allocation_pct: number;
        }
      >;
    };
    borrow_policy: Record<string, unknown> & {
      allowed_assets: string[];
    };
    risk_policy: Record<string, unknown> & {
      max_ltv_bps: number;
      min_health_factor: string;
    };
  };
};

type ManagedMandateEditorProjection = {
  ownerAgentId: typeof PORTFOLIO_MANAGER_ROUTE_AGENT_ID;
  targetAgentId: typeof FIRST_MANAGED_AGENT_TYPE;
  targetAgentRouteId: typeof FIRST_MANAGED_AGENT_ROUTE_ID;
  targetAgentKey: string;
  targetAgentTitle: typeof FIRST_MANAGED_AGENT_TITLE;
  mandateRef: string;
  managedMandate: ManagedMandate;
  agentWallet: `0x${string}` | null;
  rootUserWallet: `0x${string}` | null;
  rootedWalletContextId: string | null;
  reservation: {
    reservationId: string;
    purpose: string | null;
    controlPath: string | null;
    rootAsset: string | null;
    quantity: string | null;
  } | null;
};

type PortfolioManagerMandateEditorProjection = {
  ownerAgentId: typeof PORTFOLIO_MANAGER_ROUTE_AGENT_ID;
  targetAgentId: typeof PORTFOLIO_MANAGER_ROUTE_AGENT_ID;
  targetAgentRouteId: typeof PORTFOLIO_MANAGER_MANDATE_ROUTE_ID;
  targetAgentKey: typeof PORTFOLIO_MANAGER_MANDATE_KEY;
  targetAgentTitle: typeof PORTFOLIO_MANAGER_MANDATE_TITLE;
  mandateRef: typeof PORTFOLIO_MANAGER_MANDATE_REF;
  managedMandate: PortfolioManagerMandatePayload;
  agentWallet: `0x${string}` | null;
  rootUserWallet: `0x${string}` | null;
  rootedWalletContextId: string | null;
  reservation: null;
};

type PortfolioProjectionEconomicExposureInput = {
  asset: string;
  quantity: string;
};

type PortfolioProjectionWalletContentInput = {
  asset: string;
  network: string;
  quantity: string;
  displayQuantity?: string;
  valueUsd: number;
  economicExposures?: PortfolioProjectionEconomicExposureInput[];
};

type PortfolioProjectionOwnedUnitInput = {
  unitId: string;
  rootAsset: string;
  network: string;
  quantity: string;
  benchmarkAsset: string;
  benchmarkValue: number;
  reservationId: string | null;
  positionScopeId: string | null;
};

type PortfolioProjectionReservationAllocationInput = {
  unitId: string;
  quantity: string;
};

type PortfolioProjectionReservationInput = {
  reservationId: string;
  agentId: string;
  purpose: string;
  controlPath: string;
  createdAt: string;
  status: 'active' | 'consumed' | 'released' | 'superseded';
  unitAllocations: PortfolioProjectionReservationAllocationInput[];
};

type PortfolioProjectionActivePositionScopeMemberInput = {
  memberId: string;
  role: 'collateral' | 'debt';
  asset: string;
  quantity: string;
  displayQuantity?: string;
  valueUsd: number;
  economicExposures: PortfolioProjectionEconomicExposureInput[];
  state: {
    withdrawableQuantity: string | null;
    supplyApr: string | null;
    borrowApr: string | null;
  };
};

type PortfolioProjectionActivePositionScopeInput = {
  scopeId: string;
  kind: string;
  ownerType?: 'user_idle' | 'agent';
  ownerId?: string;
  network: string;
  protocolSystem: string;
  containerRef: string;
  status: 'active' | 'closed';
  marketState?: {
    availableBorrowsUsd?: string;
    borrowableHeadroomUsd: string;
    currentLtvBps?: number;
    liquidationThresholdBps?: number;
    healthFactor?: string;
  };
  members: PortfolioProjectionActivePositionScopeMemberInput[];
};

type PortfolioProjectionInput = {
  benchmarkAsset: string;
  walletContents: PortfolioProjectionWalletContentInput[];
  reservations: PortfolioProjectionReservationInput[];
  ownedUnits: PortfolioProjectionOwnedUnitInput[];
  activePositionScopes: PortfolioProjectionActivePositionScopeInput[];
};

type ManagedAgentAccountingStateRead = {
  agentId: string;
  revision: number;
  onboardingState: NonNullable<SharedEmberOnboardingState>;
};

type ManagedAgentPortfolioStateRead = Awaited<ReturnType<typeof readSharedEmberPortfolioState>> & {
  agentId: string;
};

type ManagedPortfolioStateSnapshot = {
  managedAgentIds: string[];
  managedPortfolioStateReads: ManagedAgentPortfolioStateRead[];
  managedMandateProjection: ManagedMandateEditorProjection | null;
  managedWalletAddress: `0x${string}` | null;
  accountingStateReads: ManagedAgentAccountingStateRead[];
  portfolioProjectionInput: PortfolioProjectionInput | null;
  revision: number | null;
};

type PortfolioManagerFirstManagedMandate = {
  targetAgentId: typeof FIRST_MANAGED_AGENT_TYPE;
  targetAgentKey: string;
  managedMandate: ManagedMandate;
};

type PortfolioManagerApprovedSetup = {
  portfolioMandate: PortfolioManagerPortfolioMandate;
  firstManagedMandate: PortfolioManagerFirstManagedMandate;
  portfolioManagerMandate?: PortfolioManagerMandatePayload | null;
};

type PortfolioManagerSetupInput = PortfolioManagerApprovedSetup & {
  walletAddress: `0x${string}`;
};

type ManagedMandateUpdateInput = {
  targetAgentId: typeof FIRST_MANAGED_AGENT_TYPE | typeof PORTFOLIO_MANAGER_ROUTE_AGENT_ID;
  managedMandate: PortfolioManagerMandatePayload | ManagedMandate;
};

type PortfolioManagerUnsignedDelegation = {
  delegate: `0x${string}`;
  delegator: `0x${string}`;
  authority: `0x${string}`;
  caveats: Array<{
    enforcer: `0x${string}`;
    terms: `0x${string}`;
    args: `0x${string}`;
  }>;
  salt: `0x${string}`;
};

type PortfolioManagerSignedDelegation = PortfolioManagerUnsignedDelegation & {
  signature: `0x${string}`;
};

function sanitizeIdentitySegment(value: string): string {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]/g, '');
  return normalized.length > 0 ? normalized : 'portfolio-manager';
}

function stableStringifyForIdempotency(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringifyForIdempotency(entry)).join(',')}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
    left.localeCompare(right),
  );

  return `{${entries
    .map(
      ([key, entryValue]) => `${JSON.stringify(key)}:${stableStringifyForIdempotency(entryValue)}`,
    )
    .join(',')}}`;
}

function buildPayloadDerivedIdempotencyKey(params: { prefix: string; payload: unknown }): string {
  const digest = createHash('sha256')
    .update(stableStringifyForIdempotency(params.payload))
    .digest('hex')
    .slice(0, 24);

  return `${params.prefix}-${digest}`;
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every((entry) => typeof entry === 'string' && entry.trim().length > 0)
  );
}

function readFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readFirstRecordFromArray(value: unknown): Record<string, unknown> | null {
  if (!Array.isArray(value)) {
    return null;
  }

  for (const entry of value) {
    if (isRecord(entry)) {
      return entry;
    }
  }

  return null;
}

function readManagedCollateralPolicies(
  value: unknown,
): ManagedMandate['lending_policy']['collateral_policy']['assets'] | null {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }

  const policies: ManagedMandate['lending_policy']['collateral_policy']['assets'] = [];
  const seen = new Set<string>();

  for (const entry of value) {
    if (!isRecord(entry)) {
      return null;
    }

    const asset = readString(entry['asset']);
    const maxAllocationPct = readFiniteNumber(entry['max_allocation_pct']);
    if (asset === null || maxAllocationPct === null || seen.has(asset)) {
      return null;
    }

    seen.add(asset);
    policies.push({
      ...entry,
      asset,
      max_allocation_pct: maxAllocationPct,
    });
  }

  return policies;
}

function readManagedMandate(input: unknown): ManagedMandate | null {
  if (!isRecord(input)) {
    return null;
  }

  const lendingPolicy = isRecord(input['lending_policy']) ? input['lending_policy'] : null;
  const collateralPolicy = isRecord(lendingPolicy?.['collateral_policy'])
    ? lendingPolicy['collateral_policy']
    : null;
  const borrowPolicy = isRecord(lendingPolicy?.['borrow_policy'])
    ? lendingPolicy['borrow_policy']
    : null;
  const riskPolicy = isRecord(lendingPolicy?.['risk_policy']) ? lendingPolicy['risk_policy'] : null;
  const collateralPolicies = readManagedCollateralPolicies(collateralPolicy?.['assets']);
  const allowedBorrowAssets = borrowPolicy?.['allowed_assets'];
  const maxLtvBps = readFiniteNumber(riskPolicy?.['max_ltv_bps']);
  const minHealthFactor = readString(riskPolicy?.['min_health_factor']);

  if (
    !Array.isArray(allowedBorrowAssets) ||
    !isStringArray(allowedBorrowAssets) ||
    collateralPolicies === null ||
    maxLtvBps === null ||
    minHealthFactor === null
  ) {
    return null;
  }

  return {
    lending_policy: {
      collateral_policy: {
        ...(collateralPolicy ?? {}),
        assets: collateralPolicies,
      },
      borrow_policy: {
        ...(borrowPolicy ?? {}),
        allowed_assets: [...allowedBorrowAssets],
      },
      risk_policy: {
        ...(riskPolicy ?? {}),
        max_ltv_bps: maxLtvBps,
        min_health_factor: minHealthFactor,
      },
    },
  };
}

function readRecordArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is Record<string, unknown> => isRecord(entry));
}

function readNumberLike(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function readEconomicExposureInputs(value: unknown): PortfolioProjectionEconomicExposureInput[] {
  return readRecordArray(value)
    .map((entry) => {
      const asset = readString(entry['asset']);
      const quantity = readString(entry['quantity']);

      if (asset === null || quantity === null) {
        return null;
      }

      return {
        asset,
        quantity,
      };
    })
    .filter((entry): entry is PortfolioProjectionEconomicExposureInput => entry !== null);
}

function buildPortfolioProjectionOwnedUnits(params: {
  portfolioState: Record<string, unknown>;
  benchmarkAsset: string;
}): PortfolioProjectionOwnedUnitInput[] {
  return readRecordArray(params.portfolioState['owned_units'])
    .map((entry) => {
      const unitId = readString(entry['unit_id']);
      const rootAsset = readString(entry['root_asset']);
      const quantity = readString(entry['quantity']) ?? readString(entry['amount']);
      const benchmarkValue =
        readNumberLike(entry['benchmark_value']) ?? readNumberLike(entry['benchmark_value_usd']);

      if (unitId === null || rootAsset === null || quantity === null || benchmarkValue === null) {
        return null;
      }

      return {
        unitId,
        rootAsset,
        network: readString(entry['network']) ?? PORTFOLIO_MANAGER_NETWORK,
        quantity,
        benchmarkAsset: readString(entry['benchmark_asset']) ?? params.benchmarkAsset,
        benchmarkValue,
        reservationId: readString(entry['reservation_id']),
        positionScopeId:
          readString(entry['position_scope_id']) ??
          readString(entry['scope_id']) ??
          readString(entry['protocol_position_ref']),
      };
    })
    .filter((entry): entry is PortfolioProjectionOwnedUnitInput => entry !== null);
}

function buildPortfolioProjectionReservations(params: {
  portfolioState: Record<string, unknown>;
  fallbackAgentId: string;
  ownedUnits: PortfolioProjectionOwnedUnitInput[];
}): PortfolioProjectionReservationInput[] {
  return readRecordArray(params.portfolioState['reservations'])
    .map((entry) => {
      const reservationId = readString(entry['reservation_id']);
      if (reservationId === null) {
        return null;
      }

      const unitAllocations = readRecordArray(entry['unit_allocations'])
        .map((allocation) => {
          const unitId = readString(allocation['unit_id']);
          const quantity = readString(allocation['quantity']);

          if (unitId === null || quantity === null) {
            return null;
          }

          return {
            unitId,
            quantity,
          };
        })
        .filter(
          (allocation): allocation is PortfolioProjectionReservationAllocationInput =>
            allocation !== null,
        );

      const fallbackUnitAllocations =
        unitAllocations.length > 0
          ? unitAllocations
          : params.ownedUnits
              .filter((unit) => unit.reservationId === reservationId)
              .map((unit) => ({
                unitId: unit.unitId,
                quantity: unit.quantity,
              }));

      const statusValue = readString(entry['status']);
      const status =
        statusValue === 'active' ||
        statusValue === 'consumed' ||
        statusValue === 'released' ||
        statusValue === 'superseded'
          ? statusValue
          : 'active';

      return {
        reservationId,
        agentId: readString(entry['agent_id']) ?? params.fallbackAgentId,
        purpose: readString(entry['purpose']) ?? 'position.enter',
        controlPath: readString(entry['control_path']) ?? 'lending.supply',
        createdAt: readString(entry['created_at']) ?? PORTFOLIO_MANAGER_BOOTSTRAP_TIMESTAMP,
        status,
        unitAllocations: fallbackUnitAllocations,
      };
    })
    .filter((entry): entry is PortfolioProjectionReservationInput => entry !== null);
}

function buildPortfolioProjectionWalletContents(
  portfolioState: Record<string, unknown>,
): PortfolioProjectionWalletContentInput[] {
  return readRecordArray(portfolioState['wallet_contents'])
    .map((entry) => {
      const asset = readString(entry['asset']);
      const quantity = readString(entry['quantity']) ?? readString(entry['amount']);
      const valueUsd = readNumberLike(entry['value_usd']) ?? readNumberLike(entry['valueUsd']);

      if (asset === null || quantity === null || valueUsd === null) {
        return null;
      }

      const economicExposures = readEconomicExposureInputs(entry['economic_exposures']);
      const displayQuantity = buildTokenDisplayQuantity({
        asset,
        quantity,
        explicitDisplayQuantity: readString(entry['display_quantity']) ?? readString(entry['displayQuantity']),
      });

      return {
        asset,
        network: readString(entry['network']) ?? PORTFOLIO_MANAGER_NETWORK,
        quantity,
        ...(displayQuantity !== undefined ? { displayQuantity } : {}),
        valueUsd,
        ...(economicExposures.length > 0 ? { economicExposures } : {}),
      };
    })
    .filter((entry): entry is PortfolioProjectionWalletContentInput => entry !== null);
}

function buildPortfolioProjectionActivePositionScopes(
  portfolioState: Record<string, unknown>,
): PortfolioProjectionActivePositionScopeInput[] {
  return readRecordArray(portfolioState['active_position_scopes'])
    .map((scope) => {
      const scopeId = readString(scope['scope_id']);
      if (scopeId === null) {
        return null;
      }

      const members = readRecordArray(scope['members'])
        .map((member, index) => {
          const memberId = readString(member['member_id']) ?? `${scopeId}-member-${index}`;
          const asset = readString(member['asset']);
          const quantity = readString(member['quantity']) ?? readString(member['amount']);
          const valueUsd =
            readNumberLike(member['value_usd']) ?? readNumberLike(member['valueUsd']);

          if (asset === null || quantity === null || valueUsd === null) {
            return null;
          }

          const memberState = isRecord(member['state']) ? member['state'] : null;
          const displayQuantity = buildTokenDisplayQuantity({
            asset,
            quantity,
            explicitDisplayQuantity:
              readString(member['display_quantity']) ?? readString(member['displayQuantity']),
          });

          return {
            memberId,
            role: readString(member['role']) === 'debt' ? 'debt' : 'collateral',
            asset,
            quantity,
            ...(displayQuantity !== undefined ? { displayQuantity } : {}),
            valueUsd,
            economicExposures: readEconomicExposureInputs(member['economic_exposures']),
            state: {
              withdrawableQuantity: readString(memberState?.['withdrawable_quantity']),
              supplyApr: readString(memberState?.['supply_apr']),
              borrowApr: readString(memberState?.['borrow_apr']),
            },
          };
        })
        .filter(
          (entry): entry is PortfolioProjectionActivePositionScopeMemberInput => entry !== null,
        );

      const marketStateRecord = isRecord(scope['market_state']) ? scope['market_state'] : null;
      const borrowableHeadroomUsd = readString(marketStateRecord?.['borrowable_headroom_usd']);
      const availableBorrowsUsd = readString(marketStateRecord?.['available_borrows_usd']);
      const healthFactor = readString(marketStateRecord?.['health_factor']);
      const currentLtvBps = readFiniteNumber(marketStateRecord?.['current_ltv_bps']);
      const liquidationThresholdBps = readFiniteNumber(
        marketStateRecord?.['liquidation_threshold_bps'],
      );
      const marketState =
        borrowableHeadroomUsd === null &&
        availableBorrowsUsd === null &&
        healthFactor === null &&
        currentLtvBps === null &&
        liquidationThresholdBps === null
          ? undefined
          : {
              ...(availableBorrowsUsd !== null ? { availableBorrowsUsd } : {}),
              borrowableHeadroomUsd: borrowableHeadroomUsd ?? '0',
              ...(currentLtvBps !== null ? { currentLtvBps } : {}),
              ...(liquidationThresholdBps !== null ? { liquidationThresholdBps } : {}),
              ...(healthFactor !== null ? { healthFactor } : {}),
            };
      const ownerType = readString(scope['owner_type']);
      const normalizedOwnerType =
        ownerType === 'agent' || ownerType === 'user_idle' ? ownerType : null;
      const ownerId = readString(scope['owner_id']);

      return {
        scopeId,
        kind: readString(scope['kind']) ?? readString(scope['scope_type_id']) ?? 'position',
        ...(normalizedOwnerType !== null ? { ownerType: normalizedOwnerType } : {}),
        ...(ownerId !== null ? { ownerId } : {}),
        network: readString(scope['network']) ?? PORTFOLIO_MANAGER_NETWORK,
        protocolSystem: readString(scope['protocol_system']) ?? 'unknown',
        containerRef: readString(scope['container_ref']) ?? scopeId,
        status: readString(scope['status']) === 'closed' ? 'closed' : 'active',
        ...(marketState ? { marketState } : {}),
        members,
      };
    })
    .filter((entry): entry is PortfolioProjectionActivePositionScopeInput => entry !== null);
}

function buildPortfolioProjectionInput(params: {
  portfolioState: Record<string, unknown> | null;
  fallbackAgentId: string;
}): PortfolioProjectionInput | null {
  if (!params.portfolioState) {
    return null;
  }

  const benchmarkAsset =
    readString(params.portfolioState['benchmark_asset']) ?? FIRST_MANAGED_AGENT_BENCHMARK_ASSET;
  const ownedUnits = buildPortfolioProjectionOwnedUnits({
    portfolioState: params.portfolioState,
    benchmarkAsset,
  });

  return {
    benchmarkAsset,
    walletContents: buildPortfolioProjectionWalletContents(params.portfolioState),
    reservations: buildPortfolioProjectionReservations({
      portfolioState: params.portfolioState,
      fallbackAgentId: readString(params.portfolioState['agent_id']) ?? params.fallbackAgentId,
      ownedUnits,
    }),
    ownedUnits,
    activePositionScopes: buildPortfolioProjectionActivePositionScopes(params.portfolioState),
  };
}

function buildPortfolioProjectionOwnedUnitsFromOnboardingState(params: {
  onboardingState: NonNullable<SharedEmberOnboardingState>;
  benchmarkAsset: string;
}): PortfolioProjectionOwnedUnitInput[] {
  return (params.onboardingState.owned_units ?? [])
    .map((entry) => {
      const benchmarkValue = readNumberLike(entry.benchmark_value);
      if (
        typeof entry.unit_id !== 'string' ||
        typeof entry.root_asset !== 'string' ||
        typeof entry.quantity !== 'string' ||
        benchmarkValue === null
      ) {
        return null;
      }

      return {
        unitId: entry.unit_id,
        rootAsset: entry.root_asset,
        network: entry.network ?? params.onboardingState.network,
        quantity: entry.quantity,
        benchmarkAsset: entry.benchmark_asset ?? params.benchmarkAsset,
        benchmarkValue,
        reservationId: entry.reservation_id,
        positionScopeId: entry.position_scope_id ?? null,
      };
    })
    .filter((entry): entry is PortfolioProjectionOwnedUnitInput => entry !== null);
}

function buildPortfolioProjectionReservationsFromOnboardingState(params: {
  onboardingState: NonNullable<SharedEmberOnboardingState>;
  fallbackAgentId: string;
}): PortfolioProjectionReservationInput[] {
  return (params.onboardingState.reservations ?? [])
    .map((entry) => {
      if (typeof entry.reservation_id !== 'string') {
        return null;
      }

      const status =
        entry.status === 'active' ||
        entry.status === 'consumed' ||
        entry.status === 'released' ||
        entry.status === 'superseded'
          ? entry.status
          : 'active';

      return {
        reservationId: entry.reservation_id,
        agentId: entry.agent_id ?? params.fallbackAgentId,
        purpose: entry.purpose,
        controlPath: entry.control_path,
        createdAt: entry.created_at ?? PORTFOLIO_MANAGER_BOOTSTRAP_TIMESTAMP,
        status,
        unitAllocations: entry.unit_allocations
          .filter(
            (allocation) =>
              typeof allocation.unit_id === 'string' && typeof allocation.quantity === 'string',
          )
          .map((allocation) => ({
            unitId: allocation.unit_id,
            quantity: allocation.quantity,
          })),
      };
    })
    .filter((entry): entry is PortfolioProjectionReservationInput => entry !== null);
}

function buildAggregatedPortfolioProjectionInputFromAccountingStates(params: {
  baseProjectionInputs: PortfolioProjectionInput[];
  accountingStateReads: ManagedAgentAccountingStateRead[];
}): PortfolioProjectionInput | null {
  if (params.baseProjectionInputs.length === 0) {
    return null;
  }

  const walletProjectionInput =
    params.baseProjectionInputs.find((input) => input.walletContents.length > 0) ??
    params.baseProjectionInputs[0];
  if (!walletProjectionInput) {
    return null;
  }

  const benchmarkAsset =
    params.accountingStateReads
      .flatMap((stateRead) => stateRead.onboardingState.owned_units ?? [])
      .find((unit) => typeof unit.benchmark_asset === 'string')?.benchmark_asset ??
    walletProjectionInput.benchmarkAsset;
  const ownedUnitsById = new Map<string, PortfolioProjectionOwnedUnitInput>();
  const reservationsById = new Map<string, PortfolioProjectionReservationInput>();
  const activePositionScopesById = new Map<string, PortfolioProjectionActivePositionScopeInput>();

  for (const accountingStateRead of params.accountingStateReads) {
    for (const ownedUnit of buildPortfolioProjectionOwnedUnitsFromOnboardingState({
      onboardingState: accountingStateRead.onboardingState,
      benchmarkAsset,
    })) {
      if (!ownedUnitsById.has(ownedUnit.unitId)) {
        ownedUnitsById.set(ownedUnit.unitId, ownedUnit);
      }
    }

    for (const reservation of buildPortfolioProjectionReservationsFromOnboardingState({
      onboardingState: accountingStateRead.onboardingState,
      fallbackAgentId: accountingStateRead.agentId,
    })) {
      if (!reservationsById.has(reservation.reservationId)) {
        reservationsById.set(reservation.reservationId, reservation);
      }
    }
  }

  for (const baseProjectionInput of params.baseProjectionInputs) {
    for (const activePositionScope of baseProjectionInput.activePositionScopes) {
      if (!activePositionScopesById.has(activePositionScope.scopeId)) {
        activePositionScopesById.set(activePositionScope.scopeId, activePositionScope);
      }
    }
  }

  return {
    benchmarkAsset,
    walletContents: walletProjectionInput.walletContents,
    reservations: Array.from(reservationsById.values()),
    ownedUnits: Array.from(ownedUnitsById.values()),
    activePositionScopes: Array.from(activePositionScopesById.values()),
  };
}

function buildAggregatedPortfolioManagerWalletAccountingDetails(params: {
  accountingStateReads: ManagedAgentAccountingStateRead[];
}): ReturnType<typeof buildPortfolioManagerWalletAccountingDetails> | null {
  if (params.accountingStateReads.length === 0) {
    return null;
  }

  const accountingDetails = params.accountingStateReads.map((stateRead) =>
    buildPortfolioManagerWalletAccountingDetails({
      revision: stateRead.revision,
      onboardingState: stateRead.onboardingState,
    }),
  );
  const primaryDetails = accountingDetails[0];
  if (!primaryDetails) {
    return null;
  }

  const assetsByUnitId = new Map<string, (typeof primaryDetails.assets)[number]>();
  const reservationsById = new Map<string, (typeof primaryDetails.reservations)[number]>();
  for (const details of accountingDetails) {
    for (const asset of details.assets) {
      if (!assetsByUnitId.has(asset.unitId)) {
        assetsByUnitId.set(asset.unitId, asset);
      }
    }

    for (const reservation of details.reservations) {
      if (!reservationsById.has(reservation.reservationId)) {
        reservationsById.set(reservation.reservationId, reservation);
      }
    }
  }

  const phaseValues = [
    ...new Set(accountingDetails.map((details) => details.onboarding.phase)),
  ].sort();
  const aggregatedProofs: typeof primaryDetails.onboarding.proofs = {
    rooted_wallet_context_registered: accountingDetails.every(
      (details) => details.onboarding.proofs.rooted_wallet_context_registered,
    ),
    root_delegation_registered: accountingDetails.every(
      (details) => details.onboarding.proofs.root_delegation_registered,
    ),
    root_authority_active: accountingDetails.every(
      (details) => details.onboarding.proofs.root_authority_active,
    ),
    wallet_baseline_observed: accountingDetails.every(
      (details) => details.onboarding.proofs.wallet_baseline_observed,
    ),
    accounting_units_seeded: accountingDetails.every(
      (details) => details.onboarding.proofs.accounting_units_seeded,
    ),
    mandate_inputs_configured: accountingDetails.every(
      (details) => details.onboarding.proofs.mandate_inputs_configured,
    ),
    reserve_policy_configured: accountingDetails.every(
      (details) => details.onboarding.proofs.reserve_policy_configured,
    ),
    capital_reserved_for_agent: accountingDetails.every(
      (details) => details.onboarding.proofs.capital_reserved_for_agent,
    ),
    policy_snapshot_recorded: accountingDetails.every(
      (details) => details.onboarding.proofs.policy_snapshot_recorded,
    ),
    initial_subagent_delegation_issued: accountingDetails.every(
      (details) =>
        details.onboarding.proofs.initial_subagent_delegation_issued ??
        details.onboarding.proofs.agent_active,
    ),
    agent_active: accountingDetails.every((details) => details.onboarding.proofs.agent_active),
  };

  return {
    wallet: primaryDetails.wallet,
    onboarding: {
      phase:
        phaseValues.length === 1
          ? primaryDetails.onboarding.phase
          : `mixed:${phaseValues.join(',')}`,
      revision: Math.max(...accountingDetails.map((details) => details.onboarding.revision)),
      active: accountingDetails.every((details) => details.onboarding.active),
      proofs: aggregatedProofs,
      rootedWalletContextId:
        accountingDetails.find((details) => details.onboarding.rootedWalletContextId !== null)
          ?.onboarding.rootedWalletContextId ?? null,
      rootDelegationId:
        accountingDetails.find((details) => details.onboarding.rootDelegationId !== null)
          ?.onboarding.rootDelegationId ?? null,
    },
    assets: Array.from(assetsByUnitId.values()),
    reservations: Array.from(reservationsById.values()),
  };
}

function parsePortfolioMandate(input: unknown): PortfolioManagerPortfolioMandate | null {
  if (typeof input !== 'object' || input === null) {
    return null;
  }

  if (
    !('approved' in input) ||
    input.approved !== true ||
    !('riskLevel' in input) ||
    input.riskLevel !== PORTFOLIO_MANAGER_DEFAULT_RISK_LEVEL
  ) {
    return null;
  }

  return {
    approved: true,
    riskLevel: PORTFOLIO_MANAGER_DEFAULT_RISK_LEVEL,
  };
}

function parseFirstManagedMandate(input: unknown): PortfolioManagerFirstManagedMandate | null {
  if (!isRecord(input)) {
    return null;
  }

  const targetAgentId = readString(input['targetAgentId']);
  const targetAgentKey = readString(input['targetAgentKey'])?.trim() ?? null;
  const managedMandate = readManagedMandate(input['managedMandate']);

  if (targetAgentId !== FIRST_MANAGED_AGENT_TYPE || !targetAgentKey || managedMandate === null) {
    return null;
  }

  return {
    targetAgentId: FIRST_MANAGED_AGENT_TYPE,
    targetAgentKey,
    managedMandate,
  };
}

function parsePortfolioManagerSetupInput(input: unknown): PortfolioManagerSetupInput | null {
  if (typeof input !== 'object' || input === null) {
    return null;
  }

  const walletAddress =
    'walletAddress' in input && typeof input.walletAddress === 'string'
      ? input.walletAddress
      : null;
  if (!walletAddress?.startsWith('0x') || walletAddress.length < 4) {
    return null;
  }

  const portfolioMandate = 'portfolioMandate' in input ? input.portfolioMandate : null;
  const firstManagedMandate = 'firstManagedMandate' in input ? input.firstManagedMandate : null;
  const portfolioManagerMandate = 'portfolioManagerMandate' in input
    ? input.portfolioManagerMandate
    : null;
  const parsedPortfolioMandate = parsePortfolioMandate(portfolioMandate);
  const parsedFirstManagedMandate = parseFirstManagedMandate(firstManagedMandate);
  const parsedPortfolioManagerMandate =
    portfolioManagerMandate === null || !isRecord(portfolioManagerMandate)
      ? null
      : portfolioManagerMandate;

  if (!parsedPortfolioMandate || !parsedFirstManagedMandate) {
    return null;
  }

  return {
    walletAddress: walletAddress as `0x${string}`,
    portfolioMandate: parsedPortfolioMandate,
    firstManagedMandate: parsedFirstManagedMandate,
    portfolioManagerMandate: parsedPortfolioManagerMandate,
  };
}

function parseManagedMandateUpdateInput(input: unknown): ManagedMandateUpdateInput | null {
  if (!isRecord(input)) {
    return null;
  }

  const targetAgentId = readString(input['targetAgentId']);
  const managedMandate = isRecord(input['managedMandate']) ? input['managedMandate'] : null;

  if (
    !managedMandate ||
    (targetAgentId !== FIRST_MANAGED_AGENT_TYPE &&
      targetAgentId !== PORTFOLIO_MANAGER_MANDATE_ROUTE_ID)
  ) {
    return null;
  }

  if (targetAgentId === PORTFOLIO_MANAGER_MANDATE_ROUTE_ID) {
    return {
      targetAgentId: PORTFOLIO_MANAGER_MANDATE_ROUTE_ID,
      managedMandate,
    };
  }

  const validatedManagedMandate = readManagedMandate(managedMandate);
  if (validatedManagedMandate === null) {
    return null;
  }

  return {
    targetAgentId: FIRST_MANAGED_AGENT_TYPE,
    managedMandate: validatedManagedMandate,
  };
}

function readSpotSwapAmountType(value: unknown): HiddenOcaSpotSwapInput['amountType'] | null {
  return value === 'exactIn' || value === 'exactOut' ? value : null;
}

function readSpotSwapReservationConflictHandling(
  value: unknown,
): HiddenOcaSpotSwapInput['reservationConflictHandling'] | null {
  if (!isRecord(value)) {
    return null;
  }

  const kind = readString(value['kind']);
  if (kind !== 'allow_reserved_for_other_agent' && kind !== 'unassigned_only') {
    return null;
  }

  return { kind };
}

function readSpotSwapCapitalPool(value: unknown): HiddenOcaSpotSwapInput['capitalPool'] | null {
  return value === 'unassigned_only' || value === 'reserved_or_assigned' || value === 'all'
    ? value
    : null;
}

function unwrapCommandInputJson(input: unknown): unknown {
  if (!isRecord(input)) {
    return input;
  }

  const inputJson = readString(input['inputJson']);
  if (!inputJson) {
    return input;
  }

  try {
    return JSON.parse(inputJson) as unknown;
  } catch {
    return input;
  }
}

function parseSpotSwapDispatchInput(input: unknown): HiddenOcaSpotSwapInput | null {
  input = unwrapCommandInputJson(input);
  if (!isRecord(input)) {
    return null;
  }

  const walletAddress = readHexAddress(input['walletAddress']);
  const amount = readString(input['amount']);
  const amountType = readSpotSwapAmountType(input['amountType']);
  const fromChain = readString(input['fromChain']);
  const toChain = readString(input['toChain']);
  const fromToken = readString(input['fromToken']);
  const toToken = readString(input['toToken']);

  if (
    walletAddress === null ||
    amount === null ||
    amountType === null ||
    fromChain === null ||
    toChain === null ||
    fromToken === null ||
    toToken === null
  ) {
    return null;
  }

  const reservationConflictHandling = readSpotSwapReservationConflictHandling(
    input['reservationConflictHandling'],
  );
  const capitalPool = readSpotSwapCapitalPool(input['capitalPool']);

  return {
    walletAddress,
    amount,
    amountType,
    fromChain,
    toChain,
    fromToken,
    toToken,
    ...(readString(input['slippageTolerance'])
      ? { slippageTolerance: readString(input['slippageTolerance'])! }
      : {}),
    ...(readString(input['expiration']) ? { expiration: readString(input['expiration'])! } : {}),
    ...(readString(input['idempotencyKey'])
      ? { idempotencyKey: readString(input['idempotencyKey'])! }
      : {}),
    ...(readString(input['rootedWalletContextId'])
      ? { rootedWalletContextId: readString(input['rootedWalletContextId'])! }
      : {}),
    ...(capitalPool ? { capitalPool } : {}),
    ...(reservationConflictHandling ? { reservationConflictHandling } : {}),
  };
}

function buildSpotSwapDispatchInput(input: {
  operationInput: unknown;
  currentState: PortfolioManagerLifecycleState;
}): HiddenOcaSpotSwapInput | null {
  const dispatch = parseSpotSwapDispatchInput(input.operationInput);
  if (!dispatch) {
    return null;
  }

  return {
    ...dispatch,
    ...(dispatch.rootedWalletContextId
      ? {}
      : input.currentState.lastRootedWalletContextId
        ? { rootedWalletContextId: input.currentState.lastRootedWalletContextId }
        : {}),
  };
}

function buildSpotSwapArtifact(result: HiddenOcaSpotSwapResult): Record<string, unknown> {
  return {
    type: 'hidden-oca-spot-swap',
    status: result.status,
    ...(result.idempotencyKey ? { idempotencyKey: result.idempotencyKey } : {}),
    swapSummary: result.swapSummary,
    transactionPlanId: result.transactionPlanId,
    requestId: result.requestId,
    committedEventIds: result.committedEventIds,
    ...(result.transactionHash ? { transactionHash: result.transactionHash } : {}),
    ...(result.conflict ? { conflict: result.conflict } : {}),
    ...(result.failureReason ? { failureReason: result.failureReason } : {}),
  };
}

function buildSpotSwapCompletionMessage(status: HiddenOcaSpotSwapResult['status']): string {
  switch (status) {
    case 'completed':
      return 'Spot swap completed through the portfolio manager.';
    case 'submitted':
      return 'Spot swap submitted through the portfolio manager.';
    case 'awaiting_redelegation':
      return 'Spot swap execution is waiting for Shared Ember redelegation readiness.';
    default:
      return 'Spot swap execution finished through the portfolio manager.';
  }
}

function shouldConfirmSpotSwapReservedCapital(dispatch: HiddenOcaSpotSwapInput): boolean {
  return dispatch.capitalPool === 'reserved_or_assigned' || dispatch.capitalPool === 'all';
}

function buildSpotSwapDispatchSummary(
  dispatch: HiddenOcaSpotSwapInput,
): HiddenOcaSpotSwapResult['swapSummary'] {
  return {
    fromToken: dispatch.fromToken,
    toToken: dispatch.toToken,
    amount: dispatch.amount,
    amountType: dispatch.amountType,
    displayFromAmount: '',
    displayToAmount: '',
  };
}

function buildSpotSwapReservedCapitalConfirmationResult(input: {
  currentState: PortfolioManagerLifecycleState;
  dispatch: HiddenOcaSpotSwapInput;
}) {
  const conflict: NonNullable<HiddenOcaSpotSwapResult['conflict']> = {
    kind: 'reserved_for_other_agent',
    blockingReasonCode: 'reserved_for_other_agent',
    reservationId: null,
    message:
      input.dispatch.capitalPool === 'all'
        ? 'The selected swap pool includes capital reserved for another agent.'
        : 'The requested swap capital is reserved for another agent.',
    retryOptions: ['allow_reserved_for_other_agent', 'unassigned_only'],
  };

  return buildSpotSwapOperationResult({
    currentState: input.currentState,
    dispatch: input.dispatch,
    result: {
      status: 'conflict',
      swapSummary: buildSpotSwapDispatchSummary(input.dispatch),
      transactionPlanId: null,
      requestId: null,
      committedEventIds: [],
      conflict,
    },
  });
}

function buildSpotSwapOperationResult(input: {
  currentState: PortfolioManagerLifecycleState;
  dispatch: HiddenOcaSpotSwapInput;
  result: HiddenOcaSpotSwapResult;
}) {
  if (input.result.status === 'conflict' && input.result.conflict) {
    const nextState: PortfolioManagerLifecycleState = {
      ...input.currentState,
      pendingSpotSwapConflict: {
        dispatch: {
          ...input.dispatch,
          ...(input.result.idempotencyKey ? { idempotencyKey: input.result.idempotencyKey } : {}),
        },
        conflict: input.result.conflict,
      },
    };

    return {
      state: nextState,
      outputs: {
        status: {
          executionStatus: 'interrupted' as const,
          statusMessage: PORTFOLIO_MANAGER_SWAP_CONFLICT_MESSAGE,
        },
        interrupt: {
          type: PORTFOLIO_MANAGER_SWAP_CONFLICT_INTERRUPT_TYPE,
          mirroredToActivity: false,
          message: PORTFOLIO_MANAGER_SWAP_CONFLICT_MESSAGE,
          payload: {
            swap: input.result.swapSummary,
            conflict: input.result.conflict,
            retryOptions: input.result.conflict.retryOptions,
          },
        },
        artifacts: [
          {
            data: buildSpotSwapArtifact(input.result),
          },
        ],
      },
    };
  }

  if (input.result.status === 'awaiting_redelegation') {
    return {
      state: input.currentState,
      outputs: {
        status: {
          executionStatus: 'failed' as const,
          statusMessage:
            'Spot swap execution is waiting for Shared Ember redelegation readiness and was not completed.',
        },
        artifacts: [
          {
            data: buildSpotSwapArtifact(input.result),
          },
        ],
      },
    };
  }

  if (input.result.status === 'failed' || input.result.status === 'blocked') {
    return {
      state: input.currentState,
      outputs: {
        status: {
          executionStatus: 'failed' as const,
          statusMessage:
            input.result.failureReason ??
            'Spot swap could not be prepared or executed through the portfolio manager.',
        },
        artifacts: [
          {
            data: buildSpotSwapArtifact(input.result),
          },
        ],
      },
    };
  }

  return {
    state: {
      ...input.currentState,
      pendingSpotSwapConflict: null,
    },
    outputs: {
      status: {
        executionStatus: 'completed' as const,
        statusMessage: buildSpotSwapCompletionMessage(input.result.status),
      },
      artifacts: [
        {
          data: buildSpotSwapArtifact(input.result),
        },
      ],
    },
  };
}

function readSpotSwapConflictOutcome(
  value: unknown,
): HiddenOcaReservationConflictHandling['kind'] | 'cancel' | null {
  value = unwrapCommandInputJson(value);
  if (!isRecord(value)) {
    return null;
  }

  const outcome = readString(value['outcome']);
  if (
    outcome === 'allow_reserved_for_other_agent' ||
    outcome === 'unassigned_only' ||
    outcome === 'cancel'
  ) {
    return outcome;
  }

  return null;
}

function buildConfirmedSpotSwapDispatch(input: {
  dispatch: HiddenOcaSpotSwapInput;
  outcome: HiddenOcaReservationConflictHandling['kind'];
}): HiddenOcaSpotSwapInput {
  return {
    ...input.dispatch,
    ...(input.dispatch.idempotencyKey
      ? {
          idempotencyKey: `${input.dispatch.idempotencyKey}:reserved-capital-confirmation:${input.outcome}`,
        }
      : {}),
    reservationConflictHandling: {
      kind: input.outcome,
    },
  };
}

function readApprovedSetupFromOnboardingBootstrap(
  value: unknown,
): PortfolioManagerApprovedSetup | null {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('rootedWalletContext' in value) ||
    typeof value.rootedWalletContext !== 'object' ||
    value.rootedWalletContext === null ||
    !('metadata' in value.rootedWalletContext) ||
    typeof value.rootedWalletContext.metadata !== 'object' ||
    value.rootedWalletContext.metadata === null ||
    !('approvedOnboardingSetup' in value.rootedWalletContext.metadata)
  ) {
    return null;
  }

  const approvedOnboardingSetup = value.rootedWalletContext.metadata.approvedOnboardingSetup;
  if (typeof approvedOnboardingSetup !== 'object' || approvedOnboardingSetup === null) {
    return null;
  }

  const portfolioMandate =
    'portfolioMandate' in approvedOnboardingSetup
      ? parsePortfolioMandate(approvedOnboardingSetup.portfolioMandate)
      : null;
  const firstManagedMandate =
    'firstManagedMandate' in approvedOnboardingSetup
      ? parseFirstManagedMandate(approvedOnboardingSetup.firstManagedMandate)
      : null;
  const portfolioManagerMandate =
    'portfolioManagerMandate' in approvedOnboardingSetup
      ? approvedOnboardingSetup.portfolioManagerMandate
      : null;
  const parsedPortfolioManagerMandate =
    portfolioManagerMandate === null || !isRecord(portfolioManagerMandate)
      ? null
      : portfolioManagerMandate;

  if (!portfolioMandate || !firstManagedMandate) {
    return null;
  }

  return {
    portfolioMandate,
    firstManagedMandate,
    portfolioManagerMandate: parsedPortfolioManagerMandate,
  };
}

function readOnboardingMandateSources(value: unknown): OnboardingMandateSource[] {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('mandates' in value) ||
    !Array.isArray(value.mandates)
  ) {
    return [];
  }

  const mandateSources: OnboardingMandateSource[] = [];
  for (const mandate of value.mandates) {
    if (
      typeof mandate !== 'object' ||
      mandate === null ||
      !('mandate_ref' in mandate) ||
      typeof mandate.mandate_ref !== 'string' ||
      !('agent_id' in mandate) ||
      typeof mandate.agent_id !== 'string'
    ) {
      continue;
    }

    mandateSources.push({
      mandate_ref: mandate.mandate_ref,
      agent_id: mandate.agent_id,
    });
  }

  return mandateSources;
}

function readManagedAgentIdsFromOnboardingBootstrap(value: unknown): string[] {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('mandates' in value) ||
    !Array.isArray(value.mandates)
  ) {
    return [];
  }

  const managedAgentIds = new Set<string>();
  for (const mandate of value.mandates) {
    if (
      typeof mandate !== 'object' ||
      mandate === null ||
      !('agent_id' in mandate) ||
      typeof mandate.agent_id !== 'string' ||
      !('managed_mandate' in mandate) ||
      mandate.managed_mandate === null
    ) {
      continue;
    }

    managedAgentIds.add(mandate.agent_id);
  }

  return Array.from(managedAgentIds);
}

function readManagedAgentIdsForLifecycleState(
  currentState: PortfolioManagerLifecycleState,
): string[] {
  if (currentState.phase === 'prehire') {
    return [];
  }

  const bootstrapManagedAgentIds = readManagedAgentIdsFromOnboardingBootstrap(
    currentState.lastOnboardingBootstrap,
  );
  return bootstrapManagedAgentIds.length > 0
    ? bootstrapManagedAgentIds
    : [FIRST_MANAGED_AGENT_TYPE];
}

async function readManagedPortfolioStateSnapshot(params: {
  protocolHost: PortfolioManagerSharedEmberProtocolHost;
  threadId: string;
  currentState: PortfolioManagerLifecycleState;
}): Promise<ManagedPortfolioStateSnapshot> {
  const managedAgentIds = readManagedAgentIdsForLifecycleState(params.currentState);
  const managedPortfolioStateReads =
    managedAgentIds.length > 0
      ? (
          await Promise.all(
            managedAgentIds.map(async (managedAgentId) => {
              try {
                const portfolioRead = await readSharedEmberPortfolioState({
                  protocolHost: params.protocolHost,
                  threadId: params.threadId,
                  agentId: managedAgentId,
                });
                return {
                  agentId: managedAgentId,
                  ...portfolioRead,
                };
              } catch {
                return null;
              }
            }),
          )
        ).filter(
          (portfolioRead): portfolioRead is ManagedAgentPortfolioStateRead =>
            portfolioRead !== null,
        )
      : [];
  const managedMandateProjection =
    managedPortfolioStateReads.reduce<ManagedMandateEditorProjection | null>(
      (currentProjection, portfolioRead) => {
        if (currentProjection) {
          return currentProjection;
        }

        return buildManagedMandateEditorProjection(portfolioRead.portfolioState);
      },
      null,
    );
  const managedWalletAddress =
    managedMandateProjection?.rootUserWallet ??
    params.currentState.activeWalletAddress ??
    readOnboardingBootstrapWalletAddress(params.currentState.lastOnboardingBootstrap);
  const accountingStateReads =
    managedWalletAddress && managedAgentIds.length > 0
      ? (
          await Promise.all(
            managedAgentIds.map(async (managedAgentId) => {
              try {
                const stateRead = await readManagedAgentAccountingState({
                  protocolHost: params.protocolHost,
                  agentId: managedAgentId,
                  walletAddress: managedWalletAddress,
                });
                return {
                  agentId: managedAgentId,
                  ...stateRead,
                };
              } catch {
                return null;
              }
            }),
          )
        ).filter((stateRead): stateRead is ManagedAgentAccountingStateRead => stateRead !== null)
      : [];
  const managedPortfolioProjectionInputs = managedPortfolioStateReads
    .map((portfolioRead) =>
      buildPortfolioProjectionInput({
        portfolioState: portfolioRead.portfolioState,
        fallbackAgentId: portfolioRead.agentId,
      }),
    )
    .filter(
      (projectionInput): projectionInput is PortfolioProjectionInput => projectionInput !== null,
    );
  const portfolioProjectionInput =
    managedPortfolioProjectionInputs.length > 0 && accountingStateReads.length > 0
      ? buildAggregatedPortfolioProjectionInputFromAccountingStates({
          baseProjectionInputs: managedPortfolioProjectionInputs,
          accountingStateReads,
        })
      : managedPortfolioProjectionInputs.length > 0
        ? (managedPortfolioProjectionInputs[0] ?? null)
        : null;

  return {
    managedAgentIds,
    managedPortfolioStateReads,
    managedMandateProjection,
    managedWalletAddress,
    accountingStateReads,
    portfolioProjectionInput,
    revision:
      managedPortfolioStateReads.length === 0 && accountingStateReads.length === 0
        ? null
        : Math.max(
            0,
            ...managedPortfolioStateReads.map((portfolioRead) => portfolioRead.revision ?? 0),
            ...accountingStateReads.map((stateRead) => stateRead.revision ?? 0),
          ),
  };
}

function buildManagedMandateEditorProjection(
  portfolioState: Record<string, unknown> | null,
): ManagedMandateEditorProjection | null {
  if (!portfolioState) {
    return null;
  }

  const mandateRef = readString(portfolioState['mandate_ref']);
  const managedMandate = readManagedMandate(portfolioState['mandate_context']);

  if (!mandateRef || managedMandate === null) {
    return null;
  }

  const firstReservation = readFirstRecordFromArray(portfolioState['reservations']);
  const reservationId = readString(firstReservation?.['reservation_id']);
  const ownedUnits = Array.isArray(portfolioState['owned_units'])
    ? portfolioState['owned_units']
    : [];
  const reservedUnit =
    ownedUnits.find(
      (candidate) =>
        isRecord(candidate) && readString(candidate['reservation_id']) === reservationId,
    ) ?? readFirstRecordFromArray(ownedUnits);

  return {
    ownerAgentId: PORTFOLIO_MANAGER_ROUTE_AGENT_ID,
    targetAgentId: FIRST_MANAGED_AGENT_TYPE,
    targetAgentRouteId: FIRST_MANAGED_AGENT_ROUTE_ID,
    targetAgentKey: FIRST_MANAGED_AGENT_KEY,
    targetAgentTitle: FIRST_MANAGED_AGENT_TITLE,
    mandateRef,
    managedMandate,
    agentWallet: readHexAddress(portfolioState['agent_wallet']),
    rootUserWallet: readHexAddress(portfolioState['root_user_wallet']),
    rootedWalletContextId: readString(portfolioState['rooted_wallet_context_id']),
    reservation:
      reservationId !== null
        ? {
            reservationId,
            purpose: readString(firstReservation?.['purpose']),
            controlPath: readString(firstReservation?.['control_path']),
            rootAsset: isRecord(reservedUnit) ? readString(reservedUnit['root_asset']) : null,
            quantity: isRecord(reservedUnit) ? readString(reservedUnit['quantity']) : null,
          }
        : null,
  };
}

function readManagedMandateEditorProjection(value: unknown): ManagedMandateEditorProjection | null {
  if (!isRecord(value)) {
    return null;
  }

  const editor = isRecord(value['managedMandateEditor']) ? value['managedMandateEditor'] : null;
  if (!editor) {
    return null;
  }

  const targetAgentId = readString(editor['targetAgentId']);
  const targetAgentKey = readString(editor['targetAgentKey']);
  const mandateRef = readString(editor['mandateRef']);
  const managedMandate = readManagedMandate(editor['managedMandate']);
  if (
    targetAgentId !== FIRST_MANAGED_AGENT_TYPE ||
    targetAgentKey === null ||
    mandateRef === null ||
    managedMandate === null
  ) {
    return null;
  }

  const reservation = isRecord(editor['reservation']) ? editor['reservation'] : null;
  const reservationId = readString(reservation?.['reservationId']);

  return {
    ownerAgentId: PORTFOLIO_MANAGER_ROUTE_AGENT_ID,
    targetAgentId: FIRST_MANAGED_AGENT_TYPE,
    targetAgentRouteId: FIRST_MANAGED_AGENT_ROUTE_ID,
    targetAgentKey,
    targetAgentTitle: FIRST_MANAGED_AGENT_TITLE,
    mandateRef,
    managedMandate,
    agentWallet: readHexAddress(editor['agentWallet']),
    rootUserWallet: readHexAddress(editor['rootUserWallet']),
    rootedWalletContextId: readString(editor['rootedWalletContextId']),
    reservation:
      reservationId === null
        ? null
        : {
            reservationId,
            purpose: readString(reservation?.['purpose']),
            controlPath: readString(reservation?.['controlPath']),
            rootAsset: readString(reservation?.['rootAsset']),
            quantity: readString(reservation?.['quantity']),
          },
  };
}

function buildManagedMandateEditorProjectionFromOnboardingBootstrap(
  value: unknown,
): ManagedMandateEditorProjection | null {
  const approvedSetup = readApprovedSetupFromOnboardingBootstrap(value);
  if (!approvedSetup) {
    return null;
  }

  const firstManagedMandateSource =
    readOnboardingMandateSources(value).find(
      (mandate) => mandate.agent_id === approvedSetup.firstManagedMandate.targetAgentId,
    ) ?? null;
  if (!firstManagedMandateSource) {
    return null;
  }

  return {
    ownerAgentId: PORTFOLIO_MANAGER_ROUTE_AGENT_ID,
    targetAgentId: FIRST_MANAGED_AGENT_TYPE,
    targetAgentRouteId: FIRST_MANAGED_AGENT_ROUTE_ID,
    targetAgentKey: approvedSetup.firstManagedMandate.targetAgentKey,
    targetAgentTitle: FIRST_MANAGED_AGENT_TITLE,
    mandateRef: firstManagedMandateSource.mandate_ref,
    managedMandate: approvedSetup.firstManagedMandate.managedMandate,
    agentWallet: null,
    rootUserWallet: readOnboardingBootstrapWalletAddress(value),
    rootedWalletContextId: readOnboardingBootstrapRootedWalletContextId(value),
    reservation: null,
  };
}

function buildPortfolioManagerMandateEditorProjection(
  params: {
    rootUserWallet: `0x${string}` | null;
    lastRootedWalletContextId: string | null;
    portfolioManagerMandate: PortfolioManagerMandatePayload;
  },
): PortfolioManagerMandateEditorProjection {
  return {
    ownerAgentId: PORTFOLIO_MANAGER_ROUTE_AGENT_ID,
    targetAgentId: PORTFOLIO_MANAGER_MANDATE_ROUTE_ID,
    targetAgentRouteId: PORTFOLIO_MANAGER_MANDATE_ROUTE_ID,
    targetAgentKey: PORTFOLIO_MANAGER_MANDATE_KEY,
    targetAgentTitle: PORTFOLIO_MANAGER_MANDATE_TITLE,
    mandateRef: PORTFOLIO_MANAGER_MANDATE_REF,
    managedMandate: params.portfolioManagerMandate,
    agentWallet: params.rootUserWallet,
    rootUserWallet: params.rootUserWallet,
    rootedWalletContextId: params.lastRootedWalletContextId,
    reservation: null,
  };
}

function readPortfolioManagerMandateProjectionFromState(
  state: PortfolioManagerLifecycleState,
): PortfolioManagerMandateEditorProjection | null {
  if (!state.portfolioManagerMandate) {
    return null;
  }

  return buildPortfolioManagerMandateEditorProjection({
    rootUserWallet: readPortfolioManagerContextWalletAddress(state),
    lastRootedWalletContextId: state.lastRootedWalletContextId,
    portfolioManagerMandate: state.portfolioManagerMandate,
  });
}

function readPortfolioManagerMandateEditorProjection(
  value: unknown,
): PortfolioManagerMandateEditorProjection | null {
  if (!isRecord(value)) {
    return null;
  }

  const editor = isRecord(value['portfolioManagerMandateEditor'])
    ? value['portfolioManagerMandateEditor']
    : null;
  if (!editor) {
    return null;
  }

  const targetAgentId = readString(editor['targetAgentId']);
  const targetAgentKey = readString(editor['targetAgentKey']);
  const mandateRef = readString(editor['mandateRef']);
  const managedMandate = isRecord(editor['managedMandate']) ? editor['managedMandate'] : null;

  if (
    targetAgentId !== PORTFOLIO_MANAGER_MANDATE_ROUTE_ID ||
    targetAgentKey !== PORTFOLIO_MANAGER_MANDATE_KEY ||
    mandateRef !== PORTFOLIO_MANAGER_MANDATE_REF ||
    managedMandate === null
  ) {
    return null;
  }

  return {
    ownerAgentId: PORTFOLIO_MANAGER_ROUTE_AGENT_ID,
    targetAgentId: PORTFOLIO_MANAGER_MANDATE_ROUTE_ID,
    targetAgentRouteId: PORTFOLIO_MANAGER_MANDATE_ROUTE_ID,
    targetAgentKey,
    targetAgentTitle: PORTFOLIO_MANAGER_MANDATE_TITLE,
    mandateRef,
    managedMandate,
    agentWallet: readHexAddress(editor['agentWallet']),
    rootUserWallet: readHexAddress(editor['rootUserWallet']),
    rootedWalletContextId: readString(editor['rootedWalletContextId']),
    reservation: null,
  };
}

function parsePortfolioManagerSignedDelegations(
  input: unknown,
): PortfolioManagerSignedDelegation[] | null {
  if (typeof input !== 'object' || input === null) {
    return null;
  }

  if (!('outcome' in input) || input.outcome !== 'signed') {
    return null;
  }

  if (!('signedDelegations' in input) || !Array.isArray(input.signedDelegations)) {
    return null;
  }

  return input.signedDelegations as PortfolioManagerSignedDelegation[];
}

function parsePortfolioManagerSigningSetup(input: unknown): PortfolioManagerSetupInput | null {
  if (typeof input !== 'object' || input === null) {
    return null;
  }

  if ('portfolioManagerSetup' in input) {
    return parsePortfolioManagerSetupInput(input.portfolioManagerSetup);
  }

  return parsePortfolioManagerSetupInput(input);
}

function isPortfolioManagerSigningRejected(input: unknown): boolean {
  return (
    typeof input === 'object' &&
    input !== null &&
    'outcome' in input &&
    input.outcome === 'rejected'
  );
}

function buildPortfolioManagerUnsignedDelegation(
  walletAddress: `0x${string}`,
  controllerWalletAddress: `0x${string}`,
): PortfolioManagerUnsignedDelegation {
  return {
    delegate: controllerWalletAddress,
    delegator: walletAddress,
    authority: PORTFOLIO_MANAGER_ROOT_AUTHORITY,
    caveats: [],
    salt: PORTFOLIO_MANAGER_DELEGATION_SALT,
  };
}

function buildPortfolioManagerSigningInterrupt(
  setup: PortfolioManagerSetupInput,
  controllerWalletAddress: `0x${string}`,
) {
  return {
    type: PORTFOLIO_MANAGER_SIGNING_INTERRUPT_TYPE,
    mirroredToActivity: false,
    message: PORTFOLIO_MANAGER_SIGNING_MESSAGE,
    payload: {
      chainId: PORTFOLIO_MANAGER_CHAIN_ID,
      delegationManager: PORTFOLIO_MANAGER_DELEGATION_MANAGER,
      delegatorAddress: setup.walletAddress,
      delegateeAddress: controllerWalletAddress,
      delegationsToSign: [
        buildPortfolioManagerUnsignedDelegation(setup.walletAddress, controllerWalletAddress),
      ],
      portfolioManagerSetup: setup,
      descriptions: ['Authorize the portfolio manager to operate through your root delegation.'],
      warnings: ['Only continue if you trust this portfolio-manager session.'],
    },
  };
}

function readPrimaryManagedCollateralAsset(
  approvedSetup: PortfolioManagerApprovedSetup,
): string | null {
  return (
    approvedSetup.firstManagedMandate.managedMandate.lending_policy.collateral_policy.assets[0]
      ?.asset ?? null
  );
}

function buildPortfolioManagerOnboardingBlockedMessage(input: {
  approvedSetup: PortfolioManagerApprovedSetup;
  onboardingDetails: ReturnType<typeof buildPortfolioManagerWalletAccountingDetails>;
}): string {
  const targetAsset = readPrimaryManagedCollateralAsset(input.approvedSetup);
  const accountedAssets = [...new Set(input.onboardingDetails.assets.map((asset) => asset.asset))];
  const proofs = input.onboardingDetails.onboarding.proofs;
  const initialSubagentDelegationIssued =
    proofs.initial_subagent_delegation_issued ?? proofs.agent_active;

  if (!proofs.capital_reserved_for_agent) {
    if (targetAsset && !accountedAssets.includes(targetAsset)) {
      const walletAssetSummary =
        accountedAssets.length > 0
          ? ` Wallet accounting currently shows ${accountedAssets.join(', ')}.`
          : ' Wallet accounting does not yet show any admitted idle assets.';

      return `Portfolio manager onboarding is not complete because Shared Ember could not admit any ${targetAsset} for lending.${walletAssetSummary} Deposit or wrap ${targetAsset} in the wallet, then retry onboarding.`;
    }

    return 'Portfolio manager onboarding is not complete because Shared Ember has not reserved capital for the lending lane yet.';
  }

  if (!proofs.policy_snapshot_recorded) {
    return 'Portfolio manager onboarding is not complete because Shared Ember has not recorded a lending policy snapshot yet.';
  }

  if (!initialSubagentDelegationIssued) {
    return 'Portfolio manager onboarding is not complete because Shared Ember has not issued the initial lending delegation yet.';
  }

  const missingProofs = [
    proofs.capital_reserved_for_agent ? null : 'capital_reserved_for_agent',
    proofs.policy_snapshot_recorded ? null : 'policy_snapshot_recorded',
    initialSubagentDelegationIssued ? null : 'initial_subagent_delegation_issued',
  ].filter((proof): proof is string => proof !== null);

  return `Portfolio manager onboarding is not complete. Shared Ember onboarding phase is ${input.onboardingDetails.onboarding.phase}.${missingProofs.length > 0 ? ` Missing proofs: ${missingProofs.join(', ')}.` : ''}`;
}

function buildManagedReservePolicySummary(input: { managedMandate: ManagedMandate }): string {
  const primaryCollateralAsset =
    input.managedMandate.lending_policy.collateral_policy.assets[0]?.asset ?? 'capital';

  return `allow managed lending to admit allocable idle ${primaryCollateralAsset}`;
}

function appendStructuredXmlNode(input: {
  lines: string[];
  indent: string;
  tag: string;
  value: unknown;
}): void {
  if (input.value === null || input.value === undefined) {
    return;
  }

  if (Array.isArray(input.value)) {
    if (input.value.length === 0) {
      return;
    }

    input.lines.push(`${input.indent}<${input.tag}>`);
    for (const entry of input.value) {
      appendStructuredXmlNode({
        lines: input.lines,
        indent: `${input.indent}  `,
        tag: 'item',
        value: entry,
      });
    }
    input.lines.push(`${input.indent}</${input.tag}>`);
    return;
  }

  if (isRecord(input.value)) {
    const entries = Object.entries(input.value).filter(
      ([, nestedValue]) => nestedValue !== null && nestedValue !== undefined,
    );
    if (entries.length === 0) {
      return;
    }

    input.lines.push(`${input.indent}<${input.tag}>`);
    for (const [key, nestedValue] of entries) {
      appendStructuredXmlNode({
        lines: input.lines,
        indent: `${input.indent}  `,
        tag: key,
        value: nestedValue,
      });
    }
    input.lines.push(`${input.indent}</${input.tag}>`);
    return;
  }

  if (
    typeof input.value === 'string' ||
    typeof input.value === 'number' ||
    typeof input.value === 'boolean' ||
    typeof input.value === 'bigint'
  ) {
    input.lines.push(
      `${input.indent}<${input.tag}>${escapeXml(String(input.value))}</${input.tag}>`,
    );
  }
}

function buildPortfolioManagerOnboardingBootstrap(params: {
  agentId: string;
  threadId: string;
  walletAddress: `0x${string}`;
  approvedSetup: PortfolioManagerApprovedSetup;
}) {
  const identity = sanitizeIdentitySegment(`${params.threadId}-${params.walletAddress}`);
  const userId = `user-${identity}`;
  const rootedWalletContextId = `rwc-${identity}`;
  const portfolioMandateRef = `mandate-portfolio-${identity}`;
  const firstManagedMandate = params.approvedSetup.firstManagedMandate;
  const managedAgentKeySegment = sanitizeIdentitySegment(firstManagedMandate.targetAgentKey);
  const managedAgentMandateRef = `mandate-${managedAgentKeySegment}-${identity}`;
  const primaryCollateralAsset =
    firstManagedMandate.managedMandate.lending_policy.collateral_policy.assets[0]?.asset;
  if (!primaryCollateralAsset) {
    throw new Error('Managed lending policy requires at least one collateral asset.');
  }
  const reservePolicySummary = buildManagedReservePolicySummary({
    managedMandate: firstManagedMandate.managedMandate,
  });

  return {
    occurredAt: PORTFOLIO_MANAGER_BOOTSTRAP_TIMESTAMP,
    rootedWalletContext: {
      rooted_wallet_context_id: rootedWalletContextId,
      user_id: userId,
      wallet_address: params.walletAddress,
      network: PORTFOLIO_MANAGER_NETWORK,
      registered_at: PORTFOLIO_MANAGER_BOOTSTRAP_TIMESTAMP,
      metadata: {
        source: PORTFOLIO_MANAGER_PROTOCOL_SOURCE,
        approvedOnboardingSetup: params.approvedSetup,
      },
    },
    mandates: [
      {
        mandate_ref: portfolioMandateRef,
        agent_id: params.agentId,
        managed_mandate: null,
      },
      {
        mandate_ref: managedAgentMandateRef,
        agent_id: firstManagedMandate.targetAgentId,
        managed_mandate: firstManagedMandate.managedMandate,
      },
    ],
    userReservePolicies: [
      {
        reserve_policy_ref: `reserve-policy-${managedAgentKeySegment}-${identity}`,
        summary: reservePolicySummary,
        user_reserve_rules: [
          {
            root_asset: primaryCollateralAsset,
            network: PORTFOLIO_MANAGER_NETWORK,
            benchmark_asset: FIRST_MANAGED_AGENT_BENCHMARK_ASSET,
            reserved_quantity: '0.01',
            reason: reservePolicySummary,
          },
        ],
      },
    ],
    activation: {
      mandateRef: managedAgentMandateRef,
    },
  };
}

function buildPortfolioManagerRootDelegationHandoff(params: {
  threadId: string;
  walletAddress: `0x${string}`;
  signedDelegation: PortfolioManagerSignedDelegation;
}) {
  const identity = sanitizeIdentitySegment(`${params.threadId}-${params.walletAddress}`);

  return {
    handoff_id: `handoff-${identity}`,
    root_delegation_id: `root-delegation-${identity}`,
    user_id: `user-${identity}`,
    user_wallet: params.walletAddress,
    orchestrator_wallet: params.signedDelegation.delegate,
    network: PORTFOLIO_MANAGER_NETWORK,
    artifact_ref: encodeDelegationArtifactRef(params.signedDelegation),
    issued_at: PORTFOLIO_MANAGER_BOOTSTRAP_TIMESTAMP,
    activated_at: PORTFOLIO_MANAGER_BOOTSTRAP_TIMESTAMP,
    signer_kind: 'delegation_toolkit',
    metadata: {
      delegation_manager: PORTFOLIO_MANAGER_DELEGATION_MANAGER,
      signed_delegation_count: 1,
    },
  };
}

function buildRootDelegationIdempotencyKey(params: { threadId: string; handoff: unknown }): string {
  return buildPayloadDerivedIdempotencyKey({
    prefix: 'idem-root-delegation',
    payload: {
      threadId: params.threadId,
      handoff: params.handoff,
    },
  });
}

function buildRootedBootstrapIdempotencyKey(params: {
  threadId: string;
  onboarding: unknown;
  handoff: unknown;
}): string {
  return buildPayloadDerivedIdempotencyKey({
    prefix: 'idem-portfolio-manager-rooted-bootstrap',
    payload: {
      threadId: params.threadId,
      onboarding: params.onboarding,
      handoff: params.handoff,
    },
  });
}

function buildManagedMandateUpdateIdempotencyKey(params: {
  threadId: string;
  input: ManagedMandateUpdateInput;
}): string {
  return buildPayloadDerivedIdempotencyKey({
    prefix: 'idem-update-managed-mandate',
    payload: {
      threadId: params.threadId,
      input: params.input,
    },
  });
}

export function createPortfolioManagerDomain(
  options: CreatePortfolioManagerDomainOptions = {},
): AgentRuntimeDomainConfig<PortfolioManagerLifecycleState> {
  const agentId = options.agentId ?? PORTFOLIO_MANAGER_SHARED_EMBER_AGENT_ID;
  const controllerWalletAddress = options.controllerWalletAddress ?? null;
  const controllerSignerAddress = options.controllerSignerAddress ?? null;

  return {
    lifecycle: {
      initialPhase: 'prehire',
      phases: ['prehire', 'onboarding', 'active'],
      terminalPhases: [],
      commands: [
        {
          name: 'hire',
          description:
            'Start onboarding for the portfolio manager and request the connected wallet.',
        },
        {
          name: 'fire',
          description:
            'Return the portfolio manager to a rehirable prehire state and mark the current task complete.',
        },
        {
          name: 'register_root_delegation_from_user_signing',
          description:
            'Register the rooted-wallet signing handoff with the Shared Ember orchestrator.',
        },
        {
          name: 'refresh_portfolio_state',
          description:
            'Read the current Shared Ember portfolio state for the portfolio-manager subagent.',
        },
        {
          name: 'update_managed_mandate',
          description:
            'Update the active managed lending mandate through the PM-owned Shared Ember control-plane path.',
        },
        {
          name: 'refresh_redelegation_work',
          description:
            'Read committed redelegation work from the Shared Ember outbox for the portfolio-manager orchestrator.',
        },
        {
          name: PORTFOLIO_MANAGER_SPOT_SWAP_COMMAND,
          description: PORTFOLIO_MANAGER_SPOT_SWAP_COMMAND_DESCRIPTION,
        },
        {
          name: PORTFOLIO_MANAGER_CONFIRM_SPOT_SWAP_COMMAND,
          description: PORTFOLIO_MANAGER_CONFIRM_SPOT_SWAP_COMMAND_DESCRIPTION,
        },
        {
          name: 'complete_rooted_bootstrap_from_user_signing',
          description:
            'Complete the rooted bootstrap in one Shared Ember command using onboarding data and the signing handoff.',
        },
      ],
      transitions: [],
      interrupts: [
        {
          type: PORTFOLIO_MANAGER_SETUP_INTERRUPT_TYPE,
          description: 'Collect the connected wallet before rooted delegation signing.',
          mirroredToActivity: false,
        },
        {
          type: 'portfolio-manager-delegation-signing-request',
          description:
            'Request delegation signatures needed to complete portfolio-manager onboarding.',
          mirroredToActivity: false,
        },
        {
          type: PORTFOLIO_MANAGER_SWAP_CONFLICT_INTERRUPT_TYPE,
          description: PORTFOLIO_MANAGER_SWAP_CONFLICT_INTERRUPT_DESCRIPTION,
          mirroredToActivity: false,
        },
      ],
    },
    systemContext: async ({ state, currentProjection }) => {
      const currentState = state ?? buildDefaultLifecycleState();
      const context = ['<portfolio_manager_context>'];
      const protocolHost = options.protocolHost;
      const projectedManagedMandateProjection =
        readManagedMandateEditorProjection(currentProjection);
      const activeManagedSnapshot =
        currentState.phase === 'active' && protocolHost
          ? await readManagedPortfolioStateSnapshot({
              protocolHost,
              threadId: 'system-context',
              currentState,
            })
          : null;
      const liveManagedMandateProjection = activeManagedSnapshot?.managedMandateProjection ?? null;
      const visibleManagedMandateProjection =
        liveManagedMandateProjection ??
        (currentState.phase === 'active' ? projectedManagedMandateProjection : null);
      const visiblePortfolioManagerMandateProjection =
        readPortfolioManagerMandateProjectionFromState(currentState) ??
        readPortfolioManagerMandateEditorProjection(currentProjection);

      context.push(`  <lifecycle_phase>${currentState.phase}</lifecycle_phase>`);

      if (currentState.lastSharedEmberRevision !== null) {
        context.push(
          `  <shared_ember_revision>${currentState.lastSharedEmberRevision}</shared_ember_revision>`,
        );
      }

      if (currentState.lastRootDelegation) {
        context.push('  <root_delegation_registered>true</root_delegation_registered>');
      }

      if (currentState.lastOnboardingBootstrap) {
        context.push('  <onboarding_bootstrap_completed>true</onboarding_bootstrap_completed>');
      }

      const rootedWalletAddress =
        currentState.phase === 'active'
          ? (visibleManagedMandateProjection?.rootUserWallet ?? currentState.activeWalletAddress)
          : readOnboardingBootstrapWalletAddress(currentState.lastOnboardingBootstrap);
      if (rootedWalletAddress) {
        context.push(
          `  <user_portfolio_wallet_address source="rooted_wallet_context">${rootedWalletAddress}</user_portfolio_wallet_address>`,
        );
      }

      if (currentState.lastRootedWalletContextId) {
        context.push(
          `  <rooted_wallet_context_id>${currentState.lastRootedWalletContextId}</rooted_wallet_context_id>`,
        );
      }

      if (currentState.activeWalletAddress) {
        context.push(
          `  <active_portfolio_wallet_address>${currentState.activeWalletAddress}</active_portfolio_wallet_address>`,
        );
      }

      if (currentState.pendingOnboardingWalletAddress) {
        context.push(
          `  <pending_onboarding_wallet_address source="onboarding_setup">${currentState.pendingOnboardingWalletAddress}</pending_onboarding_wallet_address>`,
        );
      }

      if (currentState.pendingSpotSwapConflict) {
        context.push('  <pending_spot_swap_conflict>');
        context.push(
          `    <confirmation_operation>${PORTFOLIO_MANAGER_SWAP_CONFLICT_INTERRUPT_TYPE}</confirmation_operation>`,
        );
        context.push(
          `    <tool_command>${PORTFOLIO_MANAGER_CONFIRM_SPOT_SWAP_COMMAND}</tool_command>`,
        );
        context.push(
          '    <affirmative_user_reply_outcome>allow_reserved_for_other_agent</affirmative_user_reply_outcome>',
        );
        context.push(
          '    <unassigned_only_user_reply_outcome>unassigned_only</unassigned_only_user_reply_outcome>',
        );
        context.push('    <cancel_user_reply_outcome>cancel</cancel_user_reply_outcome>');
        context.push(
          `    <instruction>Do not call dispatch_spot_swap again for yes/confirm/proceed replies. Use ${PORTFOLIO_MANAGER_CONFIRM_SPOT_SWAP_COMMAND} with outcome allow_reserved_for_other_agent.</instruction>`,
        );
        context.push(
          '    <instruction>If the reserved-capital confirmation fails, report the exact failure and wait. Do not retry unassigned_only unless the user explicitly asks for unassigned-only execution.</instruction>',
        );
        appendStructuredXmlNode({
          lines: context,
          indent: '    ',
          tag: 'dispatch',
          value: currentState.pendingSpotSwapConflict.dispatch,
        });
        appendStructuredXmlNode({
          lines: context,
          indent: '    ',
          tag: 'conflict',
          value: currentState.pendingSpotSwapConflict.conflict,
        });
        context.push('  </pending_spot_swap_conflict>');
      }

      const approvedSetup = readApprovedSetupFromOnboardingBootstrap(
        currentState.lastOnboardingBootstrap,
      );
      const mandateSources = approvedSetup ? readOnboardingMandateSources(currentState.lastOnboardingBootstrap) : [];
      const firstManagedMandateSource =
        currentState.phase !== 'active'
          ? mandateSources.find(
              (mandate) => mandate.agent_id === approvedSetup?.firstManagedMandate.targetAgentId,
            ) ?? null
          : null;

      if (
        visibleManagedMandateProjection ||
        (currentState.phase !== 'active' && firstManagedMandateSource) ||
        visiblePortfolioManagerMandateProjection
      ) {
        context.push('  <managed_agent_mandates>');
        if (visibleManagedMandateProjection) {
          const managedMandate = visibleManagedMandateProjection.managedMandate;
          context.push(
            `    <managed_agent agent_key="${escapeXml(
              visibleManagedMandateProjection.targetAgentKey,
            )}" agent_type="${escapeXml(
              visibleManagedMandateProjection.targetAgentId,
            )}" approved="true" mandate_ref="${escapeXml(visibleManagedMandateProjection.mandateRef)}">`,
          );
          appendStructuredXmlNode({
            lines: context,
            indent: '      ',
            tag: 'managed_mandate',
            value: managedMandate,
          });
          context.push('    </managed_agent>');
        }
        if (
          currentState.phase !== 'active' &&
          firstManagedMandateSource &&
          firstManagedMandateSource.agent_id !== visibleManagedMandateProjection?.targetAgentId
        ) {
          const firstManagedMandate = approvedSetup?.firstManagedMandate;
          if (firstManagedMandate) {
            const managedMandate = firstManagedMandate.managedMandate;
            context.push(
              `    <managed_agent agent_key="${escapeXml(
                firstManagedMandate.targetAgentKey,
              )}" agent_type="${escapeXml(
                firstManagedMandate.targetAgentId,
              )}" approved="true" mandate_ref="${escapeXml(firstManagedMandateSource.mandate_ref)}">`,
            );
            appendStructuredXmlNode({
              lines: context,
              indent: '      ',
              tag: 'managed_mandate',
              value: managedMandate,
            });
            context.push('    </managed_agent>');
          }
        }
        if (visiblePortfolioManagerMandateProjection) {
          context.push(
            `    <managed_agent agent_key="${escapeXml(
              visiblePortfolioManagerMandateProjection.targetAgentKey,
            )}" agent_type="${escapeXml(
              visiblePortfolioManagerMandateProjection.targetAgentId,
            )}" approved="true" mandate_ref="${escapeXml(
              visiblePortfolioManagerMandateProjection.mandateRef,
            )}">`,
          );
          appendStructuredXmlNode({
            lines: context,
            indent: '      ',
            tag: 'managed_mandate',
            value: visiblePortfolioManagerMandateProjection.managedMandate,
          });
          context.push('    </managed_agent>');
        }
        context.push('  </managed_agent_mandates>');
      }

      context.push('</portfolio_manager_context>');

      const walletAddress =
        currentState.phase === 'active'
          ? (activeManagedSnapshot?.managedWalletAddress ??
            visibleManagedMandateProjection?.rootUserWallet ??
            currentState.activeWalletAddress)
          : readPortfolioManagerContextWalletAddress(currentState);
      if (walletAddress && protocolHost) {
        try {
          const aggregatedAccountingDetails =
            currentState.phase === 'active'
              ? buildAggregatedPortfolioManagerWalletAccountingDetails({
                  accountingStateReads: activeManagedSnapshot?.accountingStateReads ?? [],
                })
              : null;
          context.push(
            ...buildSharedEmberAccountingContextXml({
              status: 'live',
              details:
                aggregatedAccountingDetails ??
                buildPortfolioManagerWalletAccountingDetails(
                  await (async () => {
                    const accountingAgentId = resolvePortfolioManagerAccountingAgentId(
                      currentState.lastOnboardingBootstrap,
                    );
                    return readManagedAgentAccountingState({
                      protocolHost,
                      agentId: accountingAgentId,
                      walletAddress,
                    });
                  })(),
                ),
            }),
          );
        } catch (error) {
          context.push(
            ...buildSharedEmberAccountingContextXml({
              status: 'unavailable',
              walletAddress,
              error: error instanceof Error ? error.message : 'Unknown Shared Ember read failure.',
            }),
          );
        }
      }

      return context;
    },
    handleOperation: async ({ operation, state, threadId }) => {
      const currentState = state ?? buildDefaultLifecycleState();

      switch (operation.name) {
        case 'hire': {
          const nextState: PortfolioManagerLifecycleState = {
            ...currentState,
            phase: 'onboarding',
          };

          return {
            state: nextState,
            outputs: {
              status: {
                executionStatus: 'interrupted',
                statusMessage: PORTFOLIO_MANAGER_SETUP_MESSAGE,
              },
              interrupt: {
                type: PORTFOLIO_MANAGER_SETUP_INTERRUPT_TYPE,
                mirroredToActivity: false,
                message: PORTFOLIO_MANAGER_SETUP_MESSAGE,
              },
            },
          };
        }
        case 'fire': {
          const nextState: PortfolioManagerLifecycleState = {
            ...currentState,
            phase: 'prehire',
            lastRootDelegation: null,
            lastOnboardingBootstrap: null,
            lastRootedWalletContextId: null,
            activeWalletAddress: null,
            pendingOnboardingWalletAddress: null,
            pendingApprovedSetup: null,
            pendingSpotSwapConflict: null,
            portfolioManagerMandate: null,
          };

          return {
            state: nextState,
            outputs: {
              status: {
                executionStatus: 'completed',
                statusMessage: 'Portfolio manager fired. Ready to hire again.',
              },
            },
          };
        }
        case PORTFOLIO_MANAGER_SETUP_INTERRUPT_TYPE: {
          const setupInput = parsePortfolioManagerSetupInput(operation.input);
          if (!setupInput) {
            return {
              state: currentState,
              outputs: {
                status: {
                  executionStatus: 'failed',
                  statusMessage: 'Portfolio manager setup input is incomplete.',
                },
              },
            };
          }

          if (!controllerWalletAddress) {
            return {
              state: currentState,
              outputs: {
                status: {
                  executionStatus: 'failed',
                  statusMessage:
                    'Portfolio manager onboarding is blocked because the controller smart-account address is not configured.',
                },
              },
            };
          }

          const nextState: PortfolioManagerLifecycleState = {
            ...currentState,
            phase: 'onboarding',
            activeWalletAddress: setupInput.walletAddress,
            pendingOnboardingWalletAddress: setupInput.walletAddress,
            portfolioManagerMandate: setupInput.portfolioManagerMandate ?? null,
            pendingApprovedSetup: {
              portfolioMandate: setupInput.portfolioMandate,
              firstManagedMandate: setupInput.firstManagedMandate,
              portfolioManagerMandate: setupInput.portfolioManagerMandate ?? null,
            },
          };

          return {
            state: nextState,
            outputs: {
              status: {
                executionStatus: 'interrupted',
                statusMessage: PORTFOLIO_MANAGER_SIGNING_MESSAGE,
              },
              interrupt: buildPortfolioManagerSigningInterrupt(setupInput, controllerWalletAddress),
            },
          };
        }
        case PORTFOLIO_MANAGER_SIGNING_INTERRUPT_TYPE: {
          if (isPortfolioManagerSigningRejected(operation.input)) {
            return {
              state: {
                ...currentState,
                phase: 'prehire',
                activeWalletAddress: null,
                pendingOnboardingWalletAddress: null,
                pendingApprovedSetup: null,
              },
              outputs: {
                status: {
                  executionStatus: 'canceled',
                  statusMessage:
                    'Portfolio manager onboarding was canceled because delegation signing was rejected.',
                },
              },
            };
          }

          const signingSetup = parsePortfolioManagerSigningSetup(operation.input);
          const walletAddress =
            currentState.pendingOnboardingWalletAddress ?? signingSetup?.walletAddress ?? null;
          const approvedSetup =
            currentState.pendingApprovedSetup ??
            (signingSetup
              ? {
                  portfolioMandate: signingSetup.portfolioMandate,
                  firstManagedMandate: signingSetup.firstManagedMandate,
                  portfolioManagerMandate: signingSetup.portfolioManagerMandate ?? null,
                }
              : null);
          const signedDelegations = parsePortfolioManagerSignedDelegations(operation.input);
          const signedDelegation = signedDelegations?.[0];
          tracePmSigning('received-signing-resume', {
            threadId,
            walletAddress,
            recoveredApprovedSetupFromResume: currentState.pendingApprovedSetup ? false : Boolean(signingSetup),
            signedDelegationCount: signedDelegations?.length ?? 0,
          });

          if (!walletAddress || !approvedSetup || !signedDelegation) {
            return {
              state: currentState,
              outputs: {
                status: {
                  executionStatus: 'failed',
                  statusMessage:
                    'Portfolio manager signing input is incomplete. Restart onboarding and try again.',
                },
              },
            };
          }

          if (!options.protocolHost) {
            return {
              state: currentState,
              outputs: {
                status: {
                  executionStatus: 'failed',
                  statusMessage: 'Shared Ember Domain Service host is not configured.',
                },
              },
            };
          }

          if (!controllerWalletAddress) {
            return {
              state: currentState,
              outputs: {
                status: {
                  executionStatus: 'failed',
                  statusMessage:
                    'Portfolio manager onboarding is blocked because the controller smart-account address is not configured.',
                },
              },
            };
          }

          tracePmSigning('reading-orchestrator-identity', {
            threadId,
            agentId,
            controllerWalletAddress,
          });
          const orchestratorIdentity = await readSharedEmberAgentServiceIdentity({
            protocolHost: options.protocolHost,
            agentId,
            role: 'orchestrator',
          });
          tracePmSigning('read-orchestrator-identity', {
            hasIdentity: orchestratorIdentity.identity !== null,
            walletAddress: orchestratorIdentity.identity?.wallet_address ?? null,
          });
          if (!orchestratorIdentity.identity) {
            return {
              state: currentState,
              outputs: {
                status: {
                  executionStatus: 'failed',
                  statusMessage:
                    'Portfolio manager onboarding is blocked until the portfolio-manager service registers its orchestrator identity in Shared Ember.',
                },
              },
            };
          }

          if (orchestratorIdentity.identity.wallet_address !== controllerWalletAddress) {
            return {
              state: currentState,
              outputs: {
                status: {
                  executionStatus: 'failed',
                  statusMessage:
                    'Portfolio manager onboarding is blocked because the registered portfolio-manager orchestrator wallet does not match this session controller wallet.',
                },
              },
            };
          }

          tracePmSigning('reading-managed-subagent-identity', {
            managedAgentId: FIRST_MANAGED_AGENT_TYPE,
          });
          const managedSubagentIdentity = await readSharedEmberAgentServiceIdentity({
            protocolHost: options.protocolHost,
            agentId: FIRST_MANAGED_AGENT_TYPE,
            role: 'subagent',
          });
          tracePmSigning('read-managed-subagent-identity', {
            hasIdentity: managedSubagentIdentity.identity !== null,
            walletAddress: managedSubagentIdentity.identity?.wallet_address ?? null,
          });
          if (!managedSubagentIdentity.identity) {
            return {
              state: currentState,
              outputs: {
                status: {
                  executionStatus: 'failed',
                  statusMessage:
                    'Portfolio manager onboarding is blocked until the ember-lending service registers its subagent identity in Shared Ember.',
                },
              },
            };
          }

          const onboarding = buildPortfolioManagerOnboardingBootstrap({
            agentId,
            threadId,
            walletAddress,
            approvedSetup,
          });
          const handoff = buildPortfolioManagerRootDelegationHandoff({
            threadId,
            walletAddress,
            signedDelegation,
          });
          tracePmSigning('running-rooted-bootstrap', {
            threadId,
            walletAddress,
            handoffId: handoff.handoff_id,
          });
          const response = await runSharedEmberCommandWithResolvedRevision<{
            result?: {
              revision?: number;
              committed_event_ids?: string[];
              rooted_wallet_context_id?: string;
              root_delegation?: unknown;
            };
          }>({
            protocolHost: options.protocolHost,
            threadId,
            agentId,
            currentRevision: currentState.lastSharedEmberRevision,
            buildRequest: (expectedRevision) => ({
              jsonrpc: '2.0',
              id: `shared-ember-${threadId}-complete-rooted-bootstrap`,
              method: 'orchestrator.completeRootedBootstrapFromUserSigning.v1',
              params: {
                idempotency_key: buildRootedBootstrapIdempotencyKey({
                  threadId,
                  onboarding,
                  handoff,
                }),
                expected_revision: expectedRevision,
                onboarding,
                handoff,
              },
            }),
          });
          tracePmSigning('ran-rooted-bootstrap', {
            revision: response.result?.revision ?? null,
            rootedWalletContextId: response.result?.rooted_wallet_context_id ?? null,
          });
          tracePmSigning('reading-managed-subagent-wallet', {
            managedAgentId: FIRST_MANAGED_AGENT_TYPE,
          });
          const managedSubagentExecutionContext = await readSharedEmberSubagentWalletAddress({
            protocolHost: options.protocolHost,
            agentId: FIRST_MANAGED_AGENT_TYPE,
          });
          tracePmSigning('read-managed-subagent-wallet', {
            revision: managedSubagentExecutionContext.revision ?? null,
            walletAddress: managedSubagentExecutionContext.walletAddress,
          });
          tracePmSigning('reading-onboarding-state', {
            walletAddress,
          });
          const { revision: onboardingRevision, onboardingState } =
            await readManagedAgentAccountingState({
              protocolHost: options.protocolHost,
              agentId: resolvePortfolioManagerAccountingAgentId(onboarding),
              walletAddress,
            });
          tracePmSigning('read-onboarding-state', {
            revision: onboardingRevision ?? null,
            phase:
              isRecord(onboardingState) && typeof onboardingState['phase'] === 'string'
                ? onboardingState['phase']
                : null,
          });
          const onboardingDetails = buildPortfolioManagerWalletAccountingDetails({
            revision: onboardingRevision,
            onboardingState,
          });
          const nextRevision =
            onboardingRevision ??
            managedSubagentExecutionContext.revision ??
            response.result?.revision ??
            null;

          if (!managedSubagentExecutionContext.walletAddress) {
            const nextState: PortfolioManagerLifecycleState = {
              phase: 'onboarding',
              lastPortfolioState: currentState.lastPortfolioState,
              lastSharedEmberRevision: nextRevision,
              lastRootDelegation:
                response.result?.root_delegation ?? currentState.lastRootDelegation,
              lastOnboardingBootstrap: onboarding,
              lastRootedWalletContextId: response.result?.rooted_wallet_context_id ?? null,
              activeWalletAddress: walletAddress,
              pendingOnboardingWalletAddress: walletAddress,
              pendingApprovedSetup: approvedSetup,
            };

            return {
              state: nextState,
              outputs: {
                status: {
                  executionStatus: 'failed',
                  statusMessage:
                    'Portfolio manager onboarding is blocked because ember-lending did not expose a non-null subagent wallet in Shared Ember execution context after rooted bootstrap.',
                },
                artifacts: [
                  {
                    data: {
                      type: 'shared-ember-rooted-bootstrap',
                      revision: nextState.lastSharedEmberRevision,
                      committedEventIds: response.result?.committed_event_ids ?? [],
                      rootedWalletContextId: nextState.lastRootedWalletContextId,
                      rootDelegation: nextState.lastRootDelegation,
                    },
                  },
                ],
              },
            };
          }

          if (!onboardingState.proofs.agent_active) {
            const nextState: PortfolioManagerLifecycleState = {
              phase: 'onboarding',
              lastPortfolioState: currentState.lastPortfolioState,
              lastSharedEmberRevision: nextRevision,
              lastRootDelegation:
                response.result?.root_delegation ?? currentState.lastRootDelegation,
              lastOnboardingBootstrap: onboarding,
              lastRootedWalletContextId: response.result?.rooted_wallet_context_id ?? null,
              activeWalletAddress: walletAddress,
              pendingOnboardingWalletAddress: walletAddress,
              pendingApprovedSetup: approvedSetup,
            };

            return {
              state: nextState,
              outputs: {
                status: {
                  executionStatus: 'failed',
                  statusMessage: buildPortfolioManagerOnboardingBlockedMessage({
                    approvedSetup,
                    onboardingDetails,
                  }),
                },
                artifacts: [
                  {
                    data: {
                      type: 'shared-ember-rooted-bootstrap',
                      revision: nextState.lastSharedEmberRevision,
                      committedEventIds: response.result?.committed_event_ids ?? [],
                      rootedWalletContextId: nextState.lastRootedWalletContextId,
                      rootDelegation: nextState.lastRootDelegation,
                    },
                  },
                ],
              },
            };
          }

          const nextState: PortfolioManagerLifecycleState = {
            phase: 'active',
            lastPortfolioState: currentState.lastPortfolioState,
            lastSharedEmberRevision: nextRevision,
            lastRootDelegation: response.result?.root_delegation ?? currentState.lastRootDelegation,
            lastOnboardingBootstrap: onboarding,
            lastRootedWalletContextId: response.result?.rooted_wallet_context_id ?? null,
            activeWalletAddress: walletAddress,
            pendingOnboardingWalletAddress: null,
            pendingApprovedSetup: null,
            portfolioManagerMandate:
              approvedSetup.portfolioManagerMandate ?? currentState.portfolioManagerMandate ?? null,
          };
          const onboardingManagedMandateProjection =
            buildManagedMandateEditorProjectionFromOnboardingBootstrap(onboarding);
          const onboardingPortfolioManagerMandateProjection =
            approvedSetup.portfolioManagerMandate
              ? buildPortfolioManagerMandateEditorProjection({
                  rootUserWallet: readPortfolioManagerContextWalletAddress(nextState),
                  lastRootedWalletContextId: nextState.lastRootedWalletContextId,
                  portfolioManagerMandate: approvedSetup.portfolioManagerMandate,
                })
              : null;

          return {
            state: nextState,
            ...(onboardingManagedMandateProjection || onboardingPortfolioManagerMandateProjection
              ? {
                  domainProjectionUpdate: {
                    ...(onboardingManagedMandateProjection
                      ? { managedMandateEditor: onboardingManagedMandateProjection }
                      : {}),
                    ...(onboardingPortfolioManagerMandateProjection
                      ? { portfolioManagerMandateEditor: onboardingPortfolioManagerMandateProjection }
                      : {}),
                  },
                }
              : {}),
            outputs: {
              status: {
                executionStatus: 'completed',
                statusMessage: 'Portfolio manager onboarding complete. Agent is active.',
              },
              artifacts: [
                {
                  data: {
                    type: 'shared-ember-rooted-bootstrap',
                    revision: nextState.lastSharedEmberRevision,
                    committedEventIds: response.result?.committed_event_ids ?? [],
                    rootedWalletContextId: nextState.lastRootedWalletContextId,
                    rootDelegation: nextState.lastRootDelegation,
                  },
                },
              ],
            },
          };
        }
        case 'register_root_delegation_from_user_signing': {
          if (!options.protocolHost) {
            return {
              state: currentState,
              outputs: {
                status: {
                  executionStatus: 'failed',
                  statusMessage: 'Shared Ember Domain Service host is not configured.',
                },
              },
            };
          }
          const commandInput =
            typeof operation.input === 'object' && operation.input !== null ? operation.input : {};
          const handoff = 'handoff' in commandInput ? commandInput.handoff : undefined;
          const idempotencyKey =
            'idempotencyKey' in commandInput && typeof commandInput.idempotencyKey === 'string'
              ? commandInput.idempotencyKey
              : buildRootDelegationIdempotencyKey({
                  threadId,
                  handoff,
                });
          const response = await runSharedEmberCommandWithResolvedRevision<{
            result?: {
              revision?: number;
              committed_event_ids?: string[];
              root_delegation?: unknown;
            };
          }>({
            protocolHost: options.protocolHost,
            threadId,
            agentId,
            currentRevision: currentState.lastSharedEmberRevision,
            buildRequest: (expectedRevision) => ({
              jsonrpc: '2.0',
              id: `shared-ember-${threadId}-register-root-delegation`,
              method: 'orchestrator.registerRootDelegationFromUserSigning.v1',
              params: {
                idempotency_key: idempotencyKey,
                expected_revision: expectedRevision,
                handoff,
              },
            }),
          });

          const nextState: PortfolioManagerLifecycleState = {
            phase: 'onboarding',
            lastPortfolioState: currentState.lastPortfolioState,
            lastSharedEmberRevision: response.result?.revision ?? null,
            lastRootDelegation: response.result?.root_delegation ?? null,
            lastOnboardingBootstrap: currentState.lastOnboardingBootstrap,
            lastRootedWalletContextId: currentState.lastRootedWalletContextId,
            activeWalletAddress: currentState.activeWalletAddress,
            pendingOnboardingWalletAddress: currentState.pendingOnboardingWalletAddress,
            pendingApprovedSetup: currentState.pendingApprovedSetup ?? null,
          };

          return {
            state: nextState,
            outputs: {
              status: {
                executionStatus: 'completed',
                statusMessage: 'Root delegation registered with Shared Ember Domain Service.',
              },
              artifacts: [
                {
                  data: {
                    type: 'shared-ember-root-delegation',
                    revision: nextState.lastSharedEmberRevision,
                    committedEventIds: response.result?.committed_event_ids ?? [],
                    rootDelegation: nextState.lastRootDelegation,
                  },
                },
              ],
            },
          };
        }
        case 'refresh_portfolio_state': {
          if (!options.protocolHost) {
            return {
              state: currentState,
              outputs: {
                status: {
                  executionStatus: 'failed',
                  statusMessage: 'Shared Ember Domain Service host is not configured.',
                },
              },
            };
          }
          const portfolioStateRead = await readSharedEmberPortfolioState({
            protocolHost: options.protocolHost,
            threadId,
            agentId,
          });
          const managedSnapshot = await readManagedPortfolioStateSnapshot({
            protocolHost: options.protocolHost,
            threadId,
            currentState,
          });
          const managedMandateProjection = managedSnapshot.managedMandateProjection;
          const portfolioProjectionInput = managedSnapshot.portfolioProjectionInput;
          const portfolioManagerMandateProjection = readPortfolioManagerMandateProjectionFromState(
            currentState,
          );
          const nextPhase = managedMandateProjection ? 'active' : currentState.phase;
          const nextRevision =
            managedMandateProjection === null && managedSnapshot.accountingStateReads.length === 0
              ? portfolioStateRead.revision
              : Math.max(portfolioStateRead.revision ?? 0, managedSnapshot.revision ?? 0);

          const nextState: PortfolioManagerLifecycleState = {
            phase: nextPhase,
            lastPortfolioState: portfolioStateRead.portfolioState,
            lastSharedEmberRevision: nextRevision,
            lastRootDelegation: currentState.lastRootDelegation,
            lastOnboardingBootstrap: currentState.lastOnboardingBootstrap,
            lastRootedWalletContextId:
              managedMandateProjection?.rootedWalletContextId ??
              currentState.lastRootedWalletContextId,
            activeWalletAddress:
              managedSnapshot.managedWalletAddress ?? currentState.activeWalletAddress,
            pendingOnboardingWalletAddress:
              managedMandateProjection === null
                ? currentState.pendingOnboardingWalletAddress
                : null,
            pendingApprovedSetup:
              managedMandateProjection === null
                ? (currentState.pendingApprovedSetup ?? null)
                : null,
            portfolioManagerMandate: currentState.portfolioManagerMandate ?? null,
          };

          return {
            state: nextState,
            ...(managedMandateProjection ||
            portfolioManagerMandateProjection ||
            portfolioProjectionInput
              ? {
                  domainProjectionUpdate: {
                    ...(managedMandateProjection
                      ? { managedMandateEditor: managedMandateProjection }
                      : {}),
                    ...(portfolioManagerMandateProjection
                      ? { portfolioManagerMandateEditor: portfolioManagerMandateProjection }
                      : {}),
                    ...(portfolioProjectionInput ? { portfolioProjectionInput } : {}),
                  },
                }
              : {}),
            outputs: {
              status: {
                executionStatus: 'completed',
                statusMessage: 'Portfolio state refreshed from Shared Ember Domain Service.',
              },
              artifacts: [
                {
                  data: {
                    type: 'shared-ember-portfolio-state',
                    revision: nextState.lastSharedEmberRevision,
                    portfolioState: nextState.lastPortfolioState,
                  },
                },
              ],
            },
          };
        }
        case 'update_managed_mandate': {
          const updateInput = parseManagedMandateUpdateInput(operation.input);
          if (!updateInput) {
            return {
              state: currentState,
              outputs: {
                status: {
                  executionStatus: 'failed',
                  statusMessage:
                  'Managed mandate updates require targetAgentId and a durable managedMandate payload.',
                },
              },
            };
          }

          if (updateInput.targetAgentId === PORTFOLIO_MANAGER_MANDATE_ROUTE_ID) {
            const nextState: PortfolioManagerLifecycleState = {
              ...currentState,
              portfolioManagerMandate: updateInput.managedMandate,
            };
            const nextProjection = buildPortfolioManagerMandateEditorProjection({
              rootUserWallet: readPortfolioManagerContextWalletAddress(currentState),
              lastRootedWalletContextId: currentState.lastRootedWalletContextId,
              portfolioManagerMandate: updateInput.managedMandate,
            });

            return {
              state: nextState,
              domainProjectionUpdate: {
                portfolioManagerMandateEditor: nextProjection,
              },
              outputs: {
                status: {
                  executionStatus: 'completed',
                  statusMessage:
                    'Portfolio manager mandate updated for local execution and persisted in session state.',
                },
              },
            };
          }

          if (!options.protocolHost) {
            return {
              state: currentState,
              outputs: {
                status: {
                  executionStatus: 'failed',
                  statusMessage: 'Shared Ember Domain Service host is not configured.',
                },
              },
            };
          }

          const currentManagedPortfolioState = await readSharedEmberPortfolioState({
            protocolHost: options.protocolHost,
            threadId,
            agentId: updateInput.targetAgentId,
          });
          const currentManagedProjection = buildManagedMandateEditorProjection(
            currentManagedPortfolioState.portfolioState,
          );
          if (!currentManagedProjection) {
            return {
              state: currentState,
              outputs: {
                status: {
                  executionStatus: 'failed',
                  statusMessage:
                    'Managed mandate updates require a live Shared Ember mandate projection for the managed lending lane.',
                },
              },
            };
          }

          const commandInput = isRecord(operation.input) ? operation.input : {};
          const idempotencyKey =
            typeof commandInput['idempotencyKey'] === 'string'
              ? commandInput['idempotencyKey']
              : buildManagedMandateUpdateIdempotencyKey({
                  threadId,
                  input: updateInput,
                });
          const occurredAt = new Date().toISOString();
          const response = await runSharedEmberCommandWithResolvedRevision<{
            result?: {
              revision?: number;
              committed_event_ids?: string[];
              mandate?: unknown;
            };
          }>({
            protocolHost: options.protocolHost,
            threadId,
            agentId,
            currentRevision:
              currentManagedPortfolioState.revision ?? currentState.lastSharedEmberRevision,
            buildRequest: (expectedRevision) => ({
              jsonrpc: '2.0',
              id: `shared-ember-${threadId}-update-managed-mandate`,
              method: 'orchestrator.updateManagedMandate.v1',
              params: {
                idempotency_key: idempotencyKey,
                expected_revision: expectedRevision,
                occurred_at: occurredAt,
                agent_id: updateInput.targetAgentId,
                mandate_ref: currentManagedProjection.mandateRef,
                managed_mandate: updateInput.managedMandate,
              },
            }),
          });
          const updatedManagedPortfolioState = await readSharedEmberPortfolioState({
            protocolHost: options.protocolHost,
            threadId,
            agentId: updateInput.targetAgentId,
          });
          const updatedManagedProjection = buildManagedMandateEditorProjection(
            updatedManagedPortfolioState.portfolioState,
          );
          const updatedPortfolioProjectionInput = buildPortfolioProjectionInput({
            portfolioState: updatedManagedPortfolioState.portfolioState,
            fallbackAgentId: updateInput.targetAgentId,
          });
          const nextRevision =
            response.result?.revision ??
            updatedManagedPortfolioState.revision ??
            currentManagedPortfolioState.revision ??
            currentState.lastSharedEmberRevision;
          const nextState: PortfolioManagerLifecycleState = {
            ...currentState,
            lastSharedEmberRevision: nextRevision,
          };

          return {
            state: nextState,
            ...(updatedManagedProjection || updatedPortfolioProjectionInput
              ? {
                  domainProjectionUpdate: {
                    ...(updatedManagedProjection
                      ? { managedMandateEditor: updatedManagedProjection }
                      : {}),
                    ...(updatedPortfolioProjectionInput
                      ? { portfolioProjectionInput: updatedPortfolioProjectionInput }
                      : {}),
                  },
                }
              : {}),
            outputs: {
              status: {
                executionStatus: 'completed',
                statusMessage: 'Managed mandate updated through Shared Ember Domain Service.',
              },
              artifacts: [
                {
                  data: {
                    type: 'shared-ember-managed-mandate',
                    revision: nextRevision,
                    committedEventIds: response.result?.committed_event_ids ?? [],
                    mandate: response.result?.mandate ?? null,
                  },
                },
              ],
            },
          };
        }
        case PORTFOLIO_MANAGER_SPOT_SWAP_COMMAND: {
          if (!options.hiddenOcaSpotSwapExecutor) {
            return {
              state: currentState,
              outputs: {
                status: {
                  executionStatus: 'failed',
                  statusMessage:
                    'Hidden Onchain Actions spot swap executor is not configured for this portfolio-manager runtime.',
                },
              },
            };
          }

          const dispatch = buildSpotSwapDispatchInput({
            operationInput: operation.input,
            currentState,
          });
          if (!dispatch) {
            return {
              state: currentState,
              outputs: {
                status: {
                  executionStatus: 'failed',
                  statusMessage:
                    'Spot swap dispatch requires walletAddress, amount, amountType, fromChain, toChain, fromToken, and toToken.',
                },
              },
            };
          }

          if (dispatch.reservationConflictHandling) {
            return {
              state: currentState,
              outputs: {
                status: {
                  executionStatus: 'failed',
                  statusMessage:
                    'Spot swap reserved-capital conflict handling can only be supplied by the portfolio-manager conflict confirmation retry.',
                },
              },
            };
          }

          if (!dispatch.rootedWalletContextId) {
            return {
              state: currentState,
              outputs: {
                status: {
                  executionStatus: 'failed',
                  statusMessage:
                    'Spot swap dispatch requires an active rooted wallet context before hidden execution can start.',
                },
              },
            };
          }

          if (shouldConfirmSpotSwapReservedCapital(dispatch)) {
            return buildSpotSwapReservedCapitalConfirmationResult({
              currentState,
              dispatch,
            });
          }

          const result = await options.hiddenOcaSpotSwapExecutor.executeSpotSwap({
            threadId,
            currentRevision: currentState.lastSharedEmberRevision,
            input: dispatch,
          });

          return buildSpotSwapOperationResult({
            currentState,
            dispatch,
            result,
          });
        }
        case PORTFOLIO_MANAGER_CONFIRM_SPOT_SWAP_COMMAND:
        case PORTFOLIO_MANAGER_SWAP_CONFLICT_INTERRUPT_TYPE: {
          const outcome = readSpotSwapConflictOutcome(operation.input);
          const pendingConflict = currentState.pendingSpotSwapConflict ?? null;

          if (!pendingConflict) {
            return {
              state: currentState,
              outputs: {
                status: {
                  executionStatus: 'failed',
                  statusMessage:
                    'There is no exact pending spot swap conflict to confirm or retry.',
                },
              },
            };
          }

          if (outcome === 'cancel') {
            return {
              state: {
                ...currentState,
                pendingSpotSwapConflict: null,
              },
              outputs: {
                status: {
                  executionStatus: 'canceled',
                  statusMessage: 'Spot swap canceled before reserved-capital retry.',
                },
              },
            };
          }

          if (outcome === null) {
            return {
              state: currentState,
              outputs: {
                status: {
                  executionStatus: 'failed',
                  statusMessage:
                    'Spot swap conflict confirmation requires allow_reserved_for_other_agent, unassigned_only, or cancel.',
                },
              },
            };
          }

          if (!options.hiddenOcaSpotSwapExecutor) {
            return {
              state: currentState,
              outputs: {
                status: {
                  executionStatus: 'failed',
                  statusMessage:
                    'Hidden Onchain Actions spot swap executor is not configured for this portfolio-manager runtime.',
                },
              },
            };
          }

          const dispatch = buildConfirmedSpotSwapDispatch({
            dispatch: pendingConflict.dispatch,
            outcome,
          });
          const result = await options.hiddenOcaSpotSwapExecutor.executeSpotSwap({
            threadId,
            currentRevision: currentState.lastSharedEmberRevision,
            input: dispatch,
          });

          return buildSpotSwapOperationResult({
            currentState: {
              ...currentState,
              pendingSpotSwapConflict: null,
            },
            dispatch,
            result,
          });
        }
        case 'refresh_redelegation_work': {
          if (!options.protocolHost) {
            return {
              state: currentState,
              outputs: {
                status: {
                  executionStatus: 'failed',
                  statusMessage: 'Shared Ember Domain Service host is not configured.',
                },
              },
            };
          }

          const outboxPage = (await options.protocolHost.readCommittedEventOutbox({
            protocol_version: 'v1',
            consumer_id: PORTFOLIO_MANAGER_REDELEGATION_OUTBOX_CONSUMER_ID,
            after_sequence: 0,
            limit: 100,
          })) as {
            revision?: number;
            acknowledged_through_sequence?: number;
            events?: unknown[];
          };

          const nextState: PortfolioManagerLifecycleState = {
            ...currentState,
            lastSharedEmberRevision: outboxPage.revision ?? currentState.lastSharedEmberRevision,
          };
          const redelegationWork = readNextReadyForRedelegationWork(
            outboxPage.events ?? [],
            outboxPage.acknowledged_through_sequence ?? 0,
          );

          if (redelegationWork === null) {
            return {
              state: nextState,
              outputs: {
                status: {
                  executionStatus: 'completed',
                  statusMessage:
                    'No redelegation work is currently pending in the Shared Ember outbox.',
                },
              },
            };
          }

          if (!options.runtimeSigning) {
            return {
              state: nextState,
              outputs: {
                status: {
                  executionStatus: 'failed',
                  statusMessage:
                    'Runtime-owned signing service is not configured for portfolio-manager redelegation signing.',
                },
              },
            };
          }

          if (!controllerWalletAddress) {
            return {
              state: nextState,
              outputs: {
                status: {
                  executionStatus: 'failed',
                  statusMessage:
                    'Portfolio-manager redelegation signing is blocked because the controller smart-account address is not configured.',
                },
              },
            };
          }
          if (!controllerSignerAddress) {
            return {
              state: nextState,
              outputs: {
                status: {
                  executionStatus: 'failed',
                  statusMessage:
                    'Portfolio-manager redelegation signing is blocked because the controller signer address is not configured.',
                },
              },
            };
          }

          let unsignedRedelegation: PortfolioManagerUnsignedDelegation;
          try {
            unsignedRedelegation = buildRuntimeRedelegationUnsignedDelegation({
              redelegationSigningPackage: redelegationWork.redelegationSigningPackage,
              delegatorAddress: controllerWalletAddress,
            });
          } catch {
            return {
              state: nextState,
              outputs: {
                status: {
                  executionStatus: 'failed',
                  statusMessage:
                    'Portfolio-manager redelegation signing could not continue because the canonical signing package was incomplete.',
                },
              },
            };
          }

          const redelegationNetwork = readString(
            redelegationWork.redelegationSigningPackage['network'],
          );

          if (!redelegationNetwork) {
            return {
              state: nextState,
              outputs: {
                status: {
                  executionStatus: 'failed',
                  statusMessage:
                    'Portfolio-manager redelegation signing could not continue because the canonical signing package was incomplete.',
                },
              },
            };
          }

          const signedRedelegation = await signPreparedDelegation({
            signing: options.runtimeSigning,
            signerRef: options.runtimeSignerRef ?? DEFAULT_RUNTIME_SIGNER_REF,
            expectedAddress: controllerSignerAddress,
            chain: OWS_SIGNING_CHAIN,
            chainId: resolveRuntimeRedelegationChainId(redelegationNetwork),
            delegationManager: PORTFOLIO_MANAGER_DELEGATION_MANAGER,
            delegation: unsignedRedelegation,
          });

          let signedRedelegationRecord: Record<string, unknown>;
          try {
            signedRedelegationRecord = buildRuntimeSignedRedelegationRecord({
              redelegationSigningPackage: redelegationWork.redelegationSigningPackage,
              artifactRef: signedRedelegation.artifactRef,
            });
          } catch {
            return {
              state: nextState,
              outputs: {
                status: {
                  executionStatus: 'failed',
                  statusMessage:
                    'Portfolio-manager redelegation signing could not continue because the canonical signing package was incomplete.',
                },
              },
            };
          }

          const registrationResponse = await runSharedEmberCommandWithResolvedRevision<{
            result?: {
              revision?: number;
              committed_event_ids?: string[];
              execution_result?: unknown;
            };
          }>({
            protocolHost: options.protocolHost,
            threadId,
            agentId,
            currentRevision: nextState.lastSharedEmberRevision,
            buildRequest: (expectedRevision) => ({
              jsonrpc: '2.0',
              id: `shared-ember-${threadId}-register-signed-redelegation`,
              method: 'orchestrator.registerSignedRedelegation.v1',
              params: {
                idempotency_key: `idem-refresh-redelegation-work-${threadId}:register-redelegation:${redelegationWork.requestId}`,
                expected_revision: expectedRevision,
                transaction_plan_id: redelegationWork.transactionPlanId,
                signed_redelegation: signedRedelegationRecord,
              },
            }),
          });

          const acknowledgeResponse = await options.protocolHost.acknowledgeCommittedEventOutbox({
            protocol_version: 'v1',
            consumer_id: PORTFOLIO_MANAGER_REDELEGATION_OUTBOX_CONSUMER_ID,
            delivered_through_sequence: redelegationWork.sequence,
          });
          const acknowledgeErrorMessage = readOutboxErrorMessage(acknowledgeResponse);

          if (acknowledgeErrorMessage !== null) {
            throw new Error(
              `Shared Ember committed outbox acknowledgement failed: ${acknowledgeErrorMessage}`,
            );
          }

          const registeredRevision =
            readInt(registrationResponse.result?.revision) ?? nextState.lastSharedEmberRevision;
          const acknowledgedRevision =
            readInt(isRecord(acknowledgeResponse) ? acknowledgeResponse['revision'] : null) ??
            registeredRevision;
          const acknowledgedThroughSequence =
            readInt(
              isRecord(acknowledgeResponse)
                ? acknowledgeResponse['acknowledged_through_sequence']
                : null,
            ) ?? redelegationWork.sequence;
          const completedState: PortfolioManagerLifecycleState = {
            ...nextState,
            lastSharedEmberRevision: acknowledgedRevision,
          };

          return {
            state: completedState,
            outputs: {
              status: {
                executionStatus: 'completed',
                statusMessage:
                  'Redelegation signed, registered, and acknowledged through Shared Ember.',
              },
              artifacts: [
                {
                  data: {
                    type: 'shared-ember-redelegation-registration',
                    revision: completedState.lastSharedEmberRevision,
                    consumerId: PORTFOLIO_MANAGER_REDELEGATION_OUTBOX_CONSUMER_ID,
                    eventId: redelegationWork.eventId,
                    sequence: redelegationWork.sequence,
                    requestId: redelegationWork.requestId,
                    transactionPlanId: redelegationWork.transactionPlanId,
                    committedEventIds: registrationResponse.result?.committed_event_ids ?? [],
                    acknowledgedThroughSequence,
                  },
                },
              ],
            },
          };
        }
        case 'complete_rooted_bootstrap_from_user_signing': {
          if (!options.protocolHost) {
            return {
              state: currentState,
              outputs: {
                status: {
                  executionStatus: 'failed',
                  statusMessage: 'Shared Ember Domain Service host is not configured.',
                },
              },
            };
          }
          const commandInput =
            typeof operation.input === 'object' && operation.input !== null ? operation.input : {};
          const onboarding = 'onboarding' in commandInput ? commandInput.onboarding : undefined;
          const handoff = 'handoff' in commandInput ? commandInput.handoff : undefined;
          const idempotencyKey =
            'idempotencyKey' in commandInput && typeof commandInput.idempotencyKey === 'string'
              ? commandInput.idempotencyKey
              : buildRootedBootstrapIdempotencyKey({
                  threadId,
                  onboarding,
                  handoff,
                });
          const response = await runSharedEmberCommandWithResolvedRevision<{
            result?: {
              revision?: number;
              committed_event_ids?: string[];
              rooted_wallet_context_id?: string;
              root_delegation?: unknown;
            };
          }>({
            protocolHost: options.protocolHost,
            threadId,
            agentId,
            currentRevision: currentState.lastSharedEmberRevision,
            buildRequest: (expectedRevision) => ({
              jsonrpc: '2.0',
              id: `shared-ember-${threadId}-complete-rooted-bootstrap`,
              method: 'orchestrator.completeRootedBootstrapFromUserSigning.v1',
              params: {
                idempotency_key: idempotencyKey,
                expected_revision: expectedRevision,
                onboarding,
                handoff,
              },
            }),
          });

          const nextState: PortfolioManagerLifecycleState = {
            phase: 'onboarding',
            lastPortfolioState: currentState.lastPortfolioState,
            lastSharedEmberRevision: response.result?.revision ?? null,
            lastRootDelegation: response.result?.root_delegation ?? currentState.lastRootDelegation,
            lastOnboardingBootstrap: currentState.lastOnboardingBootstrap,
            lastRootedWalletContextId: response.result?.rooted_wallet_context_id ?? null,
            activeWalletAddress:
              currentState.activeWalletAddress ?? currentState.pendingOnboardingWalletAddress,
            pendingOnboardingWalletAddress: currentState.pendingOnboardingWalletAddress,
            pendingApprovedSetup: currentState.pendingApprovedSetup ?? null,
          };

          return {
            state: nextState,
            outputs: {
              status: {
                executionStatus: 'completed',
                statusMessage: 'Rooted bootstrap completed with Shared Ember Domain Service.',
              },
              artifacts: [
                {
                  data: {
                    type: 'shared-ember-rooted-bootstrap',
                    revision: nextState.lastSharedEmberRevision,
                    committedEventIds: response.result?.committed_event_ids ?? [],
                    rootedWalletContextId: nextState.lastRootedWalletContextId,
                    rootDelegation: nextState.lastRootDelegation,
                  },
                },
              ],
            },
          };
        }
        default:
          return {
            state: currentState,
            outputs: {},
          };
      }
    },
  };
}
