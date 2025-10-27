import type { Server } from 'http';

import type { AgentCard } from '@a2a-js/sdk';
import {
  DefaultRequestHandler,
  InMemoryTaskStore,
  DefaultExecutionEventBusManager,
} from '@a2a-js/sdk/server';
import { A2AExpressApp } from '@a2a-js/sdk/server/express';
import cors from 'cors';
import express, {
  type Express,
  type Request,
  type Response,
  type NextFunction,
  json,
} from 'express';

import { DEFAULT_MODELS } from '../ai/providers/index.js';
import { AIService } from '../ai/service.js';
import type { AgentConfigHandle, HotReloadHandler } from '../config/runtime/init.js';
import type { ServiceConfig } from '../config.js';
import { Logger } from '../utils/logger.js';
import { WorkflowRuntime } from '../workflows/runtime.js';

import { createAgentExecutor } from './agentExecutor.js';
import { ContextManager } from './sessions/manager.js';

interface ServerConfig {
  serviceConfig: ServiceConfig;
  agentConfig: AgentConfigHandle;
  workflowRuntime?: WorkflowRuntime;
  onRequestLog?: (entry: RequestLogEntry) => void;
}

/**
 * Log entry for a request
 */
interface RequestLogEntry {
  method: string;
  path: string;
  timestamp: Date;
}

interface MiddlewareConfig {
  logRequests?: boolean;
  onRequestLog?: (entry: RequestLogEntry) => void;
}

type ArtifactRecord = {
  data: string | Buffer;
  mimeType?: string;
  contentType?: string;
};

function isArtifactRecord(value: unknown): value is ArtifactRecord {
  return typeof value === 'object' && value !== null && 'data' in value;
}

type ExpressWithRuntime = Express & {
  workflowRuntime?: WorkflowRuntime;
  taskStore?: InMemoryTaskStore;
  loggingEnabled?: boolean;
};
type ServerWithRuntime = Server & {
  workflowRuntime?: WorkflowRuntime;
  taskStore?: InMemoryTaskStore;
};

/**
 * Creates an A2A server with the specified configuration
 */
export async function createA2AServer(config: ServerConfig): Promise<Server> {
  const app = express();
  app.set('trust proxy', true);

  const port = config.serviceConfig.server.port;
  const host = config.serviceConfig.server.host;

  // Per PRD: Server consumes serviceConfig.logging object (not individual params)
  const loggingConfig = config.serviceConfig.logging;
  const loggingEnabled = loggingConfig.enabled ?? false;

  const logger = Logger.getInstance('A2AServer');
  if (typeof loggingConfig.structured === 'boolean') {
    logger.setStructured(loggingConfig.structured);
  }

  logger.info('=== Server Configuration ===');
  logger.info(`Server: ${Logger.colorValue(`${host}:${port}`)}`);
  logger.info(`Logging: ${Logger.colorValue(loggingEnabled ? 'enabled' : 'disabled')}`);
  logger.info(`Log Level: ${Logger.colorValue(loggingConfig.level)}`);
  logger.info(`Log Structured: ${Logger.colorValue(loggingConfig.structured)}`);

  const agentConfig = config.agentConfig.config;
  const a2aPath = deriveA2APath(agentConfig.agentCard, config.serviceConfig.a2a.path);

  const basePreview = resolveBaseComponents({
    agentCard: agentConfig.agentCard,
    runtimePath: config.serviceConfig.a2a.path ?? a2aPath,
  });

  logger.info(`A2A Path: ${Logger.colorValue(a2aPath)}`);
  logger.info(`Agent Card Origin: ${Logger.colorValue(basePreview.origin)}`);

  setupMiddleware(app, {
    logRequests: loggingEnabled,
    onRequestLog: config.onRequestLog,
  });

  // Use workflow runtime from agent config (created during tool loading)
  // or create a new one if not available (fallback for compatibility)
  const workflowRuntime =
    agentConfig.workflowRuntime ?? config.workflowRuntime ?? new WorkflowRuntime();

  // Only register plugins if using a newly created runtime
  // (plugins are already registered in tool-loader when runtime is created there)
  if (!agentConfig.workflowRuntime && !config.workflowRuntime) {
    for (const [_workflowId, loadedPlugin] of agentConfig.workflowPlugins.entries()) {
      workflowRuntime.register(loadedPlugin.plugin);
      logger.info(`Registered workflow plugin: ${loadedPlugin.id}`);
    }
  }

  logger.info('=== config Loaded ===');
  logger.info(`MCP Servers: ${Logger.colorValue(agentConfig.mcpInstances.size)}`);
  logger.info(`Workflow Plugins: ${Logger.colorValue(agentConfig.workflowPlugins.size)}`);

  const taskStore = new InMemoryTaskStore();
  const eventBusManager = new DefaultExecutionEventBusManager();

  // Create AIService with tools from agent config
  const aiService = new AIService(
    {},
    {
      systemPrompt: agentConfig.finalPrompt.content,
      modelConfig: agentConfig.models,
      tools: agentConfig.tools,
    },
  );

  const providerValue =
    config.serviceConfig.ai.provider ?? agentConfig.models.agent.provider ?? 'openrouter';
  const defaultModelForProvider =
    agentConfig.models.agent.name ?? DEFAULT_MODELS[providerValue] ?? DEFAULT_MODELS.openrouter;
  const modelValue = agentConfig.models.agent.name ?? defaultModelForProvider;

  logger.info('=== AI Configuration ===');
  logger.info(`Provider: ${Logger.colorValue(providerValue)}`);
  logger.info(`Model: ${Logger.colorValue(modelValue)}`);

  const availableTools = aiService.getAvailableTools();
  logger.info('=== Available Tools ===');
  if (availableTools.length === 0) {
    logger.info('No tools registered');
  } else {
    logger.info(
      `Tools (${Logger.colorValue(availableTools.length)}): ${Logger.colorValue(availableTools.join(', '))}`,
    );
  }

  const contextManager = new ContextManager();
  const agentExecutor = createAgentExecutor(
    workflowRuntime,
    aiService,
    contextManager,
    eventBusManager,
    taskStore,
  );

  const requestHandler = new DefaultRequestHandler(
    agentConfig.agentCard,
    taskStore,
    agentExecutor,
    eventBusManager,
  );

  const a2aApp = new A2AExpressApp(requestHandler);
  a2aApp.setupRoutes(app, a2aPath);

  app.get('/.well-known/agent-card.json', (req: Request, res: Response) => {
    const { origin, path } = resolveBaseComponents({
      agentCard: agentConfig.agentCard,
      runtimePath: config.serviceConfig.a2a.path ?? a2aPath,
      req,
    });
    const forwardedPrefix = req.get('x-forwarded-prefix') ?? '';
    const combinedPath = combineWithPrefix(forwardedPrefix, path);
    const cardUrl = combinedPath === '/' ? origin : `${origin}${combinedPath}`;
    res.json({
      ...agentConfig.agentCard,
      url: cardUrl,
    });
  });

  app.get('/.well-known/agent.json', (req: Request, res: Response) => {
    const { origin, path } = resolveBaseComponents({
      agentCard: agentConfig.agentCard,
      runtimePath: config.serviceConfig.a2a.path ?? a2aPath,
      req,
    });
    const forwardedPrefix = req.get('x-forwarded-prefix') ?? '';
    const combinedPath = combineWithPrefix(forwardedPrefix, path);
    const cardUrl = combinedPath === '/' ? origin : `${origin}${combinedPath}`;
    res.json({
      ...agentConfig.agentCard,
      url: cardUrl,
    });
  });

  registerAdditionalRoutes(app, a2aPath);

  (app as ExpressWithRuntime).workflowRuntime = workflowRuntime;
  (app as ExpressWithRuntime).taskStore = taskStore;
  (app as ExpressWithRuntime).loggingEnabled = loggingEnabled;

  const handleHotReload: HotReloadHandler = (event) => {
    logger.info('Hot reload event received', { change: event.change.type });

    if (event.updated.prompt || event.updated.agentCard) {
      aiService.updateSystemPrompt(event.config.finalPrompt.content);
      logger.info('Updated system prompt from config workspace');
    }

    if (event.updated.models) {
      aiService.applyModelConfig(event.config.models);
      logger.info('Applied updated model configuration');
    }

    if (event.updated.workflows) {
      const { added = [], removed = [], reloaded = [] } = event.updated.workflows;

      for (const workflowId of removed) {
        workflowRuntime.unregister(workflowId);
        logger.info(`Unregistered workflow plugin ${workflowId}`);
      }

      for (const workflowId of added) {
        const plugin = event.config.workflowPlugins.get(workflowId);
        if (plugin) {
          try {
            workflowRuntime.register(plugin.plugin);
            logger.info(`Registered workflow plugin ${workflowId}`);
          } catch (error) {
            logger.error(`Failed to register workflow plugin ${workflowId}`, error);
          }
        }
      }

      for (const workflowId of reloaded) {
        const plugin = event.config.workflowPlugins.get(workflowId);
        if (plugin) {
          try {
            workflowRuntime.replace(plugin.plugin);
            logger.info(`Reloaded workflow plugin ${workflowId}`);
          } catch (error) {
            logger.error(`Failed to reload workflow plugin ${workflowId}`, error);
          }
        }
      }
    }

    if (event.updated.mcp || event.updated.workflows) {
      // Update AIService with reloaded tools from agent config
      aiService.setTools(event.config.tools);
      logger.info(`Tools updated: ${event.config.tools.size} tools available`);
    }
  };

  config.agentConfig.onHotReload(handleHotReload);

  const server = await startServer(app, port, host, a2aPath);
  (server as ServerWithRuntime).workflowRuntime = workflowRuntime;
  (server as ServerWithRuntime).taskStore = taskStore;

  return server;
}

async function startServer(
  app: Express,
  port: number,
  host: string,
  a2aPath: string,
): Promise<Server> {
  const logger = Logger.getInstance('A2AServer');
  return await new Promise<Server>((resolve, reject) => {
    const httpServer = app.listen(port, host, () => {
      logger.info('=================================');
      logger.info(`Server ready at ${Logger.colorValue(`http://${host}:${port}`)}`);
      logger.info(
        `Agent card: ${Logger.colorValue(`http://${host}:${port}/.well-known/agent-card.json`)}`,
      );
      const localBase = `http://${host}:${port}`;
      const endpointPath = a2aPath === '/' ? '' : a2aPath;
      logger.info(`A2A endpoint: ${Logger.colorValue(`${localBase}${endpointPath}`)}`);
      logger.info('=================================');
      resolve(httpServer);
    });
    httpServer.on('error', reject);
  });
}

/**
 * Sets up Express middleware for the A2A server
 */
export function setupMiddleware(app: Express, config: MiddlewareConfig = {}): void {
  // JSON body parser - MUST come before any middleware that reads req.body
  const jsonParser = json();
  app.use(jsonParser);

  // CORS configuration for A2A compliance
  app.use(
    cors({
      origin: true, // Allow all origins for A2A compliance
      credentials: true,
      methods: ['GET', 'POST', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    }),
  );

  // Request logging if enabled - comes AFTER JSON parser so req.body is available
  if (config.logRequests) {
    const logger = Logger.getInstance('A2AServer');
    app.use((req: Request, _res: Response, next: NextFunction) => {
      const entry: RequestLogEntry = {
        method: req.method,
        path: req.path,
        timestamp: new Date(),
      };

      // Log A2A requests with more detail
      if (req.path === '/a2a' && req.method === 'POST') {
        const body = req.body as Record<string, unknown>;
        const methodName = typeof body['method'] === 'string' ? body['method'] : 'unknown';
        logger.info(`${methodName} request`);

        // Log message content for message-related methods
        if (body['method'] === 'message/send' || body['method'] === 'message/stream') {
          const params = body['params'] as Record<string, unknown>;
          if (params?.['message']) {
            logger.debug('Message received', { message: params['message'] });
          }
        }
      } else {
        logger.info('HTTP request', { method: req.method, path: req.path });
      }

      // Call custom log handler if provided
      if (config.onRequestLog) {
        config.onRequestLog(entry);
      }

      next();
    });
  }
}

/**
 * Registers additional routes on the Express app
 */
export function registerAdditionalRoutes(app: Express, a2aPath: string): void {
  // Basic health endpoint (plain HTTP status only)
  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).send('ok');
  });

  // Artifact download route for A2A resource URI compatibility
  const artifactRoute = buildArtifactRoute(a2aPath);
  app.get(artifactRoute, async (req: Request, res: Response) => {
    try {
      const taskStore = (app as ExpressWithRuntime).taskStore;
      if (!taskStore) {
        res.status(404).json({ error: 'Task store not available' });
        return;
      }
      const { taskId, artifactId } = req.params;
      // Query TaskStore for the task and find the artifact
      const task = await taskStore.load(taskId ?? '');
      if (!task?.artifacts) {
        res.status(404).json({ error: 'Task or artifacts not found' });
        return;
      }
      const artifact = task.artifacts.find((a) => a.artifactId === artifactId);
      if (!isArtifactRecord(artifact)) {
        res.status(404).json({ error: 'Artifact not found' });
        return;
      }
      const contentType = artifact.mimeType || artifact.contentType || 'application/octet-stream';
      res.setHeader('Content-Type', contentType);
      const data = artifact.data;
      if (typeof data === 'string') {
        // If it's JSON string, return as is; otherwise treat as text or base64 already encoded
        res.send(data);
        return;
      }
      // If it's a buffer, send it directly
      res.send(data);
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : 'Failed to fetch artifact';
      res.status(500).json({ error: errorMessage });
    }
  });
}

function normalizePathSegment(path: string | undefined): string {
  if (!path) {
    return '/';
  }
  let normalized = path.trim();
  if (!normalized.startsWith('/')) {
    normalized = `/${normalized}`;
  }
  normalized = normalized.replace(/\/{2,}/g, '/');
  if (normalized.length > 1 && normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1);
  }
  return normalized || '/';
}

function normalizeForwardedPrefix(prefix: string): string {
  if (!prefix) {
    return '';
  }
  let normalized = prefix.trim();
  if (!normalized) {
    return '';
  }
  if (!normalized.startsWith('/')) {
    normalized = `/${normalized}`;
  }
  normalized = normalized.replace(/\/{2,}/g, '/');
  if (normalized === '/') {
    return '';
  }
  if (normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1);
  }
  return normalized;
}

function deriveA2APath(agentCard: AgentCard, runtimePath?: string): string {
  if (runtimePath) {
    return normalizePathSegment(runtimePath);
  }

  try {
    const parsed = new URL(agentCard.url);
    const candidate = parsed.pathname && parsed.pathname !== '' ? parsed.pathname : '/a2a';
    return normalizePathSegment(candidate);
  } catch {
    return normalizePathSegment('/a2a');
  }
}

function resolveBaseComponents({
  agentCard,
  runtimePath,
  req,
}: {
  agentCard: AgentCard;
  runtimePath?: string;
  req?: Request;
}): { origin: string; path: string } {
  const path = normalizePathSegment(runtimePath ?? deriveA2APath(agentCard));
  let origin: string | undefined;

  // Check for reverse proxy headers first
  if (req) {
    const forwardedProto = req.get('x-forwarded-proto');
    const forwardedHost = req.get('x-forwarded-host') ?? req.get('host');

    if (forwardedProto && forwardedHost) {
      origin = `${forwardedProto}://${forwardedHost}`.replace(/\/$/, '');
    } else if (forwardedHost) {
      origin = `${req.protocol}://${forwardedHost}`.replace(/\/$/, '');
    }
  }

  // Use configured agent card URL
  if (!origin) {
    try {
      origin = new URL(agentCard.url).origin;
    } catch {
      origin = 'http://localhost:3000';
    }
  }

  return {
    origin: origin.replace(/\/$/, ''),
    path,
  };
}

function combineWithPrefix(prefix: string, path: string): string {
  const normalizedPrefix = normalizeForwardedPrefix(prefix);
  const normalizedPath = normalizePathSegment(path);

  if (!normalizedPrefix) {
    return normalizedPath;
  }

  if (normalizedPath === '/') {
    return normalizedPrefix;
  }

  return normalizePathSegment(`${normalizedPrefix}${normalizedPath}`);
}

function buildArtifactRoute(a2aPath: string): string {
  const normalized = normalizePathSegment(a2aPath);
  if (normalized === '/') {
    return '/tasks/:taskId/artifacts/:artifactId';
  }
  return `${normalized}/tasks/:taskId/artifacts/:artifactId`;
}

/**
 * Shuts down the server gracefully
 */
export async function shutdownServer(server: Server): Promise<void> {
  const app = server as ServerWithRuntime;

  // Shutdown workflow runtime if present
  if (app.workflowRuntime?.shutdown) {
    await app.workflowRuntime.shutdown();
  }

  return new Promise((resolve) => {
    server.close(() => {
      resolve();
    });
  });
}
