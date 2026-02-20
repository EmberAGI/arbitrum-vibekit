type ViewRecord = Record<string, unknown>;

const isPlainRecord = (value: unknown): value is ViewRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const mergeNestedValue = (currentValue: unknown, patchValue: unknown): unknown => {
  if (patchValue === undefined) {
    return currentValue;
  }

  if (Array.isArray(patchValue)) {
    return patchValue;
  }

  if (isPlainRecord(currentValue) && isPlainRecord(patchValue)) {
    const merged: ViewRecord = { ...currentValue };
    for (const [key, nextValue] of Object.entries(patchValue)) {
      merged[key] = mergeNestedValue(currentValue[key], nextValue);
    }
    return merged;
  }

  return patchValue;
};

export const mergeViewPatchForEmit = <TView extends ViewRecord>(params: {
  currentView: TView;
  patchView: Partial<TView>;
  mergeWithInvariants?: (currentView: TView, patchView: Partial<TView>) => TView;
}): TView => {
  if (params.mergeWithInvariants) {
    return params.mergeWithInvariants(params.currentView, params.patchView);
  }
  const merged = mergeNestedValue(params.currentView, params.patchView);
  return merged as TView;
};
