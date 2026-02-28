type ThreadRecord = Record<string, unknown>;

const isPlainRecord = (value: unknown): value is ThreadRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const mergeNestedValue = (currentValue: unknown, patchValue: unknown): unknown => {
  if (patchValue === undefined) {
    return currentValue;
  }

  if (Array.isArray(patchValue)) {
    return patchValue;
  }

  if (isPlainRecord(currentValue) && isPlainRecord(patchValue)) {
    const merged: ThreadRecord = { ...currentValue };
    for (const [key, nextValue] of Object.entries(patchValue)) {
      merged[key] = mergeNestedValue(currentValue[key], nextValue);
    }
    return merged;
  }

  return patchValue;
};

export const mergeThreadPatchForEmit = <TThread extends ThreadRecord>(params: {
  currentThread: TThread;
  patchThread: Partial<TThread>;
  mergeWithInvariants?: (currentThread: TThread, patchThread: Partial<TThread>) => TThread;
}): TThread => {
  if (params.mergeWithInvariants) {
    return params.mergeWithInvariants(params.currentThread, params.patchThread);
  }
  const merged = mergeNestedValue(params.currentThread, params.patchThread);
  return merged as TThread;
};
