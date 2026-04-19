import { describe, expect, it } from 'vitest';

import { startManagedSharedEmberHarness } from '../../../scripts/smoke/support/runtimePrep.ts';

describe('managed Shared Ember harness bootstrap', () => {
  it('passes the managed planner agent env through startManagedSharedEmberHarness', async () => {
    const previousPlannerAgentIds = process.env.SHARED_EMBER_ONCHAIN_ACTIONS_PLANNER_AGENT_IDS;
    process.env.SHARED_EMBER_ONCHAIN_ACTIONS_PLANNER_AGENT_IDS = 'alpha';

    let capturedBootstrapEnv: NodeJS.ProcessEnv | undefined;
    let capturedBootstrap: Record<string, unknown> | undefined;

    try {
      const server = await startManagedSharedEmberHarness(
        {
          specRoot: '/spec-root',
          vibekitRoot: '/vibekit-root',
          managedAgentId: 'ember-lending',
          host: '127.0.0.1',
          port: 4010,
        },
        {
          resolveReferenceBootstrap: async (env) => {
            capturedBootstrapEnv = env;

            return {
              emberSkillPlanners: {
                [env?.SHARED_EMBER_ONCHAIN_ACTIONS_PLANNER_AGENT_IDS ?? 'missing']: {
                  planLendingSupply: async () => ({
                    transaction_plan_id: 'txplan-test',
                  }),
                },
              },
            };
          },
          createManagedOnboardingIssuers: async () => undefined,
          createSubagentRuntimes: async () => ({
            'ember-lending': {
              submissionBackend: {
                submitSignedTransaction: async () => ({
                  execution: { status: 'submitted' },
                }),
              },
            },
          }),
          startServer: async ({ bootstrap }) => {
            capturedBootstrap = bootstrap;
            return {
              baseUrl: 'http://127.0.0.1:4010',
              close: async () => {},
            };
          },
        },
      );

      expect(server.baseUrl).toBe('http://127.0.0.1:4010');
      expect(
        capturedBootstrapEnv?.SHARED_EMBER_ONCHAIN_ACTIONS_PLANNER_AGENT_IDS?.split(','),
      ).toEqual(['alpha', 'ember-lending']);
      expect(
        Object.keys((capturedBootstrap?.emberSkillPlanners as Record<string, unknown>) ?? {}),
      ).toEqual(['alpha,ember-lending']);
    } finally {
      if (previousPlannerAgentIds === undefined) {
        delete process.env.SHARED_EMBER_ONCHAIN_ACTIONS_PLANNER_AGENT_IDS;
      } else {
        process.env.SHARED_EMBER_ONCHAIN_ACTIONS_PLANNER_AGENT_IDS = previousPlannerAgentIds;
      }
    }
  });

  it('fails fast when the managed subagent runtime binding is missing', async () => {
    await expect(
      startManagedSharedEmberHarness(
        {
          specRoot: '/spec-root',
          vibekitRoot: '/vibekit-root',
          managedAgentId: 'ember-lending',
          host: '127.0.0.1',
          port: 4010,
        },
        {
          resolveReferenceBootstrap: async () => ({
            emberSkillPlanners: {
              'ember-lending': {
                planLendingSupply: async () => ({
                  transaction_plan_id: 'txplan-test',
                }),
              },
            },
          }),
          createManagedOnboardingIssuers: async () => undefined,
          createSubagentRuntimes: async () => undefined,
          startServer: async () => {
            throw new Error('startServer should not be called without a runtime binding');
          },
        },
      ),
    ).rejects.toThrow(
      'Managed Shared Ember bootstrap requires a seeded subagent runtime binding for ember-lending.',
    );
  });
});
