'use client';

import { z } from 'zod';

import type { AgentState } from '../hooks/useAgentConnection';
import type { OnboardingState } from '../types/agent';
import { defaultActivity, defaultMetrics, defaultProfile, defaultView } from '../types/agent';

const OnboardingStateSchema = z.object({
  step: z.number(),
  totalSteps: z.number().optional(),
  key: z.string().optional(),
}) satisfies z.ZodType<OnboardingState>;

const SyncResponseSchema = z.object({
  agentId: z.string(),

  command: z.string().nullable().optional(),
  onboarding: OnboardingStateSchema.nullable().optional(),
  setupComplete: z.boolean().nullable().optional(),
  delegationsBypassActive: z.boolean().nullable().optional(),

  profile: z.record(z.unknown()).nullable().optional(),
  metrics: z.record(z.unknown()).nullable().optional(),
  activity: z.record(z.unknown()).nullable().optional(),
  transactionHistory: z.array(z.unknown()).nullable().optional(),
  hasInterrupts: z.boolean().optional(),
  pendingInterrupt: z.unknown().nullable().optional(),

  task: z.record(z.unknown()).nullable().optional(),
  haltReason: z.string().nullable().optional(),
  executionError: z.string().nullable().optional(),
});

export type AgentSyncResponse = z.infer<typeof SyncResponseSchema>;

export function parseAgentSyncResponse(payload: unknown): AgentSyncResponse {
  return SyncResponseSchema.parse(payload);
}

export function applyAgentSyncToState(prevState: AgentState, sync: AgentSyncResponse): AgentState {
  const prevView = prevState.view ?? defaultView;
  const nextProfile = (sync.profile ?? undefined) ?? prevView.profile ?? defaultProfile;
  const nextMetrics = (sync.metrics ?? undefined) ?? prevView.metrics ?? defaultMetrics;
  const nextActivity = (sync.activity ?? undefined) ?? prevView.activity ?? defaultActivity;
  const nextTransactionHistory =
    (sync.transactionHistory ?? undefined) ?? prevView.transactionHistory ?? [];

  return {
    ...prevState,
    view: {
      ...prevView,
      command: (sync.command ?? undefined) ?? prevView.command,
      onboarding: (sync.onboarding ?? undefined) ?? prevView.onboarding,
      setupComplete: (sync.setupComplete ?? undefined) ?? prevView.setupComplete,
      delegationsBypassActive:
        (sync.delegationsBypassActive ?? undefined) ?? prevView.delegationsBypassActive,
      profile: nextProfile as typeof prevView.profile,
      metrics: nextMetrics as typeof prevView.metrics,
      activity: nextActivity as typeof prevView.activity,
      transactionHistory: nextTransactionHistory as typeof prevView.transactionHistory,
      task: (sync.task ?? undefined) ? (sync.task as unknown as typeof prevView.task) : prevView.task,
      haltReason: (sync.haltReason ?? undefined) ?? prevView.haltReason,
      executionError: (sync.executionError ?? undefined) ?? prevView.executionError,
    },
  };
}
