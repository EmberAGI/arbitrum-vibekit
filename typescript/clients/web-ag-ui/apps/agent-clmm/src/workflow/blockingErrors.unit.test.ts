import { describe, expect, it } from 'vitest';

import { buildClearedBlockingErrorState } from './blockingErrors.js';

describe('buildClearedBlockingErrorState', () => {
  it('returns concrete empty-string clears that survive JSON serialization', () => {
    const clearState = buildClearedBlockingErrorState();
    const serialized = JSON.parse(JSON.stringify(clearState)) as unknown;

    expect(clearState).toEqual({
      haltReason: '',
      executionError: '',
    });
    expect(serialized).toEqual({
      haltReason: '',
      executionError: '',
    });
  });
});
