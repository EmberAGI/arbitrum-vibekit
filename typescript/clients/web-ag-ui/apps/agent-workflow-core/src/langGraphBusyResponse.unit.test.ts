import { describe, expect, it } from 'vitest';

import { isLangGraphBusyStatus } from './langGraphBusyResponse.js';

describe('isLangGraphBusyStatus', () => {
  it('returns true for busy statuses', () => {
    expect(isLangGraphBusyStatus(409)).toBe(true);
    expect(isLangGraphBusyStatus(422)).toBe(true);
  });

  it('returns false for non-busy statuses', () => {
    expect(isLangGraphBusyStatus(200)).toBe(false);
    expect(isLangGraphBusyStatus(400)).toBe(false);
    expect(isLangGraphBusyStatus(500)).toBe(false);
  });
});
