import { CopilotRuntime, createCopilotEndpointSingleRoute } from '@copilotkit/runtime/v2';
import { LangGraphAgent } from '@copilotkit/runtime/langgraph';
import { NextRequest } from 'next/server';

// 1. You can use any service adapter here for multi-agent support. We use
//    the empty adapter since we're only using one agent.
const CLMM_AGENT_NAME = 'agent-clmm';
const LEGACY_AGENT_NAME = 'starterAgent';

// 2. Create the CopilotRuntime instance and utilize the LangGraph AG-UI
//    integration to setup the connection.
const runtime = new CopilotRuntime({
  agents: {
    [CLMM_AGENT_NAME]: new LangGraphAgent({
      deploymentUrl: process.env.LANGGRAPH_DEPLOYMENT_URL || 'http://localhost:8124',
      graphId: CLMM_AGENT_NAME,
      langsmithApiKey: process.env.LANGSMITH_API_KEY || '',
    }),
    [LEGACY_AGENT_NAME]: new LangGraphAgent({
      deploymentUrl: process.env.LANGGRAPH_DEPLOYMENT_URL || 'http://localhost:8124',
      graphId: LEGACY_AGENT_NAME,
      langsmithApiKey: process.env.LANGSMITH_API_KEY || '',
    }),
  },
});

const endpoint = createCopilotEndpointSingleRoute({
  runtime,
  basePath: '/api/copilotkit',
});

// 3. Build a Next.js API route that handles the CopilotKit runtime requests.
export const POST = async (req: NextRequest) => endpoint.fetch(req);
