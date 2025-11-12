import type { Server } from 'http';

import { createA2AServer } from '../../src/a2a/server.js';
import { initFromConfigWorkspace, type AgentConfigHandle } from '../../src/config/runtime/init.js';
import type { ServiceConfig } from '../../src/config.js';

import { createTestConfigWorkspace } from './test-config-workspace.js';

/**
 * Creates a test A2A server with proper configuration structure
 * This helper ensures all integration tests use the correct ServerConfig format
 *
 * @param overrides - Optional configuration overrides
 * @returns Object containing server, agentConfigHandle, and configDir for cleanup
 */
export async function createTestA2AServer(overrides?: {
  port?: number;
  host?: string;
  baseUrl?: string;
  agentName?: string;
  agentUrl?: string;
  skills?: Array<{ id: string; name: string; mcpServers?: string[] }>;
  mcpServers?: Record<string, unknown>;
}): Promise<{
  server: Server;
  agentConfigHandle: AgentConfigHandle;
  configDir: string;
}> {
  // Create minimal ServiceConfig for testing
  // Load API keys from environment for test execution
  const serviceConfig: ServiceConfig = {
    server: {
      port: overrides?.port ?? 0, // 0 = random available port
      host: overrides?.host ?? '127.0.0.1',
      // Only set baseUrl if explicitly provided in overrides
      // Otherwise let server derive it from request headers (Host header)
      // This is important for tests using port: 0 (random port)
      baseUrl: overrides?.baseUrl ?? '',
    },
    a2a: {},
    logging: {
      enabled: false, // Disable logging in tests unless debugging
      level: 'error',
      structured: false,
    },
    ai: {
      provider: 'openrouter',
      openRouterApiKey: process.env['OPENROUTER_API_KEY'],
      openaiApiKey: process.env['OPENAI_API_KEY'],
      xaiApiKey: process.env['XAI_API_KEY'],
      hyperbolicApiKey: process.env['HYPERBOLIC_API_KEY'],
    },
    agent: {
      maxSteps: 100,
    },
  };

  // Create test config workspace with minimal agent configuration
  const configDir = createTestConfigWorkspace({
    agentName: overrides?.agentName ?? 'Test Agent',
    agentUrl: overrides?.agentUrl,
    skills: overrides?.skills,
    mcpServers: overrides?.mcpServers,
  });

  // Initialize agent config from test workspace
  const agentConfigHandle = await initFromConfigWorkspace({
    root: configDir,
    dev: false,
  });

  // Create server with proper ServerConfig structure
  const server = await createA2AServer({
    serviceConfig,
    agentConfig: agentConfigHandle,
  });

  // Wait for server to be listening (necessary for port: 0)
  // This ensures the server is ready before tests try to connect
  await new Promise<void>((resolve) => {
    if (server.listening) {
      resolve();
    } else {
      server.once('listening', () => resolve());
    }
  });

  return { server, agentConfigHandle, configDir };
}

/**
 * Cleanup helper for test servers created with createTestA2AServer
 * Closes both the server and the agent config handle
 */
export async function cleanupTestServer(
  server: Server,
  agentConfigHandle: AgentConfigHandle,
): Promise<void> {
  // Clean up agent config handle first
  if (agentConfigHandle) {
    await agentConfigHandle.close();
  }

  // Then clean up server
  if (server) {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  }
}
