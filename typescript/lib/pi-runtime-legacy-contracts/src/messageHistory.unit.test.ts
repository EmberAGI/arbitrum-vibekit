import { describe, expect, it } from 'vitest';

import { createMessageHistoryReducer, mergeMessageHistory } from './messageHistory.js';

describe('mergeMessageHistory', () => {
  it('does not duplicate when right is the same snapshot reference', () => {
    const snapshot = [{ id: '1' }];
    const result = mergeMessageHistory({
      left: snapshot,
      right: snapshot,
      limit: 100,
    });
    expect(result).toBe(snapshot);
  });

  it('replaces when right is a full-prefix snapshot', () => {
    const m1 = { id: '1' };
    const m2 = { id: '2' };
    const m3 = { id: '3' };
    const right = [m1, m2, m3];
    const result = mergeMessageHistory({
      left: [m1, m2],
      right,
      limit: 100,
    });
    expect(result).toBe(right);
  });

  it('replaces when right is a semantic full-prefix snapshot with reconstructed objects', () => {
    const left = [
      { id: '1', role: 'user', content: '{"command":"sync","clientMutationId":"m-1"}' },
      { id: '2', role: 'user', content: '{"command":"cycle","clientMutationId":"m-2"}' },
    ];
    const right = [
      { id: '1', role: 'user', content: '{"command":"sync","clientMutationId":"m-1"}' },
      { id: '2', role: 'user', content: '{"command":"cycle","clientMutationId":"m-2"}' },
      { id: '3', role: 'user', content: '{"command":"cycle","clientMutationId":"m-3"}' },
    ];

    const result = mergeMessageHistory({
      left,
      right,
      limit: 100,
    });

    expect(result).toBe(right);
  });

  it('appends when right is a delta', () => {
    const m1 = { id: '1' };
    const m2 = { id: '2' };
    const m3 = { id: '3' };
    const result = mergeMessageHistory({
      left: [m1, m2],
      right: [m3],
      limit: 100,
    });
    expect(result).toEqual([m1, m2, m3]);
  });

  it('applies history limit after merge', () => {
    const result = mergeMessageHistory({
      left: [{ id: '1' }, { id: '2' }],
      right: [{ id: '3' }, { id: '4' }],
      limit: 3,
    });
    expect(result).toEqual([{ id: '2' }, { id: '3' }, { id: '4' }]);
  });

  it('creates reducers that resolve limits lazily', () => {
    let limit = 2;
    const reducer = createMessageHistoryReducer<{ id: string }>(() => limit);
    expect(reducer([{ id: '1' }], [{ id: '2' }, { id: '3' }])).toEqual([
      { id: '2' },
      { id: '3' },
    ]);

    limit = 4;
    expect(reducer([{ id: '1' }], [{ id: '2' }, { id: '3' }])).toEqual([
      { id: '1' },
      { id: '2' },
      { id: '3' },
    ]);
  });
});
