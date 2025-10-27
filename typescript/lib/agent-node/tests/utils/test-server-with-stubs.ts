import type { Server } from 'http';

import {
  DefaultRequestHandler,
  InMemoryTaskStore,
  DefaultExecutionEventBusManager,
} from '@a2a-js/sdk/server';
import { A2AExpressApp } from '@a2a-js/sdk/server/express';
import type { Tool } from 'ai';
import express from 'express';
import { z } from 'zod';

import { createAgentExecutor } from '../../src/a2a/agentExecutor.js';
import { ContextManager } from '../../src/a2a/sessions/manager.js';
import { workflowToCoreTools } from '../../src/ai/adapters.js';
import { AIService } from '../../src/ai/service.js';
import { initFromConfigWorkspace, type AgentConfigHandle } from '../../src/config/runtime/init.js';
import type { ServiceConfig } from '../../src/config.js';
import { Logger } from '../../src/utils/logger.js';
import { WorkflowRuntime } from '../../src/workflows/runtime.js';

import { createTestConfigWorkspace } from './test-config-workspace.js';

/**
 * Creates a test A2A server with the ability to inject custom services (like AI service)
 * This is specifically for testing protocol behavior without relying on real AI providers
 *
 * @param overrides - Optional configuration overrides
 * @returns Object containing server, agentConfigHandle, and configDir for cleanup
 */
export async function createTestA2AServerWithStubs(overrides?: {
  port?: number;
  host?: string;
  baseUrl?: string;
  agentName?: string;
  agentUrl?: string;
  skills?: Array<{ id: string; name: string; mcpServers?: string[] }>;
  mcpServers?: Record<string, unknown>;
  aiService?: AIService; // Custom AI service to inject
  workflowRuntime?: WorkflowRuntime; // Custom workflow runtime to inject
}): Promise<{
  server: Server;
  agentConfigHandle: AgentConfigHandle;
  configDir: string;
  workflowRuntime?: WorkflowRuntime;
}> {
  // Create minimal ServiceConfig for testing
  const serviceConfig: ServiceConfig = {
    server: {
      port: overrides?.port ?? 0, // 0 = random available port
      host: overrides?.host ?? '127.0.0.1',
      baseUrl: overrides?.baseUrl ?? '',
    },
    a2a: {},
    logging: {
      enabled: false,
      level: 'error',
      structured: false,
    },
    ai: {
      provider: 'openrouter', // Stub will override this
      openRouterApiKey: 'stub-key',
    },
    agent: {
      maxSteps: 100,
    },
  };

  // Create test config workspace
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

  const agentConfig = agentConfigHandle.config;
  const logger = Logger.getInstance('TestA2AServer');
  logger.setStructured(false);

  // Create Express app
  const app = express();
  app.set('trust proxy', true);

  // Set up CORS and JSON parsing
  app.use(express.json({ limit: '50mb' }));

  // Use provided workflow runtime or create new one
  const workflowRuntime = overrides.workflowRuntime ?? new WorkflowRuntime();

  // Register workflow plugins from config if using new runtime
  if (!overrides.workflowRuntime) {
    for (const [_workflowId, loadedPlugin] of agentConfig.workflowPlugins.entries()) {
      workflowRuntime.register(loadedPlugin.plugin);
    }
  }

  // Create task store and event bus manager
  const taskStore = new InMemoryTaskStore();
  const eventBusManager = new DefaultExecutionEventBusManager();

  const buildWorkflowTool = (toolName: string): Tool | null => {
    try {
      const pluginId = toolName.replace('dispatch_workflow_', '');
      const plugin = workflowRuntime.getPlugin(pluginId);
      if (!plugin) {
        return null;
      }

      const description = plugin.description ?? `Dispatch ${plugin.name} workflow`;
      const inputSchema = plugin.inputSchema ?? z.object({}).passthrough();

      // Create schema-only tool (no execute function)
      // Workflow dispatch is handled by StreamProcessor
      return workflowToCoreTools(pluginId, description, inputSchema);
    } catch (error) {
      logger.error('Failed to build workflow tool definition', error, { toolName });
      return null;
    }
  };

  const collectTools = (): Map<string, Tool> => {
    const merged = new Map(agentConfig.tools);

    for (const toolName of workflowRuntime.getAvailableTools()) {
      const tool = buildWorkflowTool(toolName);
      if (tool) {
        merged.set(toolName, tool);
      }
    }

    return merged;
  };

  const initialTools = collectTools();

  // Use the injected AI service or create a real one
  const aiService =
    overrides?.aiService ??
    new AIService(
      {},
      {
        systemPrompt:
          agentConfig.finalPrompt?.content ??
          'You are an AI assistant that can dispatch workflows.',
        modelConfig: agentConfig.models,
        tools: initialTools,
      },
    );

  if (overrides?.aiService) {
    overrides.aiService.setTools(initialTools);
  } else {
    aiService.setTools(initialTools);
  }
  const syncTools = (): void => {
    const tools = collectTools();
    aiService.setTools(tools);
  };

  const originalRegister = workflowRuntime.register.bind(workflowRuntime);
  workflowRuntime.register = ((plugin: Parameters<typeof originalRegister>[0]) => {
    const result = originalRegister(plugin);
    syncTools();
    return result;
  }) as typeof workflowRuntime.register;

  const originalUnregister = workflowRuntime.unregister.bind(workflowRuntime);
  workflowRuntime.unregister = ((pluginId: Parameters<typeof originalUnregister>[0]) => {
    originalUnregister(pluginId);
    syncTools();
  }) as typeof workflowRuntime.unregister;

  // Create session manager and agent executor
  const contextManager = new ContextManager();
  const agentExecutor = createAgentExecutor(
    workflowRuntime,
    aiService,
    contextManager,
    eventBusManager,
    taskStore,
  );

  // Create request handler
  const requestHandler = new DefaultRequestHandler(
    agentConfig.agentCard,
    taskStore,
    agentExecutor,
    eventBusManager,
  );

  // Set up A2A routes
  const a2aPath = agentConfig.agentCard.url.startsWith('http')
    ? new URL(agentConfig.agentCard.url).pathname
    : '/a2a';

  const a2aApp = new A2AExpressApp(requestHandler);
  a2aApp.setupRoutes(app, a2aPath);

  // Add well-known endpoints - we'll update with actual URL after server starts
  let serverUrl = '';

  app.get('/.well-known/agent-card.json', (_req, res) => {
    res.json({
      ...agentConfig.agentCard,
      url: serverUrl + a2aPath,
    });
  });

  app.get('/.well-known/agent.json', (_req, res) => {
    res.json({
      ...agentConfig.agentCard,
      url: serverUrl + a2aPath,
    });
  });

  // Store runtime on app for test access
  (app as unknown as { workflowRuntime: WorkflowRuntime }).workflowRuntime = workflowRuntime;
  (app as unknown as { taskStore: InMemoryTaskStore }).taskStore = taskStore;

  // Create HTTP server
  const server = app.listen(serviceConfig.server.port, serviceConfig.server.host);

  // Wait for server to be listening
  await new Promise<void>((resolve) => {
    if (server.listening) {
      resolve();
    } else {
      server.once('listening', () => resolve());
    }
  });

  // Update serverUrl with actual address after server starts
  const address = server.address();
  if (address && typeof address === 'object') {
    serverUrl = `http://${serviceConfig.server.host}:${address.port}`;
  }

  // Store runtime on server for test access
  (server as unknown as { workflowRuntime: WorkflowRuntime }).workflowRuntime = workflowRuntime;
  (server as unknown as { taskStore: InMemoryTaskStore }).taskStore = taskStore;

  return { server, agentConfigHandle, configDir, workflowRuntime };
}

/**
 * Re-export the existing createTestA2AServer for convenience
 */
export { createTestA2AServer } from './test-server.js';
export { cleanupTestServer } from './test-server.js';
