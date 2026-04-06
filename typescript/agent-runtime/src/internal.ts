import {
  getWallet,
  signMessage as signMessageWithOwsCore,
  signTransaction as signTransactionWithOwsCore,
  signTypedData as signTypedDataWithOwsCore,
} from '@open-wallet-standard/core';
import { parseSignature, parseTransaction, serializeTransaction } from 'viem';

import {
  createAgentRuntime,
  type AgentRuntimeService,
  type CreateAgentRuntimeOptions,
} from './index.js';

export type AgentRuntimeSignerRef = string;

export type AgentRuntimeSigningRequest = {
  signerRef: AgentRuntimeSignerRef;
  expectedAddress?: `0x${string}`;
  payloadKind: string;
  payload: Record<string, unknown>;
  context?: {
    threadId?: string;
    requestId?: string;
    transactionPlanId?: string;
  };
};

export type AgentRuntimeSigningResult = {
  confirmedAddress: `0x${string}`;
  signedPayload: Record<string, unknown>;
};

export interface AgentRuntimeSigningService {
  readAddress(input: { signerRef: AgentRuntimeSignerRef }): Promise<`0x${string}`>;
  signPayload(input: AgentRuntimeSigningRequest): Promise<AgentRuntimeSigningResult>;
}

export type AgentRuntimeSignedEvmTransactionArtifact = {
  kind: 'evm-raw-transaction';
  confirmedAddress: `0x${string}`;
  signature: `0x${string}`;
  rawTransaction: `0x${string}`;
  recoveryId?: number;
};

export type AgentRuntimeDelegationCaveat = {
  enforcer: `0x${string}`;
  terms: `0x${string}`;
  args?: `0x${string}`;
};

export type AgentRuntimeUnsignedDelegation = {
  delegate: `0x${string}`;
  delegator: `0x${string}`;
  authority: `0x${string}`;
  caveats: readonly AgentRuntimeDelegationCaveat[];
  salt: `0x${string}`;
};

export type AgentRuntimeSignedDelegationArtifact = {
  kind: 'metamask-delegation';
  confirmedAddress: `0x${string}`;
  signature: `0x${string}`;
  artifactRef: string;
  delegation: AgentRuntimeUnsignedDelegation & {
    signature: `0x${string}`;
  };
};

export type AgentRuntimeKernel = {
  service: AgentRuntimeService;
  signing: AgentRuntimeSigningService;
};

export type AgentRuntimeInternalPostgresHooks = {
  ensureReady?: (options?: { env?: { DATABASE_URL?: string } }) => Promise<{
    databaseUrl: string;
  }>;
  loadInspectionState?: (options: { databaseUrl: string }) => Promise<unknown>;
  executeStatements?: (databaseUrl: string, statements: readonly unknown[]) => Promise<void>;
  persistDirectExecution?: (options: unknown) => Promise<void>;
};

export type AgentRuntimePrivateOwsSignerConfig = {
  signerRef: AgentRuntimeSignerRef;
  walletNameOrIdEnvVar: string;
  passphraseEnvVar?: string;
  vaultPathEnvVar?: string;
  addressChainIdPrefix?: string;
};

type CreateAgentRuntimeKernelOptions<TState = unknown> = {
  env?: NodeJS.ProcessEnv;
  fetch?: typeof fetch;
  owsSigners?: readonly AgentRuntimePrivateOwsSignerConfig[];
  createRuntimeOptions: (deps: {
    signing: AgentRuntimeSigningService;
  }) =>
    | (CreateAgentRuntimeOptions<TState> & {
        __internalPostgres?: AgentRuntimeInternalPostgresHooks;
      })
    | Promise<
        CreateAgentRuntimeOptions<TState> & {
          __internalPostgres?: AgentRuntimeInternalPostgresHooks;
        }
      >;
};

type AgentRuntimeSigningErrorCode =
  | 'signer_not_declared'
  | 'signer_not_configured'
  | 'unsupported_payload_kind'
  | 'invalid_payload'
  | 'invalid_signed_artifact'
  | 'wallet_lookup_failed'
  | 'signing_failed'
  | 'identity_address_missing'
  | 'confirmed_address_missing'
  | 'address_mismatch';

type AgentRuntimeSigningErrorOptions = {
  code: AgentRuntimeSigningErrorCode;
  signerRef: AgentRuntimeSignerRef;
  message: string;
  expectedAddress?: `0x${string}`;
  confirmedAddress?: `0x${string}`;
  cause?: unknown;
};

type ResolvedAgentRuntimePrivateOwsSignerConfig = AgentRuntimePrivateOwsSignerConfig & {
  walletNameOrId: string | null;
  passphrase: string | null;
  vaultPath: string | null;
};

type SupportedPayloadKind = 'transaction' | 'message' | 'typed-data';

type TransactionSigningPayload = {
  chain: string;
  unsignedTransactionHex: `0x${string}`;
};

type MessageSigningPayload = {
  chain: string;
  message: string;
  encoding?: string;
};

type TypedDataSigningPayload = {
  chain: string;
  typedDataJson: string;
};

const DEFAULT_ADDRESS_CHAIN_ID_PREFIX = 'eip155:';
const MAX_DECIMAL_TYPED_DATA_BIGINT = 1n << 128n;
const METAMASK_DELEGATION_ARTIFACT_PREFIX = 'metamask-delegation:';
const SIGNABLE_DELEGATION_TYPED_DATA = {
  EIP712Domain: [
    { name: 'name', type: 'string' },
    { name: 'version', type: 'string' },
    { name: 'chainId', type: 'uint256' },
    { name: 'verifyingContract', type: 'address' },
  ],
  Caveat: [
    { name: 'enforcer', type: 'address' },
    { name: 'terms', type: 'bytes' },
  ],
  Delegation: [
    { name: 'delegate', type: 'address' },
    { name: 'delegator', type: 'address' },
    { name: 'authority', type: 'bytes32' },
    { name: 'caveats', type: 'Caveat[]' },
    { name: 'salt', type: 'uint256' },
  ],
} as const;

export class AgentRuntimeSigningError extends Error {
  code: AgentRuntimeSigningErrorCode;
  signerRef: AgentRuntimeSignerRef;
  expectedAddress?: `0x${string}`;
  confirmedAddress?: `0x${string}`;

  constructor(options: AgentRuntimeSigningErrorOptions) {
    super(options.message, options.cause ? { cause: options.cause } : undefined);
    this.name = 'AgentRuntimeSigningError';
    this.code = options.code;
    this.signerRef = options.signerRef;
    this.expectedAddress = options.expectedAddress;
    this.confirmedAddress = options.confirmedAddress;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function readNormalizedHex(value: unknown): `0x${string}` | null {
  const normalized = readString(value);
  if (!normalized?.startsWith('0x')) {
    return null;
  }

  return normalized.toLowerCase() as `0x${string}`;
}

function readNormalizedSignature(value: unknown): `0x${string}` | null {
  const normalized = readString(value);
  if (!normalized) {
    return null;
  }

  if (normalized.startsWith('0x')) {
    return normalized.toLowerCase() as `0x${string}`;
  }

  if (!/^[0-9a-fA-F]+$/.test(normalized)) {
    return null;
  }

  return `0x${normalized.toLowerCase()}`;
}

function resolveConfiguredOwsSigners(
  env: NodeJS.ProcessEnv,
  signers: readonly AgentRuntimePrivateOwsSignerConfig[],
): Map<AgentRuntimeSignerRef, ResolvedAgentRuntimePrivateOwsSignerConfig> {
  const resolved = new Map<AgentRuntimeSignerRef, ResolvedAgentRuntimePrivateOwsSignerConfig>();

  for (const signer of signers) {
    resolved.set(signer.signerRef, {
      ...signer,
      walletNameOrId: readString(env[signer.walletNameOrIdEnvVar]),
      passphrase: signer.passphraseEnvVar ? readString(env[signer.passphraseEnvVar]) : null,
      vaultPath: signer.vaultPathEnvVar ? readString(env[signer.vaultPathEnvVar]) : null,
    });
  }

  return resolved;
}

function requireConfiguredSigner(
  signers: Map<AgentRuntimeSignerRef, ResolvedAgentRuntimePrivateOwsSignerConfig>,
  signerRef: AgentRuntimeSignerRef,
): ResolvedAgentRuntimePrivateOwsSignerConfig & { walletNameOrId: string } {
  const signer = signers.get(signerRef);
  if (!signer) {
    throw new AgentRuntimeSigningError({
      code: 'signer_not_declared',
      signerRef,
      message: `Agent runtime signer "${signerRef}" is not declared.`,
    });
  }

  if (!signer.walletNameOrId) {
    throw new AgentRuntimeSigningError({
      code: 'signer_not_configured',
      signerRef,
      message: `Agent runtime signer "${signerRef}" is not configured.`,
    });
  }

  return signer as ResolvedAgentRuntimePrivateOwsSignerConfig & { walletNameOrId: string };
}

function resolveSignerAddress(input: {
  signerRef: AgentRuntimeSignerRef;
  signer: ResolvedAgentRuntimePrivateOwsSignerConfig & { walletNameOrId: string };
  missingAddressCode: 'identity_address_missing' | 'confirmed_address_missing';
}): `0x${string}` {
  let wallet;

  try {
    wallet = getWallet(input.signer.walletNameOrId, input.signer.vaultPath ?? undefined);
  } catch (error) {
    throw new AgentRuntimeSigningError({
      code: 'wallet_lookup_failed',
      signerRef: input.signerRef,
      message: `Agent runtime signer "${input.signerRef}" wallet lookup failed.`,
      cause: error,
    });
  }

  const chainIdPrefix = input.signer.addressChainIdPrefix ?? DEFAULT_ADDRESS_CHAIN_ID_PREFIX;
  const matchingAccount = wallet.accounts.find((account) => account.chainId.startsWith(chainIdPrefix));
  const confirmedAddress = readNormalizedHex(matchingAccount?.address);

  if (!confirmedAddress) {
    throw new AgentRuntimeSigningError({
      code: input.missingAddressCode,
      signerRef: input.signerRef,
      message:
        input.missingAddressCode === 'identity_address_missing'
          ? `Agent runtime signer "${input.signerRef}" identity lookup did not resolve a wallet address.`
          : `Agent runtime signer "${input.signerRef}" could not resolve a confirmed wallet address for signing.`,
    });
  }

  return confirmedAddress;
}

function requireMatchingAddress(input: {
  signerRef: AgentRuntimeSignerRef;
  confirmedAddress: `0x${string}`;
  expectedAddress?: `0x${string}`;
}): `0x${string}` {
  if (!input.expectedAddress) {
    return input.confirmedAddress;
  }

  const expectedAddress = readNormalizedHex(input.expectedAddress);
  if (!expectedAddress) {
    throw new AgentRuntimeSigningError({
      code: 'invalid_payload',
      signerRef: input.signerRef,
      message: `Agent runtime signer "${input.signerRef}" received an invalid expected address.`,
    });
  }

  if (input.confirmedAddress !== expectedAddress) {
    throw new AgentRuntimeSigningError({
      code: 'address_mismatch',
      signerRef: input.signerRef,
      expectedAddress,
      confirmedAddress: input.confirmedAddress,
      message: `Agent runtime signer "${input.signerRef}" confirmed ${input.confirmedAddress} instead of ${expectedAddress}.`,
    });
  }

  return input.confirmedAddress;
}

function resolvePayloadKind(
  signerRef: AgentRuntimeSignerRef,
  payloadKind: string,
): SupportedPayloadKind {
  const normalized = payloadKind.trim().toLowerCase().replaceAll('_', '-');

  switch (normalized) {
    case 'transaction':
    case 'message':
    case 'typed-data':
      return normalized;
    default:
      throw new AgentRuntimeSigningError({
        code: 'unsupported_payload_kind',
        signerRef,
        message: `Agent runtime signer "${signerRef}" does not support payload kind "${payloadKind}".`,
      });
  }
}

function parseTransactionSigningPayload(
  signerRef: AgentRuntimeSignerRef,
  payload: Record<string, unknown>,
): TransactionSigningPayload {
  const chain = readString(payload['chain']);
  const unsignedTransactionHex = readNormalizedHex(payload['unsignedTransactionHex']);

  if (!chain || !unsignedTransactionHex) {
    throw new AgentRuntimeSigningError({
      code: 'invalid_payload',
      signerRef,
      message:
        `Agent runtime signer "${signerRef}" transaction payload must include ` +
        '"chain" and "unsignedTransactionHex".',
    });
  }

  return {
    chain,
    unsignedTransactionHex,
  };
}

function parseMessageSigningPayload(
  signerRef: AgentRuntimeSignerRef,
  payload: Record<string, unknown>,
): MessageSigningPayload {
  const chain = readString(payload['chain']);
  const message = readString(payload['message']);
  const encoding = readString(payload['encoding']) ?? undefined;

  if (!chain || !message) {
    throw new AgentRuntimeSigningError({
      code: 'invalid_payload',
      signerRef,
      message: `Agent runtime signer "${signerRef}" message payload must include "chain" and "message".`,
    });
  }

  return {
    chain,
    message,
    encoding,
  };
}

function parseTypedDataSigningPayload(
  signerRef: AgentRuntimeSignerRef,
  payload: Record<string, unknown>,
): TypedDataSigningPayload {
  const chain = readString(payload['chain']);
  const typedDataJson =
    readString(payload['typedDataJson']) ??
    (isRecord(payload['typedData'])
      ? JSON.stringify(payload['typedData'], (_key, value: unknown) =>
          typeof value === 'bigint'
            ? value >= MAX_DECIMAL_TYPED_DATA_BIGINT
              ? `0x${value.toString(16)}`
              : value.toString()
            : value,
        )
      : null);

  if (!chain || !typedDataJson) {
    throw new AgentRuntimeSigningError({
      code: 'invalid_payload',
      signerRef,
      message:
        `Agent runtime signer "${signerRef}" typed-data payload must include ` +
        '"chain" and "typedDataJson" or "typedData".',
    });
  }

  return {
    chain,
    typedDataJson,
  };
}

function normalizeSignedPayload(input: {
  signerRef: AgentRuntimeSignerRef;
  signature: string;
  recoveryId?: number;
}): Record<string, unknown> {
  const signature = readNormalizedSignature(input.signature);
  if (!signature) {
    throw new AgentRuntimeSigningError({
      code: 'signing_failed',
      signerRef: input.signerRef,
      message: `Agent runtime signer "${input.signerRef}" returned an invalid signature.`,
    });
  }

  return {
    signature,
    ...(typeof input.recoveryId === 'number' ? { recoveryId: input.recoveryId } : {}),
  };
}

export async function signPreparedEvmTransaction(input: {
  signing: AgentRuntimeSigningService;
  signerRef: AgentRuntimeSignerRef;
  expectedAddress?: `0x${string}`;
  chain: string;
  unsignedTransactionHex: `0x${string}`;
}): Promise<AgentRuntimeSignedEvmTransactionArtifact> {
  const signed = await input.signing.signPayload({
    signerRef: input.signerRef,
    expectedAddress: input.expectedAddress,
    payloadKind: 'transaction',
    payload: {
      chain: input.chain,
      unsignedTransactionHex: input.unsignedTransactionHex,
    },
  });
  const signature = readNormalizedSignature(signed.signedPayload.signature);

  if (!signature) {
    throw new AgentRuntimeSigningError({
      code: 'invalid_signed_artifact',
      signerRef: input.signerRef,
      expectedAddress: input.expectedAddress,
      confirmedAddress: signed.confirmedAddress,
      message: `Agent runtime signer "${input.signerRef}" did not return a usable transaction signature.`,
    });
  }

  const recoveryId =
    typeof signed.signedPayload.recoveryId === 'number' ? signed.signedPayload.recoveryId : undefined;

  try {
    const parsedTransaction = parseTransaction(input.unsignedTransactionHex);
    const parsedSignature = parseSignature(signature);

    return {
      kind: 'evm-raw-transaction',
      confirmedAddress: signed.confirmedAddress,
      signature,
      rawTransaction: serializeTransaction(parsedTransaction, parsedSignature),
      ...(typeof recoveryId === 'number' ? { recoveryId } : {}),
    };
  } catch (error) {
    throw new AgentRuntimeSigningError({
      code: 'invalid_signed_artifact',
      signerRef: input.signerRef,
      expectedAddress: input.expectedAddress,
      confirmedAddress: signed.confirmedAddress,
      message:
        `Agent runtime signer "${input.signerRef}" returned a signature that could not be serialized ` +
        'with the prepared transaction.',
      cause: error,
    });
  }
}

function encodeDelegationArtifactRef(
  delegation: AgentRuntimeSignedDelegationArtifact['delegation'],
): string {
  return `${METAMASK_DELEGATION_ARTIFACT_PREFIX}${Buffer.from(
    JSON.stringify(delegation),
    'utf8',
  ).toString('base64url')}`;
}

function buildDelegationTypedData(input: {
  signerRef: AgentRuntimeSignerRef;
  chainId: number;
  delegationManager: `0x${string}`;
  delegation: AgentRuntimeUnsignedDelegation;
  name?: string;
  version?: string;
}): Record<string, unknown> {
  let salt: bigint;

  try {
    salt = BigInt(input.delegation.salt);
  } catch (error) {
    throw new AgentRuntimeSigningError({
      code: 'invalid_payload',
      signerRef: input.signerRef,
      message: 'Prepared delegation payload included an invalid salt value.',
      cause: error,
    });
  }

  return {
    domain: {
      chainId: input.chainId,
      name: input.name ?? 'DelegationManager',
      version: input.version ?? '1',
      verifyingContract: input.delegationManager,
    },
    types: SIGNABLE_DELEGATION_TYPED_DATA,
    primaryType: 'Delegation',
    message: {
      delegate: input.delegation.delegate,
      delegator: input.delegation.delegator,
      authority: input.delegation.authority,
      caveats: input.delegation.caveats.map((caveat) => ({
        enforcer: caveat.enforcer,
        terms: caveat.terms,
      })),
      salt,
    },
  };
}

export async function signPreparedDelegation(input: {
  signing: AgentRuntimeSigningService;
  signerRef: AgentRuntimeSignerRef;
  expectedAddress?: `0x${string}`;
  chain: string;
  chainId: number;
  delegationManager: `0x${string}`;
  delegation: AgentRuntimeUnsignedDelegation;
  name?: string;
  version?: string;
}): Promise<AgentRuntimeSignedDelegationArtifact> {
  const typedData = buildDelegationTypedData({
    signerRef: input.signerRef,
    chainId: input.chainId,
    delegationManager: input.delegationManager,
    delegation: input.delegation,
    name: input.name,
    version: input.version,
  });
  const signed = await input.signing.signPayload({
    signerRef: input.signerRef,
    expectedAddress: input.expectedAddress,
    payloadKind: 'typed-data',
    payload: {
      chain: input.chain,
      typedData,
    },
  });
  const signature = readNormalizedSignature(signed.signedPayload.signature);

  if (!signature) {
    throw new AgentRuntimeSigningError({
      code: 'invalid_signed_artifact',
      signerRef: input.signerRef,
      expectedAddress: input.expectedAddress,
      confirmedAddress: signed.confirmedAddress,
      message: `Agent runtime signer "${input.signerRef}" did not return a usable delegation signature.`,
    });
  }

  const delegation = {
    ...input.delegation,
    signature,
  };

  return {
    kind: 'metamask-delegation',
    confirmedAddress: signed.confirmedAddress,
    signature,
    artifactRef: encodeDelegationArtifactRef(delegation),
    delegation,
  };
}

export function createAgentRuntimeSigningService(input: {
  env?: NodeJS.ProcessEnv;
  fetch?: typeof fetch;
  owsSigners?: readonly AgentRuntimePrivateOwsSignerConfig[];
} = {}): AgentRuntimeSigningService {
  const env = input.env ?? process.env;
  const signers = resolveConfiguredOwsSigners(env, input.owsSigners ?? []);

  return {
    readAddress({ signerRef }) {
      return Promise.resolve().then(() => {
        const signer = requireConfiguredSigner(signers, signerRef);
        return resolveSignerAddress({
          signerRef,
          signer,
          missingAddressCode: 'identity_address_missing',
        });
      });
    },

    signPayload(request) {
      return Promise.resolve().then(() => {
        const signer = requireConfiguredSigner(signers, request.signerRef);
        const confirmedAddress = requireMatchingAddress({
          signerRef: request.signerRef,
          confirmedAddress: resolveSignerAddress({
            signerRef: request.signerRef,
            signer,
            missingAddressCode: 'confirmed_address_missing',
          }),
          expectedAddress: request.expectedAddress,
        });
        const payloadKind = resolvePayloadKind(request.signerRef, request.payloadKind);

        try {
          switch (payloadKind) {
            case 'transaction': {
              const payload = parseTransactionSigningPayload(request.signerRef, request.payload);
              const result = signTransactionWithOwsCore(
                signer.walletNameOrId,
                payload.chain,
                payload.unsignedTransactionHex,
                signer.passphrase ?? undefined,
                undefined,
                signer.vaultPath ?? undefined,
              );

              return {
                confirmedAddress,
                signedPayload: normalizeSignedPayload({
                  signerRef: request.signerRef,
                  signature: result.signature,
                  recoveryId: result.recoveryId,
                }),
              };
            }

            case 'message': {
              const payload = parseMessageSigningPayload(request.signerRef, request.payload);
              const result = signMessageWithOwsCore(
                signer.walletNameOrId,
                payload.chain,
                payload.message,
                signer.passphrase ?? undefined,
                payload.encoding,
                undefined,
                signer.vaultPath ?? undefined,
              );

              return {
                confirmedAddress,
                signedPayload: normalizeSignedPayload({
                  signerRef: request.signerRef,
                  signature: result.signature,
                  recoveryId: result.recoveryId,
                }),
              };
            }

            case 'typed-data': {
              const payload = parseTypedDataSigningPayload(request.signerRef, request.payload);
              const result = signTypedDataWithOwsCore(
                signer.walletNameOrId,
                payload.chain,
                payload.typedDataJson,
                signer.passphrase ?? undefined,
                undefined,
                signer.vaultPath ?? undefined,
              );

              return {
                confirmedAddress,
                signedPayload: normalizeSignedPayload({
                  signerRef: request.signerRef,
                  signature: result.signature,
                  recoveryId: result.recoveryId,
                }),
              };
            }
          }
        } catch (error) {
          if (error instanceof AgentRuntimeSigningError) {
            throw error;
          }

          throw new AgentRuntimeSigningError({
            code: 'signing_failed',
            signerRef: request.signerRef,
            message: `Agent runtime signer "${request.signerRef}" could not sign the prepared payload.`,
            cause: error,
          });
        }
      });
    },
  };
}

export async function createAgentRuntimeKernel<TState = unknown>(
  options: CreateAgentRuntimeKernelOptions<TState>,
): Promise<AgentRuntimeKernel> {
  const signing = createAgentRuntimeSigningService({
    env: options.env,
    fetch: options.fetch,
    owsSigners: options.owsSigners,
  });
  const runtimeOptions = await options.createRuntimeOptions({
    signing,
  });
  const runtime = await createAgentRuntime(runtimeOptions as never);

  return {
    service: runtime.service,
    signing,
  };
}
