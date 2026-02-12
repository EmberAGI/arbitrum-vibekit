import {
  CopilotRuntime,
  ExperimentalEmptyAdapter,
  copilotRuntimeNextJSAppRouterEndpoint,
} from '@copilotkit/runtime';
import { LangGraphAgent } from '@copilotkit/runtime/langgraph';
import { NextRequest } from 'next/server';

// Service adapter for CopilotKit
const serviceAdapter = new ExperimentalEmptyAdapter();

const CLMM_AGENT_NAME = 'agent-clmm';
const PENDLE_AGENT_NAME = 'agent-pendle';
const GMX_ALLORA_AGENT_NAME = 'agent-gmx-allora';
const STARTER_AGENT_NAME = 'starterAgent';
const POLYMARKET_AGENT_NAME = 'agent-polymarket';

// // Deployment URLs for each agent
// const CLMM_DEPLOYMENT_URL = process.env.LANGGRAPH_DEPLOYMENT_URL || 'http://localhost:8124';
// const POLYMARKET_DEPLOYMENT_URL =
//   process.env.LANGGRAPH_POLYMARKET_DEPLOYMENT_URL || 'http://localhost:8127';
// const LANGSMITH_API_KEY = process.env.LANGSMITH_API_KEY || '';

/**
 * CLMM Agent Runtime
 * Connects to LangGraph server at port 8124
 */
const runtime = new CopilotRuntime({
  agents: {
    [CLMM_AGENT_NAME]: new LangGraphAgent({
      deploymentUrl: process.env.LANGGRAPH_DEPLOYMENT_URL || 'http://localhost:8124',
      graphId: CLMM_AGENT_NAME,
      langsmithApiKey: process.env.LANGSMITH_API_KEY || '',
    }),
    [PENDLE_AGENT_NAME]: new LangGraphAgent({
      deploymentUrl: process.env.LANGGRAPH_PENDLE_DEPLOYMENT_URL || 'http://localhost:8125',
      graphId: PENDLE_AGENT_NAME,
      langsmithApiKey: process.env.LANGSMITH_API_KEY || '',
    }),
    [GMX_ALLORA_AGENT_NAME]: new LangGraphAgent({
      deploymentUrl: process.env.LANGGRAPH_GMX_ALLORA_DEPLOYMENT_URL || 'http://localhost:8126',
      graphId: GMX_ALLORA_AGENT_NAME,
      langsmithApiKey: process.env.LANGSMITH_API_KEY || '',
    }),
    [POLYMARKET_AGENT_NAME]: new LangGraphAgent({
      deploymentUrl: process.env.LANGGRAPH_POLYMARKET_DEPLOYMENT_URL || 'http://localhost:8127',
      graphId: POLYMARKET_AGENT_NAME,
      langsmithApiKey: process.env.LANGSMITH_API_KEY || '',
    }),
    [STARTER_AGENT_NAME]: new LangGraphAgent({
      deploymentUrl: 'http://localhost:8123',
      graphId: STARTER_AGENT_NAME,
      langsmithApiKey: process.env.LANGSMITH_API_KEY || '',
    }),
  },
});

// 3. Build a Next.js API route that handles the CopilotKit runtime requests.
// export const POST = async (req: NextRequest) => {
//   console.log('\n========================================');
//   console.log('[CopilotKit Route] POST request received');
//   console.log('========================================');

//   // Clone the request to read the body
//   const clonedReq = req.clone();

//   let agentName: string | null = null;
//   let requestBody: Record<string, unknown> | null = null;

//   try {
//     requestBody = (await clonedReq.json()) as Record<string, unknown>;
//     console.log('[CopilotKit Route] Request body operationName:', requestBody?.operationName);
//     agentName = extractAgentName(requestBody);
//   } catch (error) {
//     console.log('[CopilotKit Route] Failed to parse request body:', error);
//     // If we can't parse the body, default to CLMM
//   }

//   //   // Choose the runtime based on agent name
//   //   const isPolymarket = agentName === POLYMARKET_AGENT_NAME;
//   //   const runtime = isPolymarket ? polymarketRuntime : clmmRuntime;
//   //   const effectiveAgent = isPolymarket ? POLYMARKET_AGENT_NAME : CLMM_AGENT_NAME;

//   console.log(
//     `[CopilotKit Route] Agent: ${agentName || 'not specified'} → Using: ${effectiveAgent}`,
//   );

//   const { handleRequest } = copilotRuntimeNextJSAppRouterEndpoint({
//     runtime,
//     serviceAdapter,
//     endpoint: '/api/copilotkit',
//   });

//   return handleRequest(req);
// };

// 3. Build a Next.js API route that handles the CopilotKit runtime requests.
export const POST = async (req: NextRequest) => {
  const { handleRequest } = copilotRuntimeNextJSAppRouterEndpoint({
    runtime,
    serviceAdapter,
    endpoint: '/api/copilotkit',
  });

  return handleRequest(req);
};
