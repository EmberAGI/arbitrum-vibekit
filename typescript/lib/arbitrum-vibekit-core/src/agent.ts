import type { AgentCard, AgentSkill, AgentCapabilities, Task, Message } from '@google-a2a/types';
import { CorsOptions } from 'cors';
import { InMemoryTaskStore, TaskStore } from './store.js';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { VibkitError } from './error.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { z } from 'zod';
import { Server } from 'http';
import { createRequire } from 'module';
import {
  createSuccessTask,
  createErrorTask,
  createInfoMessage,
  getInputMimeType,
  UnsupportedSchemaError,
  formatToolDescriptionWithTagsAndExamples,
} from './utils.js';
import { createMcpA2AResponse, createMcpErrorResponse } from './mcpUtils.js';
import { generateText } from 'ai';
import type { LanguageModel, CoreMessage } from 'ai';
import { nanoid } from 'nanoid';

/**
 * Configuration for HTTP-based MCP server connection (SSE or Streamable HTTP)
 */
export interface HttpMcpConfig {
  url: string; // Server URL (e.g., 'https://api.emberai.xyz/mcp')
  headers?: Record<string, string>; // Optional HTTP headers for auth
  alwaysAllow?: string[]; // Tools to auto-approve
  disabled?: boolean; // Whether this server is disabled
}

/**
 * Configuration for stdio MCP server connection
 */
export interface StdioMcpConfig {
  command: string; // e.g., 'node'
  args?: string[]; // Command arguments (for compatibility with standard format)
  moduleName?: string; // e.g., 'ember-mcp-tool-server' - will be resolved via require.resolve (deprecated, use args instead)
  env?: Record<string, string>; // Additional environment variables
  alwaysAllow?: string[]; // Tools to auto-approve
  disabled?: boolean; // Whether this server is disabled
}

/**
 * Options for configuring an Agent's runtime behavior (e.g., server settings).
 */
export interface AgentRuntimeOptions<TContext = any> {
  taskStore?: TaskStore;
  cors?: CorsOptions | boolean | string;
  basePath?: string;
  llm?: {
    model: LanguageModel;
    baseSystemPrompt?: string;
  };
}

/**
 * A2A-aligned skill definition with strong typing for inputs
 */
export interface SkillDefinition<I extends z.ZodTypeAny, TContext = any> {
  id: string;
  name: string;
  description: string;
  tags: string[]; // required, must have at least one tag
  examples: string[]; // required, must have at least one example
  inputSchema: I;
  tools: Array<VibkitToolDefinition<any, Task | Message, TContext, z.infer<I>>>; // Tools now have access to skill input type
  handler?: (input: z.infer<I>) => Promise<Task | Message>; // Optional - when provided, bypasses LLM orchestration
  mcpServers?: Record<string, StdioMcpConfig | HttpMcpConfig>; // Optional - MCP servers this skill needs (named object format)
}

/**
 * Agent config with A2A-aligned skills
 */
export interface AgentConfig extends Omit<AgentCard, 'skills'> {
  skills: SkillDefinition<any>[];
}

/**
 * Generic agent config for when you need type safety
 */
export interface AgentConfigGeneric<TSkill extends SkillDefinition<z.ZodTypeAny>>
  extends Omit<AgentCard, 'skills'> {
  skills: TSkill[];
}

/**
 * Validates and creates a skill definition with A2A alignment.
 * Throws errors for unsupported schema types and missing required fields.
 */
export function defineSkill<TInputSchema extends z.ZodTypeAny, TContext = any>(
  definition: SkillDefinition<TInputSchema, TContext>
): SkillDefinition<TInputSchema, TContext> {
  // Validate required fields
  if (!definition.id?.trim()) {
    throw new Error('Skill must have a non-empty id');
  }

  if (definition.tags.length === 0) {
    throw new Error(`Skill "${definition.name}" must have at least one tag`);
  }

  if (definition.examples.length === 0) {
    throw new Error(`Skill "${definition.name}" must have at least one example`);
  }

  if (!definition.tools || definition.tools.length === 0) {
    throw new Error(`Skill "${definition.name}" must have at least one tool for business logic`);
  }

  // Validate schemas by attempting to derive MIME types (will throw if unsupported)
  getInputMimeType(definition.inputSchema, definition.name);

  return definition;
}

export interface AgentContext<TCustom = any, TSkillInput = any> {
  custom: TCustom;
  mcpClients?: Record<string, Client>; // MCP clients by server module name
  skillInput?: TSkillInput; // Skill input parameters from the skill invocation
}

export interface VibkitToolDefinition<
  TParams extends z.ZodTypeAny,
  TResult = Task | Message,
  TContext = any,
  TSkillInput = any,
> {
  name: string;
  description: string;
  parameters: TParams;
  execute: (
    args: z.infer<TParams>,
    context: AgentContext<TContext, TSkillInput>
  ) => Promise<TResult>;
}

export class Agent<TSkillsArray extends SkillDefinition<z.ZodTypeAny, TContext>[], TContext = any> {
  private corsOptions: CorsOptions | boolean | string;
  private basePath: string;
  card: AgentCard;
  public mcpServer: McpServer;
  private httpServer?: Server;
  private sseConnections: Set<Response> = new Set();
  private transport?: SSEServerTransport;
  private skillsMap = new Map<string, TSkillsArray[number]>();
  private model?: LanguageModel;
  private baseSystemPrompt?: string;
  private customContext?: TContext;
  private skillMcpClients = new Map<string, Map<string, Client>>(); // skillName -> (moduleName -> Client)

  private constructor(
    card: AgentCard,
    skills: TSkillsArray,
    runtimeOptions: AgentRuntimeOptions<TContext> = {}
  ) {
    this.card = card;
    this.corsOptions = runtimeOptions.cors ?? true;
    this.basePath = runtimeOptions.basePath ?? '/';
    if (this.basePath !== '/') {
      this.basePath = `/${this.basePath.replace(/^\/|\/$/g, '')}/`;
    }

    // Store skills in map for easy access
    skills.forEach(skill => {
      this.skillsMap.set(skill.name, skill);
    });

    if (runtimeOptions.llm) {
      this.model = runtimeOptions.llm.model;
      this.baseSystemPrompt = runtimeOptions.llm.baseSystemPrompt;
    }

    this.mcpServer = new McpServer({
      name: this.card.name,
      version: this.card.version,
    });
    this.registerSkillsAsMcpTools();
  }

  /**
   * The primary and only public factory method for creating an Agent.
   * It takes a manifest object to define the agent's properties and skills.
   * The AgentCard is constructed internally, ensuring consistency.
   */
  static create<TSkill extends SkillDefinition<z.ZodTypeAny>>(
    config: AgentConfig | AgentConfigGeneric<TSkill>,
    runtimeOptions: AgentRuntimeOptions = {}
  ): Agent<TSkill[]> {
    if (!config.skills || config.skills.length === 0) {
      throw new VibkitError(
        'AgentConfigMissingSkillsError',
        -32600,
        "Agent creation requires at least one skill to be defined in 'manifest.skills'."
      );
    }

    // Convert SkillDefinition objects to AgentSkill objects for A2A compatibility
    const agentSkills: AgentSkill[] = config.skills.map((skillDef: SkillDefinition<any>) => {
      const inputMimeType = getInputMimeType(skillDef.inputSchema, skillDef.name);

      return {
        id: skillDef.id,
        name: skillDef.name,
        description: skillDef.description,
        tags: skillDef.tags,
        examples: skillDef.examples,
        inputModes: [inputMimeType],
        outputModes: ['application/json'], // Task/Message are always JSON
      };
    });

    const agentCard: AgentCard = {
      ...config,
      skills: agentSkills,
    };

    return new Agent(agentCard, config.skills as TSkill[], runtimeOptions);
  }

  private registerSkillsAsMcpTools(): void {
    if (!this.card.skills || this.card.skills.length === 0) {
      if (this.skillsMap.size === 0) {
        throw new VibkitError(
          'AgentConfigNoMcpSkillsError',
          -32600,
          `Agent '${this.card.name}' created with no skills defined for MCP tools.`
        );
      }
    }

    this.card.skills.forEach(skill => {
      const skillDefinition = this.skillsMap.get(skill.name);

      if (!skillDefinition) {
        throw new VibkitError(
          'AgentConfigMismatchError',
          -32603, // Internal Error code for server-side config mismatch
          `Skill "${skill.name}" is defined in AgentCard but no skill definition was found. This indicates a configuration error.`
        );
      }

      this.mcpServer.tool(
        skill.id,
        formatToolDescriptionWithTagsAndExamples(
          skill.description,
          skill.tags ?? [],
          skill.examples ?? []
        ),
        (skillDefinition.inputSchema as z.ZodObject<any>).shape,
        {
          title: skill.name,
        },
        async (args: unknown, extra?: any) => {
          console.log('Tool called', {
            skillName: skill.name,
            skillId: skill.id,
            requestId: extra?.requestId,
          });
          const parseResult = skillDefinition.inputSchema.safeParse(args);
          if (!parseResult.success) {
            return createMcpErrorResponse(
              `Invalid arguments for skill ${skill.name}: ${parseResult.error.message}`,
              'InputValidationError'
            );
          }
          try {
            // Use manual handler if present, else LLM handler
            let handler = skillDefinition.handler;
            if (!handler) {
              handler = this.createSkillHandler(skillDefinition);
            }
            if (!handler) {
              throw new Error(`No handler available for skill ${skill.name}`);
            }
            const a2aResponse = await handler(parseResult.data);
            return createMcpA2AResponse(a2aResponse, this.card.name);
          } catch (error: unknown) {
            console.error(`Unexpected error in skill ${skill.name}:`, error);
            if (error instanceof VibkitError) {
              return createMcpErrorResponse(error.message, error.name);
            } else {
              const errorMessage = error instanceof Error ? error.message : String(error);
              return createMcpErrorResponse(
                `Error processing skill ${skill.name} (ID: ${skill.id}): ${errorMessage}`,
                'UnhandledSkillError'
              );
            }
          }
        }
      );
      console.log(`Registered MCP tool for skill: "${skill.name}"`);
    });
  }

  async start(
    port = 41241,
    contextProvider?: (deps: { mcpClients: Record<string, Client> }) => Promise<TContext> | TContext
  ): Promise<express.Express> {
    // Set up MCP clients for skills that need them FIRST
    await this.setupSkillMcpClients();

    // Set up custom context if provided, passing MCP clients as deps
    if (contextProvider) {
      // Aggregate all MCP clients across all skills into a single map
      const allMcpClients: Record<string, Client> = {};

      for (const [_skillName, clientsMap] of this.skillMcpClients) {
        for (const [moduleName, client] of clientsMap) {
          // If multiple skills use the same MCP server, just use the first instance
          if (!allMcpClients[moduleName]) {
            allMcpClients[moduleName] = client;
          }
        }
      }

      // Pass MCP clients to context provider
      const deps = { mcpClients: allMcpClients };
      this.customContext = await contextProvider(deps);
    }

    return this._startServer(port);
  }

  private async setupSkillMcpClients(): Promise<void> {
    for (const [skillName, skill] of this.skillsMap) {
      if (skill.mcpServers && Object.keys(skill.mcpServers).length > 0) {
        const clientsMap = new Map<string, Client>();

        for (const [serverName, mcpConfig] of Object.entries(skill.mcpServers)) {
          // Skip disabled servers
          if (mcpConfig.disabled) {
            console.log(`Skipping disabled MCP server "${serverName}" for skill "${skillName}"`);
            continue;
          }

          try {
            console.log(`Setting up MCP client for skill "${skillName}", server: ${serverName}`);
            const client = await this.createMcpClient(serverName, mcpConfig, skillName);
            if (client) {
              clientsMap.set(serverName, client);
            }
          } catch (error) {
            console.error(`Failed to set up MCP client for skill "${skillName}":`, error);
            throw error;
          }
        }

        this.skillMcpClients.set(skillName, clientsMap);
      }
    }
  }

  private async createMcpClient(
    serverName: string,
    mcpConfig: StdioMcpConfig | HttpMcpConfig,
    skillName: string
  ): Promise<Client | null> {
    const client = new Client({
      name: `${this.card.name}-${skillName}-${serverName}`,
      version: this.card.version,
    });

    console.log('Initializing MCP client transport...');
    try {
      if ('url' in mcpConfig) {
        // HTTP MCP Server (Streamable HTTP or SSE)
        console.log(`Connecting to HTTP MCP server at ${mcpConfig.url}`);
        const transport = new StreamableHTTPClientTransport(
          new URL(mcpConfig.url),
          mcpConfig.headers
        );
        await client.connect(transport);
        console.log('HTTP MCP client connected successfully.');
      } else {
        // Stdio MCP Server (existing logic)
        const require = createRequire(import.meta.url);
        let args: string[];

        if (mcpConfig.args) {
          // Use args directly if provided
          args = mcpConfig.args;
        } else if (mcpConfig.moduleName) {
          // Legacy support: resolve module name
          const mcpToolPath = require.resolve(mcpConfig.moduleName);
          console.log(`Found MCP tool server path: ${mcpToolPath}`);
          args = [mcpToolPath];
        } else {
          throw new Error('StdioMcpConfig must have either args or moduleName');
        }

        const transport = new StdioClientTransport({
          command: mcpConfig.command,
          args,
          env: {
            ...(Object.fromEntries(
              Object.entries(process.env).filter(([_, v]) => v !== undefined)
            ) as Record<string, string>),
            ...mcpConfig.env,
          },
        });

        await client.connect(transport);
        console.log('Stdio MCP client connected successfully.');
      }

      return client;
    } catch (error) {
      console.error('Failed to initialize MCP client transport or connect:', error);
      throw new Error(`MCP Client connection failed: ${(error as Error).message}`);
    }
  }

  private _startServer(port: number): express.Express {
    if (this.httpServer) {
      throw VibkitError.invalidRequest('Agent server is already running');
    }
    const app = express();
    if (this.corsOptions !== false) {
      const options =
        typeof this.corsOptions === 'string'
          ? { origin: this.corsOptions }
          : this.corsOptions === true
            ? undefined
            : this.corsOptions;
      app.use(cors(options));
    }

    // Helper to join base path with route
    const route = (path: string) => {
      if (this.basePath === '/') return path;
      return this.basePath.replace(/\/$/, '') + path;
    };

    app.get(route('/'), (_req, res) => {
      res.json({
        name: this.card.name,
        version: this.card.version,
        status: 'running',
        mcpServer: `${this.card.name} MCP Server`,
        endpoints: {
          [route('/')]: 'Server information (this response)',
          [route('/sse')]: 'Server-Sent Events endpoint for MCP connection',
          [route('/messages')]: 'POST endpoint for MCP messages',
        },
        tools: this.card.skills,
        skills: this.card.skills,
      });
    });
    app.get(route('/.well-known/agent.json'), (req: Request, res: Response) => {
      res.json({
        ...this.card,
        type: 'AgentCard',
      });
    });
    app.get(route('/sse'), async (_req, res) => {
      this.transport = new SSEServerTransport(route('/messages'), res);
      await this.mcpServer.connect(this.transport);
      this.sseConnections.add(res);
      const keepaliveInterval = setInterval(() => {
        if (res.writableEnded) {
          clearInterval(keepaliveInterval);
          return;
        }
        res.write(':keepalive\n\n');
      }, 30000);
      _req.on('close', () => {
        clearInterval(keepaliveInterval);
        this.sseConnections.delete(res);
        this.transport?.close?.();
      });
      res.on('error', err => {
        console.error('SSE Error:', err);
        clearInterval(keepaliveInterval);
        this.sseConnections.delete(res);
        this.transport?.close?.();
      });
    });
    app.post(route('/messages'), async (req, res) => {
      await this.transport?.handlePostMessage(req, res);
    });
    this.httpServer = app.listen(port, () => {
      console.log(`Agent server listening on port ${port}`);
    });
    return app;
  }

  async stop(): Promise<void> {
    console.log('Stopping agent');

    // Close all MCP clients first
    for (const [skillName, clientsMap] of this.skillMcpClients) {
      for (const [moduleName, client] of clientsMap) {
        try {
          console.log(`Closing MCP client for skill "${skillName}", server: ${moduleName}`);
          await client.close();
        } catch (error) {
          console.error(`Error closing MCP client for skill "${skillName}":`, error);
        }
      }
    }
    this.skillMcpClients.clear();

    // Close SSE connections
    for (const res of this.sseConnections) {
      if (!res.writableEnded) {
        res.end();
      }
    }
    this.sseConnections.clear();

    // Close transport
    if (this.transport) {
      this.transport.close?.();
      this.transport = undefined;
    }

    // Close HTTP server
    if (this.httpServer) {
      await new Promise<void>((resolve, reject) => {
        this.httpServer!.close(err => {
          if (err) {
            console.error('Error closing HTTP server:', err);
            reject(err);
          } else {
            console.log('HTTP server closed');
            resolve();
          }
        });
      });
      this.httpServer = undefined;
    }

    console.log('Agent stopped');
  }

  private createSkillHandler(skill: SkillDefinition<any, TContext>) {
    return async (input: any) => {
      if (!this.model) {
        throw new Error('No language model configured');
      }
      const skillPrompt = this.generateSystemPromptForSkill(skill);
      const conversationHistory: CoreMessage[] = [
        { role: 'system', content: skillPrompt },
        { role: 'user', content: JSON.stringify(input) },
      ];
      // Convert tools to Vercel AI SDK format with context injection
      const sdkTools = Object.fromEntries(
        skill.tools.map(vibkitTool => [
          vibkitTool.name,
          {
            description: vibkitTool.description,
            parameters: vibkitTool.parameters,
            execute: async (args: any) => {
              const skillMcpClients = this.skillMcpClients.get(skill.name);
              const context: AgentContext<TContext, typeof input> = {
                custom: this.customContext ?? ({} as TContext),
                skillInput: input,
                ...(skillMcpClients &&
                  skillMcpClients.size > 0 && {
                    mcpClients: Object.fromEntries(skillMcpClients),
                  }),
              };
              return await vibkitTool.execute(args, context);
            },
          },
        ])
      );
      try {
        const { response, text } = await generateText({
          model: this.model,
          messages: conversationHistory,
          tools: sdkTools,
          maxSteps: 5,
          onStepFinish: async (stepResult: any) => {
            console.error(`Step finished. Reason: ${stepResult.finishReason}`);
          },
        });
        // Extract Task/Message from response
        return this.extractA2AResult(response, text, skill.id);
      } catch (error) {
        console.error(`Error in skill ${skill.name}:`, error);
        return createErrorTask(
          skill.name,
          error instanceof Error ? error : new Error('Unknown error')
        );
      }
    };
  }

  private generateSystemPromptForSkill(skill: SkillDefinition<any, TContext>): string {
    const examplePrompts = skill.examples
      .map(
        (ex, idx) =>
          `<example${idx + 1}>\nUser: ${ex}\nExpected behavior: ${
            skill.description
          }\n</example${idx + 1}>`
      )
      .join('\n');
    return `You are fulfilling the "${skill.name}" skill.\n\nSkill Description: ${
      skill.description
    }\nTags: ${skill.tags.join(
      ', '
    )}\n\nYour task is to use the available tools to accomplish what the user is asking for within the context of this skill.\n\nExamples of requests for this skill:\n${examplePrompts}\n\n${
      this.baseSystemPrompt || ''
    }`.trim();
  }

  private extractA2AResult(response: any, text: string, skillId: string): Task | Message {
    // Check if any tool was called and returned a Task/Message
    if (response.messages && Array.isArray(response.messages)) {
      for (const message of response.messages) {
        if (message.role === 'tool' && Array.isArray(message.content)) {
          for (const part of message.content) {
            if (
              part.type === 'tool-result' &&
              part.result &&
              typeof part.result === 'object' &&
              'id' in part.result
            ) {
              // Found a Task or Message returned by a tool
              return part.result as Task | Message;
            }
          }
        }
      }
    }

    // No tool was called or no Task/Message found, return a text response
    const contextId = `${skillId}-llm-response-${Date.now()}-${nanoid(6)}`;
    return createInfoMessage(text || "I couldn't process that request.", 'agent', contextId);
  }
}
