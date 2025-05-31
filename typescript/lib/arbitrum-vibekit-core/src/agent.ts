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
import { z } from "zod";
import { Server } from "http";
import {
  getMimeTypesFromZodSchema,
  UnsupportedSchemaError,
  formatToolDescriptionWithTagsAndExamples,
} from "./utils.js";
import { createMcpA2AResponse, createMcpErrorResponse } from "./mcpUtils.js";

/**
 * Options for configuring an Agent's runtime behavior (e.g., server settings).
 */
export interface AgentRuntimeOptions {
  taskStore?: TaskStore;
  cors?: CorsOptions | boolean | string;
  basePath?: string;
}

/**
 * A2A-aligned skill definition with strong typing for inputs and output payload
 */
export interface SkillDefinition<
  I extends z.ZodObject<z.ZodRawShape>,
  O extends z.ZodTypeAny
> {
  id: string;
  name: string;
  description: string;
  tags: string[]; // required, must have at least one tag
  examples: string[]; // required, must have at least one example
  inputSchema: I;
  outputPayloadSchema: O;
  handler: (input: z.infer<I>) => Promise<Task | Message>;
}

/**
 * Helper type for any skill definition with unknown schema types
 */
export type AnySkillDefinition = SkillDefinition<
  z.ZodObject<z.ZodRawShape>,
  z.ZodTypeAny
>;

/**
 * Agent config with A2A-aligned skills
 */
export interface AgentConfig<
  TSkills extends AnySkillDefinition[] = AnySkillDefinition[]
> extends Omit<AgentCard, "skills"> {
  skills: TSkills;
}

/**
 * Validates and creates a skill definition with A2A alignment.
 * Throws errors for unsupported schema types and missing required fields.
 */
export function defineSkill<
  I extends z.ZodObject<z.ZodRawShape>,
  O extends z.ZodTypeAny
>(definition: SkillDefinition<I, O>): SkillDefinition<I, O> {
  // Validate required fields
  if (!definition.id || !definition.id.trim()) {
    throw new Error(`Skill must have a non-empty id`);
  }
  if (!definition.tags.length) {
    throw new Error(`Skill "${definition.name}" must have at least one tag`);
  }
  if (!definition.examples.length) {
    throw new Error(
      `Skill "${definition.name}" must have at least one example`
    );
  }

  // Check for unsupported schema types (this will throw UnsupportedSchemaError if needed)
  getMimeTypesFromZodSchema(
    definition.inputSchema,
    definition.outputPayloadSchema,
    definition.name
  );

  return definition;
}

export class Agent<TSkills extends AnySkillDefinition[]> {
  private corsOptions: CorsOptions | boolean | string;
  private basePath: string;
  card: AgentCard;
  public mcpServer: McpServer;
  private httpServer?: Server;
  private sseConnections: Set<Response> = new Set();
  private transport?: SSEServerTransport;
  private skillsMap = new Map<string, TSkills[number]>();

  private constructor(
    card: AgentCard,
    skills: TSkills,
    runtimeOptions: AgentRuntimeOptions = {}
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
  static create<TSkills extends AnySkillDefinition[]>(
    manifest: AgentConfig<TSkills>,
    runtimeOptions: AgentRuntimeOptions = {}
  ): Agent<TSkills> {
    if (!manifest.skills || manifest.skills.length === 0) {
      throw new VibkitError(
        "AgentConfigMissingSkillsError",
        -32600,
        "Agent creation requires at least one skill to be defined in 'manifest.skills'."
      );
    }

    // Convert SkillDefinition objects to AgentSkill objects for A2A compatibility
    const agentSkills: AgentSkill[] = manifest.skills.map((skillDef) => {
      const { inputMimeType, outputMimeType } = getMimeTypesFromZodSchema(
        skillDef.inputSchema,
        skillDef.outputPayloadSchema,
        skillDef.name
      );

      return {
        id: skillDef.id,
        name: skillDef.name,
        description: skillDef.description,
        tags: skillDef.tags,
        examples: skillDef.examples,
        inputModes: [inputMimeType],
        outputModes: [outputMimeType],
      };
    });

    const agentCard: AgentCard = {
      ...manifest,
      skills: agentSkills,
    };

    return new Agent(agentCard, manifest.skills, runtimeOptions);
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
        skillDefinition.inputSchema.shape,
        {
          title: skill.name,
        },
        async (args: unknown, extra?: any) => {
          // Log extra parameter for debugging but don't forward to skills
          console.log("Tool called", {
            skillName: skill.name,
            skillId: skill.id,
            requestId: extra?.requestId,
          });

          // MCP Input Validation: Validate incoming arguments against inputSchema
          const parseResult = skillDefinition.inputSchema.safeParse(args);
          if (!parseResult.success) {
            return createMcpErrorResponse(
              `Invalid arguments for skill ${skill.name}: ${parseResult.error.message}`,
              "InputValidationError"
            );
          }

          try {
            // Call the skill handler with validated input
            const a2aResponse = await skillDefinition.handler(parseResult.data);

            // Return A2A response wrapped as MCP envelope
            return createMcpA2AResponse(a2aResponse, this.card.name);
          } catch (error: unknown) {
            // Unexpected skill crash - MCP wrapper catches this
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

  start(port = 41241): express.Express {
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
}
