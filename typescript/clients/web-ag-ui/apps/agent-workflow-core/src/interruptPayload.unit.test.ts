import { describe, expect, it } from 'vitest';

import { decodeInterruptPayload, requestInterruptPayload } from './index';

describe('interruptPayload', () => {
  it('parses JSON string payloads returned by interrupt()', () => {
    expect(
      decodeInterruptPayload(
        JSON.stringify({
          outcome: 'signed',
          value: 1,
        }),
      ),
    ).toEqual({
      outcome: 'signed',
      value: 1,
    });
  });

  it('returns original value when payload is not a JSON string', () => {
    const payload = { acknowledged: true };
    expect(decodeInterruptPayload(payload)).toBe(payload);
    expect(decodeInterruptPayload(42)).toBe(42);
  });

  it('returns original string when payload is not valid JSON', () => {
    expect(decodeInterruptPayload('{invalid-json')).toBe('{invalid-json');
  });

  it('requests interrupt payloads and returns both raw and decoded values', async () => {
    const result = await requestInterruptPayload({
      request: { type: 'input-request' },
      interrupt: async () =>
        JSON.stringify({
          outcome: 'signed',
          approvals: 2,
        }),
    });

    expect(result.raw).toBe('{"outcome":"signed","approvals":2}');
    expect(result.decoded).toEqual({
      outcome: 'signed',
      approvals: 2,
    });
  });
});
