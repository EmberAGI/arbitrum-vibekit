import { describe, expect, it } from 'vitest';

import { parseAlloraInferenceResponse } from './allora.js';

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
