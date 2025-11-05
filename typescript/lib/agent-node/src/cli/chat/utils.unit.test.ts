import { describe, it, expect, beforeEach, vi } from 'vitest';

import { isAgentReachable } from './utils.js';

describe('isAgentReachable (behavior)', () => {
  const baseUrl = 'http://localhost:3000';
  const cardUrl = `${baseUrl}/.well-known/agent-card.json`;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns true when HEAD is 302 (3xx accepted)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 302 });
    // @ts-expect-error override global fetch for test
    global.fetch = fetchMock;

    const result = await isAgentReachable(baseUrl, 500);
    expect(result).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(cardUrl, expect.objectContaining({ method: 'HEAD' }));
  });

  it('falls back to GET when HEAD is 405 and then returns true on 200', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 405 }) // HEAD not allowed
      .mockResolvedValueOnce({ ok: true, status: 200 }); // GET success
    // @ts-expect-error override global fetch for test
    global.fetch = fetchMock;

    const result = await isAgentReachable(baseUrl, 500);
    expect(result).toBe(true);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      cardUrl,
      expect.objectContaining({ method: 'HEAD' }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      cardUrl,
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('returns false on timeout (AbortError)', async () => {
    const abortErr = new Error('Aborted');
    // @ts-expect-error add name
    abortErr.name = 'AbortError';
    const fetchMock = vi.fn().mockRejectedValue(abortErr);
    // @ts-expect-error override global fetch for test
    global.fetch = fetchMock;

    const result = await isAgentReachable(baseUrl, 1);
    expect(result).toBe(false);
  });

  it('returns false on network error', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    // @ts-expect-error override global fetch for test
    global.fetch = fetchMock;

    const result = await isAgentReachable(baseUrl, 500);
    expect(result).toBe(false);
  });
});
