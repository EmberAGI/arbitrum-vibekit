import {
  AgentCard,
  AgentSkill,
  AgentCapabilities,
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

/**
 * Options for configuring an Agent's runtime behavior (e.g., server settings).
 */
export interface AgentRuntimeOptions {
  taskStore?: TaskStore;
  cors?: CorsOptions | boolean | string;
  basePath?: string;
}

/**
 * Represents a skill definition coupled with its implementation handler.
 */
export interface SkillWithHandler {
  skill: AgentSkill;
  handler: (args: { instruction: string; userAddress: string }) => Promise<any>;
}

/**
 * Agent config that inherits all AgentCard properties except 'skills',
 * and adds skillsWithHandlers for the coupled skill definitions.
 */
export type AgentConfig = Omit<AgentCard, "skills"> & {
  skillsWithHandlers: SkillWithHandler[];
};

export class Agent {
  private corsOptions: CorsOptions | boolean | string;
  private basePath: string;
  card: AgentCard;
  private mcpServer: McpServer;
  private httpServer?: Server;
  private sseConnections: Set<Response> = new Set();
  private transport?: SSEServerTransport;
  private skillHandlers: Record<string, (args: any) => Promise<any>>;

  private constructor(
    card: AgentCard,
    skillHandlers: Record<string, (args: any) => Promise<any>>,
    runtimeOptions: AgentRuntimeOptions = {}
  ) {
    this.card = card;
    this.skillHandlers = skillHandlers;
    this.corsOptions = runtimeOptions.cors ?? true;
    this.basePath = runtimeOptions.basePath ?? "/";
    if (this.basePath !== "/") {
      this.basePath = `/${this.basePath.replace(/^\/|\/$/g, "")}/`;
    }

    this.mcpServer = new McpServer({
      name: this.card.name,
      version: this.card.version,
    });
    this.registerSkillsAsMcpTools();
  }

  /**
   * The primary and only public factory method for creating an Agent.
   * It takes a manifest object to define the agent's properties and skills (with handlers).
   * The AgentCard is constructed internally, ensuring consistency.
   */
  static create(
    manifest: AgentConfig,
    runtimeOptions: AgentRuntimeOptions = {}
  ): Agent {
    if (
      !manifest.skillsWithHandlers ||
      manifest.skillsWithHandlers.length === 0
    ) {
      throw VibkitError.invalidRequest(
        "Agent creation requires at least one skill to be defined in 'manifest.skillsWithHandlers'."
      );
    }

    const agentSkills: AgentSkill[] = manifest.skillsWithHandlers.map(
      (swh) => swh.skill
    );
    const derivedSkillHandlers = manifest.skillsWithHandlers.reduce(
      (acc, swh) => {
        acc[swh.skill.id] = swh.handler;
        return acc;
      },
      {} as Record<string, (args: any) => Promise<any>>
    );

    const agentCard: AgentCard = {
      ...manifest,
      skills: agentSkills,
    };

    return new Agent(agentCard, derivedSkillHandlers, runtimeOptions);
  }

  /**
   * Helper to create a skill with its handler for better type safety and developer experience.
   */
  static defineSkill(
    skill: AgentSkill,
    handler: (args: {
      instruction: string;
      userAddress: string;
    }) => Promise<any>
  ): SkillWithHandler {
    return { skill, handler };
  }

  private registerSkillsAsMcpTools(): void {
    if (!this.card.skills || this.card.skills.length === 0) {
      if (Object.keys(this.skillHandlers).length === 0) {
        console.warn(
          `Agent '${this.card.name}' created with no skills or skill handlers defined for MCP tools.`
        );
        return;
      }
    }

    this.card.skills.forEach((skill) => {
      const handler = this.skillHandlers[skill.id];

      if (!handler) {
        console.warn(
          `Skill "${skill.name}" (ID: ${skill.id}) is defined in AgentCard but no handler was found. Skipping MCP tool registration for this skill.`
        );
        return;
      }

      const skillSchema = z.object({
        instruction: z
          .string()
          .describe(
            skill.description ||
              `A natural-language instruction for the ${skill.name} skill. ${
                skill.examples ? `Examples: ${skill.examples.join(", ")}` : ""
              }`
          ),
        userAddress: z
          .string()
          .describe(
            "The user wallet address which is used to sign transactions and to pay for gas."
          ),
      });

      this.mcpServer.tool(
        skill.id,
        skill.description || `${skill.name} skill tool`,
        skillSchema.shape,
        async (args: z.infer<typeof skillSchema>) => {
          try {
            const response = await handler(args);
            return {
              content: [{ type: "text", text: JSON.stringify(response) }],
            };
          } catch (error: unknown) {
            const err = error as Error;
            return {
              isError: true,
              content: [
                {
                  type: "text",
                  text: `Error processing skill ${skill.name} (ID: ${skill.id}): ${err.message}`,
                },
              ],
            };
          }
        }
      );
      console.log(
        `Registered MCP tool for skill: "${skill.name}" (ID: ${skill.id})`
      );
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
