import type {
  AgentRuntimeDomainConfig,
  CreateAgentRuntimeOptions,
} from 'agent-runtime';

const DEFAULT_EMBER_LENDING_MODEL = 'openai/gpt-5.4-mini';
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const EMBER_LENDING_SYSTEM_PROMPT =
  'You are the Ember lending managed subagent running on agent-runtime. Stay concise, operate only within the current mandate, and escalate whenever the bounded Shared Ember surface cannot safely complete the request.';

export type EmberLendingLifecycleState = {
  phase: 'prehire' | 'onboarding' | 'active' | 'firing' | 'inactive';
  mandateSummary: string | null;
  walletAddress: `0x${string}` | null;
  lastReservationSummary: string | null;
  lastCandidatePlanSummary: string | null;
  lastExecutionTxHash: `0x${string}` | null;
  lastEscalationSummary: string | null;
};

export type EmberLendingGatewayEnv = NodeJS.ProcessEnv & {
  OPENROUTER_API_KEY?: string;
  EMBER_LENDING_MODEL?: string;
  DATABASE_URL?: string;
};

type EmberLendingAgentRuntimeOptions = CreateAgentRuntimeOptions<EmberLendingLifecycleState>;

export type EmberLendingAgentConfig = Pick<
  EmberLendingAgentRuntimeOptions,
  'agentOptions' | 'databaseUrl' | 'domain' | 'model' | 'systemPrompt' | 'tools'
>;

type EmberLendingGatewayModel = EmberLendingAgentConfig['model'];

function buildDefaultLifecycleState(): EmberLendingLifecycleState {
  return {
    phase: 'prehire',
    mandateSummary: null,
    walletAddress: null,
    lastReservationSummary: null,
    lastCandidatePlanSummary: null,
    lastExecutionTxHash: null,
    lastEscalationSummary: null,
  };
}

function requireEnvValue(
  value: string | undefined,
  name: keyof EmberLendingGatewayEnv,
): string {
  const normalized = value?.trim();
  if (!normalized) {
    throw new Error(`Missing required env var: ${name}`);
  }

  return normalized;
}

function createOpenRouterModel(modelId: string): EmberLendingGatewayModel {
  return {
    id: modelId,
    name: modelId,
    api: 'openai-responses',
    provider: 'openrouter',
    baseUrl: OPENROUTER_BASE_URL,
    reasoning: true,
    input: ['text'],
    cost: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
    },
    contextWindow: 128_000,
    maxTokens: 4_096,
  };
}

function createEmberLendingDomain(): AgentRuntimeDomainConfig<EmberLendingLifecycleState> {
  return {
    lifecycle: {
      initialPhase: 'prehire',
      phases: ['prehire', 'onboarding', 'active', 'firing', 'inactive'],
      terminalPhases: [],
      commands: [
        {
          name: 'hire',
          description: 'Activate the lending subagent on the public PI runtime path.',
        },
        {
          name: 'fire',
          description: 'Deactivate the lending subagent and move it into the inactive phase.',
        },
        {
          name: 'read_portfolio_state',
          description: 'Read the current Shared Ember portfolio state for this managed lending lane.',
        },
        {
          name: 'materialize_candidate_plan',
          description: 'Ask Shared Ember to materialize a candidate transaction plan for the lending lane.',
        },
        {
          name: 'execute_transaction_plan',
          description: 'Execute the admitted lending transaction plan through the bounded Shared Ember surface.',
        },
        {
          name: 'create_escalation_request',
          description: 'Create a bounded escalation request when the lending lane cannot proceed locally.',
        },
      ],
      transitions: [],
      interrupts: [],
    },
    systemContext: ({ state }) => {
      const currentState = state ?? buildDefaultLifecycleState();
      const context = ['<ember_lending_context>'];

      context.push(`  <lifecycle_phase>${currentState.phase}</lifecycle_phase>`);

      if (currentState.mandateSummary) {
        context.push(`  <mandate_summary>${currentState.mandateSummary}</mandate_summary>`);
      }

      if (currentState.walletAddress) {
        context.push(`  <wallet_address>${currentState.walletAddress}</wallet_address>`);
      }

      if (currentState.lastReservationSummary) {
        context.push(
          `  <last_reservation_summary>${currentState.lastReservationSummary}</last_reservation_summary>`,
        );
      }

      if (currentState.lastCandidatePlanSummary) {
        context.push(
          `  <last_candidate_plan_summary>${currentState.lastCandidatePlanSummary}</last_candidate_plan_summary>`,
        );
      }

      if (currentState.lastExecutionTxHash) {
        context.push(
          `  <last_execution_tx_hash>${currentState.lastExecutionTxHash}</last_execution_tx_hash>`,
        );
      }

      if (currentState.lastEscalationSummary) {
        context.push(
          `  <last_escalation_summary>${currentState.lastEscalationSummary}</last_escalation_summary>`,
        );
      }

      context.push('</ember_lending_context>');

      return context;
    },
    handleOperation: ({ operation, state }) => {
      const currentState = state ?? buildDefaultLifecycleState();

      switch (operation.name) {
        case 'hire':
          return {
            state: {
              ...currentState,
              phase: 'active',
            },
            outputs: {
              status: {
                executionStatus: 'completed',
                statusMessage: 'Ember lending subagent activated.',
              },
            },
          };
        case 'fire':
          return {
            state: {
              ...currentState,
              phase: 'inactive',
            },
            outputs: {
              status: {
                executionStatus: 'completed',
                statusMessage: 'Ember lending subagent deactivated.',
              },
            },
          };
        default:
          return {
            state: currentState,
            outputs: {},
          };
      }
    },
  };
}

export function createEmberLendingAgentConfig(
  env: EmberLendingGatewayEnv = process.env,
): EmberLendingAgentConfig {
  const apiKey = requireEnvValue(env.OPENROUTER_API_KEY, 'OPENROUTER_API_KEY');
  const modelId = env.EMBER_LENDING_MODEL?.trim() || DEFAULT_EMBER_LENDING_MODEL;

  return {
    model: createOpenRouterModel(modelId),
    systemPrompt: EMBER_LENDING_SYSTEM_PROMPT,
    databaseUrl: env.DATABASE_URL,
    tools: [],
    domain: createEmberLendingDomain(),
    agentOptions: {
      initialState: {
        thinkingLevel: 'low',
      },
      getApiKey: () => apiKey,
    },
  };
}
