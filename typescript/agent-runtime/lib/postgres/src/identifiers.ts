import crypto from 'node:crypto';

const PI_RUNTIME_UUID_PREFIX = 'pi-runtime';

function formatUuidFromHex(hex: string): string {
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export function buildPiRuntimeStableUuid(scope: string, key: string): string {
  const bytes = crypto.createHash('sha256').update(`${PI_RUNTIME_UUID_PREFIX}:${scope}:${key}`).digest().subarray(0, 16);

  // Normalize the digest into an RFC 4122 version-5/variant-1 UUID.
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  return formatUuidFromHex(Buffer.from(bytes).toString('hex'));
}

export function buildPiRuntimeDirectExecutionRecordIds(threadKey: string): {
  threadId: string;
  executionId: string;
  interruptId: string;
  artifactId: string;
} {
  return {
    threadId: buildPiRuntimeStableUuid('thread', threadKey),
    executionId: buildPiRuntimeStableUuid('execution', threadKey),
    interruptId: buildPiRuntimeStableUuid('interrupt', threadKey),
    artifactId: buildPiRuntimeStableUuid('artifact', threadKey),
  };
}
