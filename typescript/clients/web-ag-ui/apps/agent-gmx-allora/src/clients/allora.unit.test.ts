import { afterEach, describe, expect, it, vi } from 'vitest';

import { clearAlloraInferenceCache, fetchAlloraInference, parseAlloraInferenceResponse } from './allora.js';

afterEach(() => {
  clearAlloraInferenceCache();
  vi.unstubAllGlobals();
});

describe('parseAlloraInferenceResponse', () => {
  it('parses combined value and confidence intervals into numbers', () => {
    const payload = {
      network_inferences: {
        topic_id: '14',
        combined_value: '2605.5338791850806',
      },
      confidence_interval_values: [
        '2492.1675618299669',
        '2543.9249467952655',
        '2611.0331303511152',
        '2662.2952339563844',
        '2682.827040221238',
      ],
    };

    expect(parseAlloraInferenceResponse(payload)).toEqual({
      topicId: 14,
      combinedValue: Number('2605.5338791850806'),
      confidenceIntervalValues: [
        Number('2492.1675618299669'),
        Number('2543.9249467952655'),
        Number('2611.0331303511152'),
        Number('2662.2952339563844'),
        Number('2682.827040221238'),
      ],
    });
  });

  it('parses consumer inference payloads', () => {
    const payload = {
      request_id: 'abc',
      status: true,
      data: {
        inference_data: {
          network_inference: '71380522596524715399145',
          network_inference_normalized: '71380.522596524715399145',
          topic_id: '14',
        },
      },
    };

    expect(parseAlloraInferenceResponse(payload)).toEqual({
      topicId: 14,
      combinedValue: Number('71380.522596524715399145'),
      confidenceIntervalValues: [Number('71380.522596524715399145')],
    });
  });
});

describe('fetchAlloraInference caching', () => {
  it('dedupes repeated requests within the TTL', async () => {
    const fetchSpy = vi.fn(() => {
      return {
        ok: true,
        status: 200,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              status: true,
              data: { inference_data: { topic_id: '14', network_inference_normalized: '65000' } },
            }),
          ),
      } satisfies Partial<Response> as Response;
    });

    vi.stubGlobal('fetch', fetchSpy);

    const first = await fetchAlloraInference({
      baseUrl: 'http://127.0.0.1:1234',
      chainId: 'test',
      topicId: 14,
      cacheTtlMs: 60_000,
    });
    const second = await fetchAlloraInference({
      baseUrl: 'http://127.0.0.1:1234',
      chainId: 'test',
      topicId: 14,
      cacheTtlMs: 60_000,
    });

    expect(first).toEqual(second);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('re-fetches once the TTL has elapsed', async () => {
    const fetchSpy = vi.fn(() => {
      return {
        ok: true,
        status: 200,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              status: true,
              data: { inference_data: { topic_id: '14', network_inference_normalized: '65000' } },
            }),
          ),
      } satisfies Partial<Response> as Response;
    });

    vi.stubGlobal('fetch', fetchSpy);

    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-01T00:00:00.000Z'));

    await fetchAlloraInference({
      baseUrl: 'http://127.0.0.1:1234',
      chainId: 'test',
      topicId: 14,
      cacheTtlMs: 1000,
    });

    vi.setSystemTime(new Date('2025-01-01T00:00:02.000Z'));

    await fetchAlloraInference({
      baseUrl: 'http://127.0.0.1:1234',
      chainId: 'test',
      topicId: 14,
      cacheTtlMs: 1000,
    });

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});
