import {
  CopilotRuntime,
  ExperimentalEmptyAdapter,
  copilotRuntimeNextJSAppRouterEndpoint,
  LangGraphAgent
} from "@copilotkit/runtime";
import { NextRequest } from "next/server";

// Service adapter for CopilotKit
const serviceAdapter = new ExperimentalEmptyAdapter();

// Agent configuration
const CLMM_AGENT_NAME = "agent-clmm";
const POLYMARKET_AGENT_NAME = "agent-polymarket";

// Deployment URLs for each agent
const CLMM_DEPLOYMENT_URL = process.env.LANGGRAPH_DEPLOYMENT_URL || "http://localhost:8124";
const POLYMARKET_DEPLOYMENT_URL = process.env.LANGGRAPH_POLYMARKET_URL || "http://localhost:8125";
const LANGSMITH_API_KEY = process.env.LANGSMITH_API_KEY || "";

/**
 * CLMM Agent Runtime
 * Connects to LangGraph server at port 8124
 */
const clmmRuntime = new CopilotRuntime({
  agents: {
    [CLMM_AGENT_NAME]: new LangGraphAgent({
      deploymentUrl: CLMM_DEPLOYMENT_URL,
      graphId: CLMM_AGENT_NAME,
      langsmithApiKey: LANGSMITH_API_KEY,
    }),
  }
});

/**
 * Polymarket Agent Runtime
 * Connects to LangGraph server at port 8125
 */
const polymarketRuntime = new CopilotRuntime({
  agents: {
    [POLYMARKET_AGENT_NAME]: new LangGraphAgent({
      deploymentUrl: POLYMARKET_DEPLOYMENT_URL,
      graphId: POLYMARKET_AGENT_NAME,
      langsmithApiKey: LANGSMITH_API_KEY,
    }),
  }
});

/**
 * Extract agent name from CopilotKit GraphQL request.
 * CopilotKit sends the agent name in various locations depending on the operation.
 */
function extractAgentName(body: Record<string, unknown>): string | null {
  // Log the full request body structure for debugging
  console.log('[CopilotKit Route] Request body keys:', Object.keys(body));

  const variables = body.variables as Record<string, unknown> | undefined;
  if (variables) {
    console.log('[CopilotKit Route] Variables keys:', Object.keys(variables));
  }

  // Check variables.properties.agentName
  if (variables?.properties) {
    const props = variables.properties as Record<string, unknown>;
    console.log('[CopilotKit Route] Properties keys:', Object.keys(props));
    if (typeof props.agentName === 'string') {
      return props.agentName;
    }
  }

  // Check variables.data.agentName (another common location)
  if (variables?.data) {
    const data = variables.data as Record<string, unknown>;
    if (typeof data.agentName === 'string') {
      return data.agentName;
    }
  }

  // Check direct agentName
  if (typeof body.agentName === 'string') {
    return body.agentName;
  }

  // Check variables.agentName
  if (variables && typeof variables.agentName === 'string') {
    return variables.agentName;
  }

  // Check for nested agent name in the variables
  if (variables) {
    // Recursively search for agentName in the variables
    const found = findAgentNameInObject(variables);
    if (found) {
      return found;
    }
  }

  return null;
}

/**
 * Recursively search for agentName in an object
 */
function findAgentNameInObject(obj: Record<string, unknown>, depth = 0): string | null {
  if (depth > 5) return null; // Prevent infinite recursion

  for (const [key, value] of Object.entries(obj)) {
    if (key === 'agentName' && typeof value === 'string') {
      console.log(`[CopilotKit Route] Found agentName at depth ${depth}: ${value}`);
      return value;
    }
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      const found = findAgentNameInObject(value as Record<string, unknown>, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Main CopilotKit API route.
 * Routes requests to the appropriate runtime based on agent name.
 */
export const POST = async (req: NextRequest) => {
  console.log('\n========================================');
  console.log('[CopilotKit Route] POST request received');
  console.log('========================================');

  // Clone the request to read the body
  const clonedReq = req.clone();

  let agentName: string | null = null;
  let requestBody: Record<string, unknown> | null = null;

  try {
    requestBody = await clonedReq.json() as Record<string, unknown>;
    console.log('[CopilotKit Route] Request body operationName:', requestBody?.operationName);
    agentName = extractAgentName(requestBody);
  } catch (error) {
    console.log('[CopilotKit Route] Failed to parse request body:', error);
    // If we can't parse the body, default to CLMM
  }

  // Choose the runtime based on agent name
  const isPolymarket = agentName === POLYMARKET_AGENT_NAME;
  const runtime = isPolymarket ? polymarketRuntime : clmmRuntime;
  const effectiveAgent = isPolymarket ? POLYMARKET_AGENT_NAME : CLMM_AGENT_NAME;

  console.log(`[CopilotKit Route] Agent: ${agentName || 'not specified'} → Using: ${effectiveAgent}`);

  const { handleRequest } = copilotRuntimeNextJSAppRouterEndpoint({
    runtime,
    serviceAdapter,
    endpoint: "/api/copilotkit",
  });

  return handleRequest(req);
};
