import {
  createPiRuntimeGatewayMockStream,
  createPiRuntimeGatewayFoundation,
  type PiRuntimeGatewayFoundation,
} from 'agent-runtime';

const DEFAULT_PI_AGENT_MODEL = 'openai/gpt-5-mini';
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const PI_EXAMPLE_SYSTEM_PROMPT =
  'You are a Pi-native local smoke-test agent. Respond clearly, keep track of the active thread state, and prefer short direct answers unless the user asks for more depth.';

type PiExampleGatewayEnv = NodeJS.ProcessEnv & {
  OPENROUTER_API_KEY?: string;
  PI_AGENT_MODEL?: string;
  DATABASE_URL?: string;
  E2E_PROFILE?: string;
  PI_AGENT_EXTERNAL_BOUNDARY_MODE?: string;
};

export type { PiExampleGatewayEnv };

type PiExampleGatewayModel = Parameters<typeof createPiRuntimeGatewayFoundation>[0]['model'];

function requireEnvValue(value: string | undefined, name: keyof PiExampleGatewayEnv): string {
  const normalized = value?.trim();
  if (!normalized) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return normalized;
}

function createOpenRouterModel(modelId: string): PiExampleGatewayModel {
  return {
    id: modelId,
    name: modelId,
    api: 'openai-responses',
    provider: 'openrouter',
    baseUrl: OPENROUTER_BASE_URL,
    reasoning: false,
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

function isMockedExternalBoundary(env: PiExampleGatewayEnv): boolean {
  return (
    env.E2E_PROFILE?.trim().toLowerCase() === 'mocked' ||
    env.PI_AGENT_EXTERNAL_BOUNDARY_MODE?.trim().toLowerCase() === 'mocked'
  );
}

export function createPiExampleGatewayFoundation(
  env: PiExampleGatewayEnv = process.env,
): PiRuntimeGatewayFoundation {
  const mockedExternalBoundary = isMockedExternalBoundary(env);
  const openRouterApiKey = mockedExternalBoundary
    ? env.OPENROUTER_API_KEY?.trim()
    : requireEnvValue(env.OPENROUTER_API_KEY, 'OPENROUTER_API_KEY');
  const modelId = env.PI_AGENT_MODEL?.trim() || DEFAULT_PI_AGENT_MODEL;

  return createPiRuntimeGatewayFoundation({
    model: createOpenRouterModel(modelId),
    systemPrompt: PI_EXAMPLE_SYSTEM_PROMPT,
    databaseUrl: env.DATABASE_URL,
    agentOptions: {
      ...(openRouterApiKey
        ? {
            getApiKey: () => openRouterApiKey,
          }
        : {}),
      ...(mockedExternalBoundary
        ? {
            streamFn: createPiRuntimeGatewayMockStream('Pi example mocked response.'),
          }
        : {}),
    },
  });
}
