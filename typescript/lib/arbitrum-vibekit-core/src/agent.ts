import type {
  AgentCard,
  AgentSkill,
  AgentCapabilities,
  Task,
  Message,
} from "@google-a2a/types/src/types.js";
import { CorsOptions } from "cors";
import { InMemoryTaskStore, TaskStore } from "./store.js";
import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import { VibkitError } from "./error.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { z } from "zod";
import { Server } from "http";
import { createRequire } from "module";
import {
  createSuccessTask,
  createErrorTask,
  createInfoMessage,
  getInputMimeType,
  UnsupportedSchemaError,
  formatToolDescriptionWithTagsAndExamples,
} from "./utils.js";
import { createMcpA2AResponse, createMcpErrorResponse } from "./mcpUtils.js";
import { generateText } from "ai";
import type { LanguageModel, CoreMessage } from "ai";
import { nanoid } from "nanoid";

/**
 * Configuration for stdio MCP server connection
 */
export interface StdioMcpConfig {
  command: string; // e.g., 'node'
  moduleName: string; // e.g., 'ember-mcp-tool-server' - will be resolved via require.resolve
  env?: Record<string, string>; // Additional environment variables
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
  mcpServers?: StdioMcpConfig[]; // Optional - MCP servers this skill needs
}

/**
 * Agent config with A2A-aligned skills
 */
export interface AgentConfig extends Omit<AgentCard, "skills"> {
  skills: SkillDefinition<any>[];
}

/**
 * Generic agent config for when you need type safety
 */
export interface AgentConfigGeneric<
  TSkill extends SkillDefinition<z.ZodTypeAny>
> extends Omit<AgentCard, "skills"> {
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
    throw new Error("Skill must have a non-empty id");
  }

  if (definition.tags.length === 0) {
    throw new Error(`Skill "${definition.name}" must have at least one tag`);
  }

  if (definition.examples.length === 0) {
    throw new Error(
      `Skill "${definition.name}" must have at least one example`
    );
  }

  if (!definition.tools || definition.tools.length === 0) {
    throw new Error(
      `Skill "${definition.name}" must have at least one tool for business logic`
    );
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
  TSkillInput = any
> {
  description: string;
  parameters: TParams;
  execute: (
    args: z.infer<TParams>,
    context: AgentContext<TContext, TSkillInput>
  ) => Promise<TResult>;
}

export class Agent<
  TSkillsArray extends SkillDefinition<z.ZodTypeAny, TContext>[],
  TContext = any
> {
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
    this.basePath = runtimeOptions.basePath ?? "/";
    if (this.basePath !== "/") {
      this.basePath = `/${this.basePath.replace(/^\/|\/$/g, "")}/`;
    }

    // Store skills in map for easy access
    skills.forEach((skill) => {
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
        "AgentConfigMissingSkillsError",
        -32600,
        "Agent creation requires at least one skill to be defined in 'manifest.skills'."
      );
    }

    // Convert SkillDefinition objects to AgentSkill objects for A2A compatibility
    const agentSkills: AgentSkill[] = config.skills.map(
      (skillDef: SkillDefinition<any>) => {
        const inputMimeType = getInputMimeType(
          skillDef.inputSchema,
          skillDef.name
        );

        return {
          id: skillDef.id,
          name: skillDef.name,
          description: skillDef.description,
          tags: skillDef.tags,
          examples: skillDef.examples,
          inputModes: [inputMimeType],
          outputModes: ["application/json"], // Task/Message are always JSON
        };
      }
    );

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
          "AgentConfigNoMcpSkillsError",
          -32600,
          `Agent '${this.card.name}' created with no skills defined for MCP tools.`
        );
      }
    }

    this.card.skills.forEach((skill) => {
      const skillDefinition = this.skillsMap.get(skill.name);

      if (!skillDefinition) {
        throw new VibkitError(
          "AgentConfigMismatchError",
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
          console.log("Tool called", {
            skillName: skill.name,
            skillId: skill.id,
            requestId: extra?.requestId,
          });
          const parseResult = skillDefinition.inputSchema.safeParse(args);
          if (!parseResult.success) {
            return createMcpErrorResponse(
              `Invalid arguments for skill ${skill.name}: ${parseResult.error.message}`,
              "InputValidationError"
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
              const errorMessage =
                error instanceof Error ? error.message : String(error);
              return createMcpErrorResponse(
                `Error processing skill ${skill.name} (ID: ${skill.id}): ${errorMessage}`,
                "UnhandledSkillError"
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
    contextProvider?: () => Promise<TContext> | TContext
  ): Promise<express.Express> {
    // Set up custom context if provided
    if (contextProvider) {
      this.customContext = await (typeof contextProvider === "function"
        ? contextProvider()
        : contextProvider);
    }

    // Set up MCP clients for skills that need them
    await this.setupSkillMcpClients();

    return this._startServer(port);
  }

  private async setupSkillMcpClients(): Promise<void> {
    for (const [skillName, skill] of this.skillsMap) {
      if (skill.mcpServers && skill.mcpServers.length > 0) {
        const clientsMap = new Map<string, Client>();

        for (const mcpConfig of skill.mcpServers) {
          try {
            console.log(
              `Setting up MCP client for skill "${skillName}", server: ${mcpConfig.moduleName}`
            );
            const client = await this.createMcpClient(mcpConfig, skillName);
            clientsMap.set(mcpConfig.moduleName, client);
          } catch (error) {
            console.error(
              `Failed to set up MCP client for skill "${skillName}":`,
              error
            );
            throw error;
          }
        }

        this.skillMcpClients.set(skillName, clientsMap);
      }
    }
  }

  private async createMcpClient(
    mcpConfig: StdioMcpConfig,
    skillName: string
  ): Promise<Client> {
    const client = new Client({
      name: `${this.card.name}-${skillName}-client`,
      version: this.card.version,
    });

    console.log("Initializing MCP client transport...");
    try {
      const require = createRequire(import.meta.url);
      const mcpToolPath = require.resolve(mcpConfig.moduleName);
      console.log(`Found MCP tool server path: ${mcpToolPath}`);

      const transport = new StdioClientTransport({
        command: mcpConfig.command,
        args: [mcpToolPath],
        env: {
          ...(Object.fromEntries(
            Object.entries(process.env).filter(([_, v]) => v !== undefined)
          ) as Record<string, string>),
          ...mcpConfig.env,
        },
      });

      await client.connect(transport);
      console.log("MCP client connected successfully.");
      return client;
    } catch (error) {
      console.error(
        "Failed to initialize MCP client transport or connect:",
        error
      );
      throw new Error(
        `MCP Client connection failed: ${(error as Error).message}`
      );
    }
  }

  private _startServer(port: number): express.Express {
    if (this.httpServer) {
      throw VibkitError.invalidRequest("Agent server is already running");
    }
    const app = express();
    if (this.corsOptions !== false) {
      const options =
        typeof this.corsOptions === "string"
          ? { origin: this.corsOptions }
          : this.corsOptions === true
          ? undefined
          : this.corsOptions;
      app.use(cors(options));
    }
    app.get("/", (_req, res) => {
      res.json({
        name: this.card.name,
        version: this.card.version,
        status: "running",
        endpoints: {
          "/": "Server information (this response)",
          "/sse": "Server-Sent Events endpoint for MCP connection",
          "/messages": "POST endpoint for MCP messages",
        },
        tools: this.card.skills,
        skills: this.card.skills,
      });
    });
    app.get("/.well-known/agent.json", (req: Request, res: Response) => {
      res.json(this.card);
    });
    app.get("/sse", async (_req, res) => {
      this.transport = new SSEServerTransport("/messages", res);
      await this.mcpServer.connect(this.transport);
      this.sseConnections.add(res);
      const keepaliveInterval = setInterval(() => {
        if (res.writableEnded) {
          clearInterval(keepaliveInterval);
          return;
        }
        res.write(":keepalive\n\n");
      }, 30000);
      _req.on("close", () => {
        clearInterval(keepaliveInterval);
        this.sseConnections.delete(res);
        this.transport?.close?.();
      });
      res.on("error", (err) => {
        console.error("SSE Error:", err);
        clearInterval(keepaliveInterval);
        this.sseConnections.delete(res);
        this.transport?.close?.();
      });
    });
    app.post("/messages", async (req, res) => {
      await this.transport?.handlePostMessage(req, res);
    });
    this.httpServer = app.listen(port, () => {
      console.log(`Agent server listening on port ${port}`);
    });
    return app;
  }

  async stop(): Promise<void> {
    console.log("Stopping agent");
    for (const res of this.sseConnections) {
      if (!res.writableEnded) {
        res.end();
      }
    }
    this.sseConnections.clear();
    if (this.transport) {
      this.transport.close?.();
      this.transport = undefined;
    }
    if (this.httpServer) {
      await new Promise<void>((resolve, reject) => {
        this.httpServer!.close((err) => {
          if (err) {
            console.error("Error closing HTTP server:", err);
            reject(err);
          } else {
            console.log("HTTP server closed");
            resolve();
          }
        });
      });
      this.httpServer = undefined;
    }
    console.log("Agent stopped");
  }

  private createSkillHandler(skill: SkillDefinition<any, TContext>) {
    return async (input: any) => {
      if (!this.model) {
        throw new Error("No language model configured");
      }
      const skillPrompt = this.generateSystemPromptForSkill(skill);
      const conversationHistory: CoreMessage[] = [
        { role: "system", content: skillPrompt },
        { role: "user", content: JSON.stringify(input) },
      ];
      // Convert tools to Vercel AI SDK format with context injection
      const sdkTools = Object.fromEntries(
        skill.tools.map((vibkitTool, idx) => [
          vibkitTool.description || `tool${idx}`,
          {
            description: vibkitTool.description,
            parameters: vibkitTool.parameters,
            execute: async (args: any) => {
              const skillMcpClients = this.skillMcpClients.get(skill.name);
              const context: AgentContext<TContext, typeof input> = {
                custom: this.customContext!,
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
          error instanceof Error ? error : new Error("Unknown error")
        );
      }
    };
  }

  private generateSystemPromptForSkill(
    skill: SkillDefinition<any, TContext>
  ): string {
    const examplePrompts = skill.examples
      .map(
        (ex, idx) =>
          `<example${idx + 1}>\nUser: ${ex}\nExpected behavior: ${
            skill.description
          }\n</example${idx + 1}>`
      )
      .join("\n");
    return `You are fulfilling the "${
      skill.name
    }" skill.\n\nSkill Description: ${
      skill.description
    }\nTags: ${skill.tags.join(
      ", "
    )}\n\nYour task is to use the available tools to accomplish what the user is asking for within the context of this skill.\n\nExamples of requests for this skill:\n${examplePrompts}\n\n${
      this.baseSystemPrompt || ""
    }`.trim();
  }

  private extractA2AResult(
    response: any,
    text: string,
    skillId: string
  ): Task | Message {
    // TODO: Implement robust extraction logic based on Vercel AI SDK response.
    // This could involve checking if 'text' is a JSON string representing a valid Task/Message.
    // For now, return a valid Message using the provided text.
    const contextId = `${skillId}-llm-response-${Date.now()}-${nanoid(6)}`;
    return createInfoMessage(text, "agent", contextId);
  }
}
