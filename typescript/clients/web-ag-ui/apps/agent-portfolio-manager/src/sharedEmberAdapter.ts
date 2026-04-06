import type { AgentRuntimeDomainConfig } from 'agent-runtime';
import type { AgentRuntimeSigningService } from 'agent-runtime/internal';
import { signPreparedDelegation } from 'agent-runtime/internal';
import { getDeleGatorEnvironment, ROOT_AUTHORITY } from '@metamask/delegation-toolkit';
import { getDelegationHashOffchain } from '@metamask/delegation-toolkit/utils';
import { keccak256, toHex } from 'viem';
import {
  buildPortfolioManagerWalletAccountingDetails,
  buildSharedEmberAccountingContextXml,
  resolvePortfolioManagerAccountingAgentId,
  readPortfolioManagerOnboardingState,
} from './sharedEmberOnboardingState.js';

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
  pendingApprovedMandateEnvelope?: PortfolioManagerApprovedMandateEnvelope | null;
};

type CreatePortfolioManagerDomainOptions = {
  protocolHost?: PortfolioManagerSharedEmberProtocolHost;
  agentId?: string;
  controllerWalletAddress?: `0x${string}`;
  controllerSignerAddress?: `0x${string}`;
  runtimeSigning?: AgentRuntimeSigningService;
  runtimeSignerRef?: string;
};

type SharedEmberRevisionResponse = {
  result?: {
    revision?: number;
  };
};

type OnboardingMandateSource = {
  mandate_ref: string;
  agent_id: string;
  mandate_summary: string;
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
    pendingApprovedMandateEnvelope: null,
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

function readPortfolioManagerContextWalletAddress(
  state: PortfolioManagerLifecycleState,
): `0x${string}` | null {
  return state.activeWalletAddress ?? readOnboardingBootstrapWalletAddress(state.lastOnboardingBootstrap);
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

function readDelegationCaveats(
  value: unknown,
): PortfolioManagerSignedDelegation['caveats'] | null {
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
): SharedEmberRedelegationWork | null {
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
      redelegationSigningPackage === null
    ) {
      continue;
    }

    return {
      eventId: event.event_id,
      sequence: event.sequence,
      requestId,
      transactionPlanId,
      phase: 'ready_for_redelegation',
      redelegationSigningPackage,
    };
  }

  return null;
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
    case 'base':
      return 8453;
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
  let expectedRevision =
    input.currentRevision ?? (await readCurrentSharedEmberRevision(input));

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
  const executionContext = isRecord(result?.['execution_context']) ? result['execution_context'] : null;

  return {
    revision: readInt(result?.['revision']),
    walletAddress: readHexAddress(executionContext?.['subagent_wallet_address']),
  };
}

const PORTFOLIO_MANAGER_SETUP_INTERRUPT_TYPE = 'portfolio-manager-setup-request';
const PORTFOLIO_MANAGER_SETUP_MESSAGE =
  'Connect the wallet you want the portfolio manager to onboard.';
const PORTFOLIO_MANAGER_SIGNING_INTERRUPT_TYPE = 'portfolio-manager-delegation-signing-request';
const PORTFOLIO_MANAGER_SIGNING_MESSAGE =
  'Review and sign the delegation needed to activate your portfolio manager.';
const PORTFOLIO_MANAGER_ROOT_AUTHORITY = ROOT_AUTHORITY;
const PORTFOLIO_MANAGER_DELEGATION_SALT =
  '0x1111111111111111111111111111111111111111111111111111111111111111';
const PORTFOLIO_MANAGER_BOOTSTRAP_TIMESTAMP = '2026-03-30T00:00:00.000Z';
const PORTFOLIO_MANAGER_PROTOCOL_SOURCE = 'onboarding_scan';
const PORTFOLIO_MANAGER_DEFAULT_RISK_LEVEL = 'medium';
const PORTFOLIO_MANAGER_ACTIVATION_PURPOSE = 'deploy';
const FIRST_MANAGED_AGENT_TYPE = 'ember-lending';
const FIRST_MANAGED_AGENT_PROTOCOL = 'aave';
const FIRST_MANAGED_AGENT_ROOT_ASSET = 'USDC';
const FIRST_MANAGED_AGENT_BENCHMARK_ASSET = 'USD';
const FIRST_MANAGED_AGENT_ALLOCATION_MODE = 'allocable_idle';
const FIRST_MANAGED_AGENT_ONBOARDING_CONTROL_PATH = 'lending.supply';

type PortfolioManagerPortfolioMandate = {
  approved: true;
  riskLevel: typeof PORTFOLIO_MANAGER_DEFAULT_RISK_LEVEL;
};

type EmberLendingManagedAgentSettings = {
  network: typeof PORTFOLIO_MANAGER_NETWORK;
  protocol: typeof FIRST_MANAGED_AGENT_PROTOCOL;
  allowedCollateralAssets: string[];
  allowedBorrowAssets: string[];
  maxAllocationPct: number;
  maxLtvBps: number;
  minHealthFactor: string;
};

type PortfolioManagerManagedAgentMandate = {
  agentKey: string;
  agentType: typeof FIRST_MANAGED_AGENT_TYPE;
  approved: true;
  settings: EmberLendingManagedAgentSettings;
};

type ManagedOnboardingMandate = {
  root_asset: string;
  benchmark_asset: string;
  allocation_mode: typeof FIRST_MANAGED_AGENT_ALLOCATION_MODE;
  intent: typeof PORTFOLIO_MANAGER_ACTIVATION_PURPOSE;
  control_path: typeof FIRST_MANAGED_AGENT_ONBOARDING_CONTROL_PATH;
};

type PortfolioManagerApprovedMandateEnvelope = {
  portfolioMandate: PortfolioManagerPortfolioMandate;
  managedAgentMandates: PortfolioManagerManagedAgentMandate[];
};

type PortfolioManagerSetupInput = PortfolioManagerApprovedMandateEnvelope & {
  walletAddress: `0x${string}`;
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

function isNonEmptyStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every((entry) => typeof entry === 'string' && entry.trim().length > 0)
  );
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

function parseEmberLendingManagedAgentSettings(input: unknown): EmberLendingManagedAgentSettings | null {
  if (typeof input !== 'object' || input === null) {
    return null;
  }

  const network = 'network' in input && typeof input.network === 'string' ? input.network : null;
  const protocol = 'protocol' in input && typeof input.protocol === 'string' ? input.protocol : null;
  const allowedCollateralAssets =
    'allowedCollateralAssets' in input ? input.allowedCollateralAssets : null;
  const allowedBorrowAssets = 'allowedBorrowAssets' in input ? input.allowedBorrowAssets : null;
  const maxAllocationPct =
    'maxAllocationPct' in input && typeof input.maxAllocationPct === 'number'
      ? input.maxAllocationPct
      : null;
  const maxLtvBps =
    'maxLtvBps' in input && typeof input.maxLtvBps === 'number' ? input.maxLtvBps : null;
  const minHealthFactor =
    'minHealthFactor' in input && typeof input.minHealthFactor === 'string'
      ? input.minHealthFactor
      : null;

  if (
    network !== PORTFOLIO_MANAGER_NETWORK ||
    protocol !== FIRST_MANAGED_AGENT_PROTOCOL ||
    !isNonEmptyStringArray(allowedCollateralAssets) ||
    !isNonEmptyStringArray(allowedBorrowAssets) ||
    maxAllocationPct === null ||
    maxAllocationPct <= 0 ||
    maxAllocationPct > 100 ||
    maxLtvBps === null ||
    maxLtvBps <= 0 ||
    !Number.isInteger(maxLtvBps) ||
    !minHealthFactor ||
    minHealthFactor.trim().length === 0
  ) {
    return null;
  }

  return {
    network,
    protocol,
    allowedCollateralAssets,
    allowedBorrowAssets,
    maxAllocationPct,
    maxLtvBps,
    minHealthFactor,
  };
}

function parseManagedAgentMandate(input: unknown): PortfolioManagerManagedAgentMandate | null {
  if (typeof input !== 'object' || input === null) {
    return null;
  }

  const agentKey =
    'agentKey' in input && typeof input.agentKey === 'string' ? input.agentKey.trim() : null;
  const agentType =
    'agentType' in input && typeof input.agentType === 'string' ? input.agentType : null;
  const approved = 'approved' in input ? input.approved : null;
  const settings = 'settings' in input ? input.settings : null;

  if (!agentKey || agentType !== FIRST_MANAGED_AGENT_TYPE || approved !== true) {
    return null;
  }

  const parsedSettings = parseEmberLendingManagedAgentSettings(settings);
  if (!parsedSettings) {
    return null;
  }

  return {
    agentKey,
    agentType,
    approved: true,
    settings: parsedSettings,
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
  const managedAgentMandates =
    'managedAgentMandates' in input && Array.isArray(input.managedAgentMandates)
      ? input.managedAgentMandates
      : null;
  const parsedPortfolioMandate = parsePortfolioMandate(portfolioMandate);

  if (
    !parsedPortfolioMandate ||
    !managedAgentMandates ||
    managedAgentMandates.length === 0
  ) {
    return null;
  }

  const parsedManagedAgentMandates: PortfolioManagerManagedAgentMandate[] = [];
  for (const mandate of managedAgentMandates) {
    const parsedMandate = parseManagedAgentMandate(mandate);
    if (!parsedMandate) {
      return null;
    }

    parsedManagedAgentMandates.push(parsedMandate);
  }

  return {
    walletAddress: walletAddress as `0x${string}`,
    portfolioMandate: parsedPortfolioMandate,
    managedAgentMandates: parsedManagedAgentMandates,
  };
}

function readApprovedMandateEnvelopeFromOnboardingBootstrap(
  value: unknown,
): PortfolioManagerApprovedMandateEnvelope | null {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('rootedWalletContext' in value) ||
    typeof value.rootedWalletContext !== 'object' ||
    value.rootedWalletContext === null ||
    !('metadata' in value.rootedWalletContext) ||
    typeof value.rootedWalletContext.metadata !== 'object' ||
    value.rootedWalletContext.metadata === null ||
    !('approvedMandateEnvelope' in value.rootedWalletContext.metadata)
  ) {
    return null;
  }

  const approvedMandateEnvelope = value.rootedWalletContext.metadata.approvedMandateEnvelope;
  if (typeof approvedMandateEnvelope !== 'object' || approvedMandateEnvelope === null) {
    return null;
  }

  const portfolioMandate =
    'portfolioMandate' in approvedMandateEnvelope
      ? parsePortfolioMandate(approvedMandateEnvelope.portfolioMandate)
      : null;
  const managedAgentMandates =
    'managedAgentMandates' in approvedMandateEnvelope &&
    Array.isArray(approvedMandateEnvelope.managedAgentMandates)
      ? approvedMandateEnvelope.managedAgentMandates
      : null;

  if (!portfolioMandate || !managedAgentMandates || managedAgentMandates.length === 0) {
    return null;
  }

  const parsedManagedAgentMandates: PortfolioManagerManagedAgentMandate[] = [];
  for (const mandate of managedAgentMandates) {
    const parsedMandate = parseManagedAgentMandate(mandate);
    if (!parsedMandate) {
      return null;
    }

    parsedManagedAgentMandates.push(parsedMandate);
  }

  return {
    portfolioMandate,
    managedAgentMandates: parsedManagedAgentMandates,
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
      typeof mandate.agent_id !== 'string' ||
      !('mandate_summary' in mandate) ||
      typeof mandate.mandate_summary !== 'string'
    ) {
      continue;
    }

    mandateSources.push({
      mandate_ref: mandate.mandate_ref,
      agent_id: mandate.agent_id,
      mandate_summary: mandate.mandate_summary,
    });
  }

  return mandateSources;
}

function parsePortfolioManagerSignedDelegations(input: unknown): PortfolioManagerSignedDelegation[] | null {
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

function isPortfolioManagerSigningRejected(input: unknown): boolean {
  return typeof input === 'object' && input !== null && 'outcome' in input && input.outcome === 'rejected';
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
    surfacedInThread: true,
    message: PORTFOLIO_MANAGER_SIGNING_MESSAGE,
    payload: {
      chainId: PORTFOLIO_MANAGER_CHAIN_ID,
      delegationManager: PORTFOLIO_MANAGER_DELEGATION_MANAGER,
      delegatorAddress: setup.walletAddress,
      delegateeAddress: controllerWalletAddress,
      delegationsToSign: [
        buildPortfolioManagerUnsignedDelegation(setup.walletAddress, controllerWalletAddress),
      ],
      descriptions: ['Authorize the portfolio manager to operate through your root delegation.'],
      warnings: ['Only continue if you trust this portfolio-manager session.'],
    },
  };
}

function buildPortfolioManagerMandateSummary(input: PortfolioManagerPortfolioMandate): string {
  return `preserve direct-user liquidity at ${input.riskLevel} risk while coordinating managed subagents`;
}

function buildManagedAgentMandateSummary(input: PortfolioManagerManagedAgentMandate): string {
  const primaryAsset = input.settings.allowedCollateralAssets[0] ?? FIRST_MANAGED_AGENT_ROOT_ASSET;
  return `lend ${primaryAsset} on Aave within medium-risk allocation, LTV, and health-factor guardrails`;
}

function buildManagedOnboardingMandate(
  input: PortfolioManagerManagedAgentMandate,
): ManagedOnboardingMandate {
  return {
    root_asset: input.settings.allowedCollateralAssets[0] ?? FIRST_MANAGED_AGENT_ROOT_ASSET,
    benchmark_asset: FIRST_MANAGED_AGENT_BENCHMARK_ASSET,
    allocation_mode: FIRST_MANAGED_AGENT_ALLOCATION_MODE,
    intent: PORTFOLIO_MANAGER_ACTIVATION_PURPOSE,
    control_path: FIRST_MANAGED_AGENT_ONBOARDING_CONTROL_PATH,
  };
}

function buildPortfolioManagerOnboardingBootstrap(params: {
  agentId: string;
  threadId: string;
  walletAddress: `0x${string}`;
  approvedMandateEnvelope: PortfolioManagerApprovedMandateEnvelope;
}) {
  const identity = sanitizeIdentitySegment(`${params.threadId}-${params.walletAddress}`);
  const userId = `user-${identity}`;
  const rootedWalletContextId = `rwc-${identity}`;
  const portfolioMandateRef = `mandate-portfolio-${identity}`;
  const firstManagedAgentMandate = params.approvedMandateEnvelope.managedAgentMandates[0];
  if (!firstManagedAgentMandate) {
    throw new Error('portfolio manager onboarding requires at least one managed agent mandate');
  }
  const managedAgentKeySegment = sanitizeIdentitySegment(firstManagedAgentMandate.agentKey);
  const managedAgentMandateRef = `mandate-${managedAgentKeySegment}-${identity}`;

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
        approvedMandateEnvelope: params.approvedMandateEnvelope,
      },
    },
    mandates: [
      {
        mandate_ref: portfolioMandateRef,
        agent_id: params.agentId,
        mandate_summary: buildPortfolioManagerMandateSummary(
          params.approvedMandateEnvelope.portfolioMandate,
        ),
        managed_onboarding: null,
      },
      {
        mandate_ref: managedAgentMandateRef,
        agent_id: FIRST_MANAGED_AGENT_TYPE,
        mandate_summary: buildManagedAgentMandateSummary(firstManagedAgentMandate),
        managed_onboarding: buildManagedOnboardingMandate(firstManagedAgentMandate),
      },
    ],
    userReservePolicies: [],
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
          name: 'refresh_redelegation_work',
          description:
            'Read committed redelegation work from the Shared Ember outbox for the portfolio-manager orchestrator.',
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
          surfacedInThread: true,
        },
        {
          type: 'portfolio-manager-delegation-signing-request',
          description: 'Request delegation signatures needed to complete portfolio-manager onboarding.',
          surfacedInThread: true,
        },
      ],
    },
    systemContext: async ({ state }) => {
      const currentState = state ?? buildDefaultLifecycleState();
      const context = ['<portfolio_manager_context>'];

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

      const rootedWalletAddress = readOnboardingBootstrapWalletAddress(
        currentState.lastOnboardingBootstrap,
      );
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

      const approvedMandateEnvelope = readApprovedMandateEnvelopeFromOnboardingBootstrap(
        currentState.lastOnboardingBootstrap,
      );
      if (approvedMandateEnvelope) {
        const mandateSources = readOnboardingMandateSources(currentState.lastOnboardingBootstrap);
        const portfolioMandateSource =
          mandateSources.find((mandate) => mandate.agent_id === agentId) ?? null;
        const managedAgentMandateSources = mandateSources.filter(
          (mandate) => mandate.agent_id !== agentId,
        );

        if (portfolioMandateSource) {
          context.push(
            `  <portfolio_mandate mandate_ref="${escapeXml(
              portfolioMandateSource.mandate_ref,
            )}" risk_level="${escapeXml(
              approvedMandateEnvelope.portfolioMandate.riskLevel,
            )}">${escapeXml(portfolioMandateSource.mandate_summary)}</portfolio_mandate>`,
          );
        }

        if (approvedMandateEnvelope.managedAgentMandates.length > 0) {
          context.push('  <managed_agent_mandates>');

          approvedMandateEnvelope.managedAgentMandates.forEach((managedAgentMandate, index) => {
            const mandateSource = managedAgentMandateSources[index] ?? null;

            context.push(
              `    <managed_agent agent_key="${escapeXml(
                managedAgentMandate.agentKey,
              )}" agent_type="${escapeXml(
                managedAgentMandate.agentType,
              )}" approved="true"${
                mandateSource ? ` mandate_ref="${escapeXml(mandateSource.mandate_ref)}"` : ''
              }>`,
            );

            if (mandateSource) {
              context.push(
                `      <summary>${escapeXml(mandateSource.mandate_summary)}</summary>`,
              );
            }

            context.push(
              `      <network>${escapeXml(managedAgentMandate.settings.network)}</network>`,
            );
            context.push(
              `      <protocol>${escapeXml(managedAgentMandate.settings.protocol)}</protocol>`,
            );
            context.push(
              `      <allowed_collateral_assets>${escapeXml(
                managedAgentMandate.settings.allowedCollateralAssets.join(','),
              )}</allowed_collateral_assets>`,
            );
            context.push(
              `      <allowed_borrow_assets>${escapeXml(
                managedAgentMandate.settings.allowedBorrowAssets.join(','),
              )}</allowed_borrow_assets>`,
            );
            context.push(
              `      <max_allocation_pct>${managedAgentMandate.settings.maxAllocationPct}</max_allocation_pct>`,
            );
            context.push(
              `      <max_ltv_bps>${managedAgentMandate.settings.maxLtvBps}</max_ltv_bps>`,
            );
            context.push(
              `      <min_health_factor>${escapeXml(
                managedAgentMandate.settings.minHealthFactor,
              )}</min_health_factor>`,
            );
            context.push('    </managed_agent>');
          });

          context.push('  </managed_agent_mandates>');
        }
      }

      context.push('</portfolio_manager_context>');

      const walletAddress = readPortfolioManagerContextWalletAddress(currentState);
      if (walletAddress && options.protocolHost) {
        try {
          const accountingAgentId = resolvePortfolioManagerAccountingAgentId(
            currentState.lastOnboardingBootstrap,
          );
          const { revision, onboardingState } = await readPortfolioManagerOnboardingState({
            protocolHost: options.protocolHost,
            agentId: accountingAgentId,
            walletAddress,
          });
          context.push(
            ...buildSharedEmberAccountingContextXml({
              status: 'live',
              details: buildPortfolioManagerWalletAccountingDetails({
                revision,
                onboardingState,
              }),
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
                surfacedInThread: true,
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
            pendingApprovedMandateEnvelope: null,
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
            pendingApprovedMandateEnvelope: {
              portfolioMandate: setupInput.portfolioMandate,
              managedAgentMandates: setupInput.managedAgentMandates,
            },
          };

          return {
            state: nextState,
              outputs: {
                status: {
                  executionStatus: 'interrupted',
                  statusMessage: PORTFOLIO_MANAGER_SIGNING_MESSAGE,
                },
                interrupt: buildPortfolioManagerSigningInterrupt(
                  setupInput,
                  controllerWalletAddress,
                ),
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
                pendingApprovedMandateEnvelope: null,
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

          const walletAddress = currentState.pendingOnboardingWalletAddress;
          const approvedMandateEnvelope = currentState.pendingApprovedMandateEnvelope ?? null;
          const signedDelegations = parsePortfolioManagerSignedDelegations(operation.input);
          const signedDelegation = signedDelegations?.[0];

          if (!walletAddress || !approvedMandateEnvelope || !signedDelegation) {
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

          const orchestratorIdentity = await readSharedEmberAgentServiceIdentity({
            protocolHost: options.protocolHost,
            agentId,
            role: 'orchestrator',
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

          const managedSubagentIdentity = await readSharedEmberAgentServiceIdentity({
            protocolHost: options.protocolHost,
            agentId: FIRST_MANAGED_AGENT_TYPE,
            role: 'subagent',
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
            approvedMandateEnvelope,
          });
          const handoff = buildPortfolioManagerRootDelegationHandoff({
            threadId,
            walletAddress,
            signedDelegation,
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
                idempotency_key: `idem-portfolio-manager-rooted-bootstrap-${threadId}`,
                expected_revision: expectedRevision,
                onboarding,
                handoff,
              },
            }),
          });
          const managedSubagentExecutionContext = await readSharedEmberSubagentWalletAddress({
            protocolHost: options.protocolHost,
            agentId: FIRST_MANAGED_AGENT_TYPE,
          });
          const nextRevision =
            managedSubagentExecutionContext.revision ?? response.result?.revision ?? null;

          if (!managedSubagentExecutionContext.walletAddress) {
            const nextState: PortfolioManagerLifecycleState = {
              phase: 'onboarding',
              lastPortfolioState: currentState.lastPortfolioState,
              lastSharedEmberRevision: nextRevision,
              lastRootDelegation: response.result?.root_delegation ?? currentState.lastRootDelegation,
              lastOnboardingBootstrap: onboarding,
              lastRootedWalletContextId: response.result?.rooted_wallet_context_id ?? null,
              activeWalletAddress: walletAddress,
              pendingOnboardingWalletAddress: walletAddress,
              pendingApprovedMandateEnvelope: approvedMandateEnvelope,
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

          const nextState: PortfolioManagerLifecycleState = {
            phase: 'active',
            lastPortfolioState: currentState.lastPortfolioState,
            lastSharedEmberRevision: nextRevision,
            lastRootDelegation: response.result?.root_delegation ?? currentState.lastRootDelegation,
            lastOnboardingBootstrap: onboarding,
            lastRootedWalletContextId: response.result?.rooted_wallet_context_id ?? null,
            activeWalletAddress: walletAddress,
            pendingOnboardingWalletAddress: null,
            pendingApprovedMandateEnvelope: null,
          };

          return {
            state: nextState,
            outputs: {
              status: {
                executionStatus: 'working',
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
          const idempotencyKey =
            'idempotencyKey' in commandInput && typeof commandInput.idempotencyKey === 'string'
              ? commandInput.idempotencyKey
              : `idem-root-delegation-${threadId}`;
          const handoff = 'handoff' in commandInput ? commandInput.handoff : undefined;
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
            pendingApprovedMandateEnvelope: currentState.pendingApprovedMandateEnvelope ?? null,
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
          const response = (await options.protocolHost.handleJsonRpc({
            jsonrpc: '2.0',
            id: `shared-ember-${threadId}-read-portfolio-state`,
            method: 'subagent.readPortfolioState.v1',
            params: {
              agent_id: agentId,
            },
          })) as {
            result?: {
              revision?: number;
              portfolio_state?: unknown;
            };
          };

          const nextState: PortfolioManagerLifecycleState = {
            phase: currentState.phase,
            lastPortfolioState: response.result?.portfolio_state ?? null,
            lastSharedEmberRevision: response.result?.revision ?? null,
            lastRootDelegation: currentState.lastRootDelegation,
            lastOnboardingBootstrap: currentState.lastOnboardingBootstrap,
            lastRootedWalletContextId: currentState.lastRootedWalletContextId,
            activeWalletAddress: currentState.activeWalletAddress,
            pendingOnboardingWalletAddress: currentState.pendingOnboardingWalletAddress,
            pendingApprovedMandateEnvelope: currentState.pendingApprovedMandateEnvelope ?? null,
          };

          return {
            state: nextState,
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
                  statusMessage: 'No redelegation work is currently pending in the Shared Ember outbox.',
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
            readInt(
              isRecord(acknowledgeResponse) ? acknowledgeResponse['revision'] : null,
            ) ?? registeredRevision;
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
          const idempotencyKey =
            'idempotencyKey' in commandInput && typeof commandInput.idempotencyKey === 'string'
              ? commandInput.idempotencyKey
              : `idem-rooted-bootstrap-${threadId}`;
          const onboarding = 'onboarding' in commandInput ? commandInput.onboarding : undefined;
          const handoff = 'handoff' in commandInput ? commandInput.handoff : undefined;
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
              currentState.activeWalletAddress ??
              currentState.pendingOnboardingWalletAddress,
            pendingOnboardingWalletAddress: currentState.pendingOnboardingWalletAddress,
            pendingApprovedMandateEnvelope: currentState.pendingApprovedMandateEnvelope ?? null,
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
