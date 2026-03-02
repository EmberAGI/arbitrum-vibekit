import { describe, expect, it } from 'vitest';

import {
  evaluateTransitionBudget,
  parseTransitionLogNdjson,
  summarizeTransitionChurn,
} from './stateTransitionAnalysis.js';

const sampleLog = [
  JSON.stringify({
    timestamp: '2026-02-28T03:00:00.000Z',
    source: 'threadReducer',
    patchKeys: ['task', 'activity'],
    previous: {
      taskState: 'working',
      onboardingKey: 'funding-token',
    },
    next: {
      taskState: 'input-required',
      onboardingKey: 'delegation-signing',
    },
  }),
  JSON.stringify({
    timestamp: '2026-02-28T03:00:01.000Z',
    source: 'applyThreadPatch',
    patchKeys: ['task'],
    previous: {
      taskState: 'input-required',
      onboardingKey: 'delegation-signing',
    },
    next: {
      taskState: 'working',
      onboardingKey: 'funding-token',
    },
  }),
].join('\n');

describe('stateTransitionAnalysis', () => {
  it('parses ndjson and summarizes task transition churn with writer attribution', () => {
    const entries = parseTransitionLogNdjson(sampleLog);
    const summary = summarizeTransitionChurn(entries);

    expect(summary.totalEntries).toBe(1);
    expect(summary.transitions.workingToInputRequired).toBe(1);
    expect(summary.transitions.inputRequiredToWorking).toBe(0);
    expect(summary.transitions.inputRequiredEntries).toBe(1);
    expect(summary.transitions.byWriter.workingToInputRequired).toEqual({
      'threadReducer[activity,task]': 1,
    });
    expect(summary.transitions.byWriter.inputRequiredToWorking).toEqual({});
    expect(summary.onboardingRegressions).toEqual([]);
  });

  it('can include both reducer and emit transitions for root-cause attribution', () => {
    const entries = parseTransitionLogNdjson(sampleLog);
    const summary = summarizeTransitionChurn(entries, {
      sources: ['threadReducer', 'applyThreadPatch'],
    });

    expect(summary.totalEntries).toBe(2);
    expect(summary.transitions.workingToInputRequired).toBe(1);
    expect(summary.transitions.inputRequiredToWorking).toBe(1);
    expect(summary.transitions.inputRequiredEntries).toBe(1);
    expect(summary.transitions.byWriter.workingToInputRequired).toEqual({
      'threadReducer[activity,task]': 1,
    });
    expect(summary.transitions.byWriter.inputRequiredToWorking).toEqual({
      'applyThreadPatch[task]': 1,
    });
    expect(summary.onboardingRegressions).toEqual([
      {
        timestamp: '2026-02-28T03:00:01.000Z',
        from: 'delegation-signing',
        to: 'funding-token',
        writer: 'applyThreadPatch[task]',
      },
    ]);
  });

  it('passes budget evaluation when transitions are within limits', () => {
    const entries = parseTransitionLogNdjson(sampleLog);
    const summary = summarizeTransitionChurn(entries);
    const evaluation = evaluateTransitionBudget(summary, {
      maxInputRequiredEntries: 2,
      maxWorkingToInputRequired: 2,
      maxInputRequiredToWorking: 2,
      maxOnboardingRegressions: 1,
    });

    expect(evaluation.passes).toBe(true);
    expect(evaluation.violations).toEqual([]);
  });

  it('fails budget evaluation when transitions exceed limits', () => {
    const entries = parseTransitionLogNdjson(sampleLog);
    const summary = summarizeTransitionChurn(entries, {
      sources: ['threadReducer', 'applyThreadPatch'],
    });
    const evaluation = evaluateTransitionBudget(summary, {
      maxInputRequiredEntries: 0,
      maxWorkingToInputRequired: 0,
      maxInputRequiredToWorking: 0,
      maxOnboardingRegressions: 0,
    });

    expect(evaluation.passes).toBe(false);
    expect(evaluation.violations).toEqual([
      'input-required entries 1 exceeded budget 0',
      'working -> input-required transitions 1 exceeded budget 0',
      'input-required -> working transitions 1 exceeded budget 0',
      'onboarding regressions 1 exceeded budget 0',
    ]);
  });
});
