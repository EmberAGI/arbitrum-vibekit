import crypto from 'node:crypto';

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export type PiOutboxIntentRecord = {
  outboxId: string;
  executionId: string;
  threadId: string;
  walletAddress: string;
  actionKind: string;
  actionFingerprint: string;
  intentPayload: JsonValue;
  status: 'pending';
  availableAt: Date;
  deliveredAt: null;
  createdAt: Date;
};

export type PiOutboxRecoveryRecord = {
  outboxId: string;
  status: 'pending' | 'delivered' | 'failed';
  availableAt: Date;
  deliveredAt: Date | null;
};

function stableStringify(value: JsonValue): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right));
    return `{${entries
      .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`)
      .join(',')}}`;
  }

  return JSON.stringify(value);
}

export function buildActionFingerprint(params: {
  walletAddress: string;
  actionKind: string;
  intentPayload: JsonValue;
}): string {
  const normalized = stableStringify({
    walletAddress: params.walletAddress.toLowerCase(),
    actionKind: params.actionKind,
    intentPayload: params.intentPayload,
  });

  return crypto.createHash('sha256').update(normalized).digest('hex');
}

export function createOutboxIntent(params: {
  outboxId: string;
  executionId: string;
  threadId: string;
  walletAddress: string;
  actionKind: string;
  intentPayload: JsonValue;
  availableAt: Date;
  createdAt: Date;
}): PiOutboxIntentRecord {
  return {
    outboxId: params.outboxId,
    executionId: params.executionId,
    threadId: params.threadId,
    walletAddress: params.walletAddress,
    actionKind: params.actionKind,
    actionFingerprint: buildActionFingerprint({
      walletAddress: params.walletAddress,
      actionKind: params.actionKind,
      intentPayload: params.intentPayload,
    }),
    intentPayload: params.intentPayload,
    status: 'pending',
    availableAt: params.availableAt,
    deliveredAt: null,
    createdAt: params.createdAt,
  };
}

export function recoverPendingOutboxIntents(params: {
  now: Date;
  intents: readonly PiOutboxRecoveryRecord[];
}): PiOutboxRecoveryRecord[] {
  return params.intents.filter(
    (intent) => intent.status === 'pending' && intent.availableAt <= params.now && intent.deliveredAt === null,
  );
}
