import { describe, expect, it } from 'vitest';

import { buildPiRuntimeDirectExecutionRecordIds, buildPiRuntimeStableUuid } from './index.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('Pi runtime stable identifiers', () => {
  it('builds deterministic UUIDs for persisted runtime records', () => {
    const threadUuid = buildPiRuntimeStableUuid('thread', 'smoke-thread');
    const repeatThreadUuid = buildPiRuntimeStableUuid('thread', 'smoke-thread');
    const executionUuid = buildPiRuntimeStableUuid('execution', 'smoke-thread');

    expect(threadUuid).toMatch(UUID_PATTERN);
    expect(repeatThreadUuid).toBe(threadUuid);
    expect(executionUuid).toMatch(UUID_PATTERN);
    expect(executionUuid).not.toBe(threadUuid);
  });

  it('builds the canonical persisted identifiers for a direct execution thread key', () => {
    expect(buildPiRuntimeDirectExecutionRecordIds('smoke-thread')).toEqual({
      threadId: expect.stringMatching(UUID_PATTERN),
      executionId: expect.stringMatching(UUID_PATTERN),
      interruptId: expect.stringMatching(UUID_PATTERN),
      artifactId: expect.stringMatching(UUID_PATTERN),
    });
  });
});
