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
  delegationsBypassActive: z.boolean().nullable().optional(),

  profile: z.record(z.unknown()).nullable().optional(),
  metrics: z.record(z.unknown()).nullable().optional(),
  activity: z.record(z.unknown()).nullable().optional(),
  transactionHistory: z.array(z.unknown()).nullable().optional(),

  // Polymarket agent fields
  detectedRelationships: z.array(z.unknown()).nullable().optional(),
  opportunities: z.array(z.unknown()).nullable().optional(),
  crossMarketOpportunities: z.array(z.unknown()).nullable().optional(),
  markets: z.array(z.unknown()).nullable().optional(),
  positions: z.array(z.unknown()).nullable().optional(),
  portfolioValueUsd: z.number().nullable().optional(),

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

  // Polymarket agent fields
  const nextDetectedRelationships =
    (sync.detectedRelationships ?? undefined) ?? prevView.detectedRelationships ?? [];
  const nextOpportunities = (sync.opportunities ?? undefined) ?? prevView.opportunities ?? [];
  const nextCrossMarketOpportunities =
    (sync.crossMarketOpportunities ?? undefined) ?? prevView.crossMarketOpportunities ?? [];
  const nextMarkets = (sync.markets ?? undefined) ?? prevView.markets ?? [];
  const nextPositions = (sync.positions ?? undefined) ?? prevView.positions ?? [];
  const nextPortfolioValueUsd =
    (sync.portfolioValueUsd ?? undefined) ?? prevView.portfolioValueUsd ?? 0;

  return {
    ...prevState,
    view: {
      ...prevView,
      command: (sync.command ?? undefined) ?? prevView.command,
      onboarding: (sync.onboarding ?? undefined) ?? prevView.onboarding,
      delegationsBypassActive:
        (sync.delegationsBypassActive ?? undefined) ?? prevView.delegationsBypassActive,
      profile: nextProfile as typeof prevView.profile,
      metrics: nextMetrics as typeof prevView.metrics,
      activity: nextActivity as typeof prevView.activity,
      transactionHistory: nextTransactionHistory as typeof prevView.transactionHistory,
      // Polymarket agent fields
      detectedRelationships: nextDetectedRelationships as typeof prevView.detectedRelationships,
      opportunities: nextOpportunities as typeof prevView.opportunities,
      crossMarketOpportunities:
        nextCrossMarketOpportunities as typeof prevView.crossMarketOpportunities,
      markets: nextMarkets as typeof prevView.markets,
      positions: nextPositions as typeof prevView.positions,
      portfolioValueUsd: nextPortfolioValueUsd as typeof prevView.portfolioValueUsd,
      task: (sync.task ?? undefined) ? (sync.task as unknown as typeof prevView.task) : prevView.task,
      haltReason: (sync.haltReason ?? undefined) ?? prevView.haltReason,
      executionError: (sync.executionError ?? undefined) ?? prevView.executionError,
    },
  };
}
