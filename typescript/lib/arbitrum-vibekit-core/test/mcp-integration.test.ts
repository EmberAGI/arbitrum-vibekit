import { expect } from "chai";
import { z } from "zod";
import { nanoid } from "nanoid";
import {
  Agent,
  defineSkill,
  VibkitError,
  createErrorTask,
  createInfoMessage,
  createSuccessTask,
  VibkitToolDefinition,
} from "../src/index.js";
import type {
  SkillDefinition,
  AgentConfig,
} from "../src/index.js";
import type { Task, Message } from "@google-a2a/types";
import { TaskState } from "@google-a2a/types";

const dummyTool: VibkitToolDefinition<z.ZodObject<{}>, Task> = {
  name: "dummy-tool",
  description: "Dummy tool",
  parameters: z.object({}),
  execute: async () => ({
    id: "dummy",
    kind: "task",
    contextId: "dummy",
    status: {
      state: TaskState.Completed,
      message: {
        kind: "message",
        role: "agent",
        parts: [{ kind: "text", text: "ok" }],
        messageId: "dummy",
      },
      timestamp: new Date().toISOString(),
    },
  }),
};

describe("MCP Integration Tests", () => {
  describe("MCP Tool Registration and Metadata", () => {
    it("should register tools with correct metadata", async () => {
      const testSkill = defineSkill({
        id: "format-test-skill-id",
        name: "Format Test Skill Name",
        description: "Base description for testing formatting",
        tags: ["utility", "test", "format"],
        examples: [
          "Format example 1",
          "Format example 2 with 'quotes' & <tags>",
        ],
        inputSchema: z.object({ text: z.string() }),
        handler: async (input): Promise<Task> => ({
          id: "task-id",
          contextId: "format-context",
          kind: "task",
          status: {
            state: TaskState.Completed,
            message: createInfoMessage("Success", "agent"),
            timestamp: new Date().toISOString(),
          },
        }),
        tools: [dummyTool],
      });

      const manifest: AgentConfig = {
        name: "Format Test Agent",
        version: "1.0.0",
        description: "Testing description formatting",
        url: "http://localhost:41241",
        capabilities: {
          streaming: false,
          pushNotifications: false,
          stateTransitionHistory: false,
        },
        defaultInputModes: ["application/json"],
        defaultOutputModes: ["application/json"],
        skills: [testSkill],
      };

      const agent = Agent.create(manifest);

      // Verify the agent card has the correct skill information
      expect(agent.card.skills).to.have.length(1);
      const skill = agent.card.skills[0]!;
      expect(skill.id).to.equal("format-test-skill-id");
      expect(skill.name).to.equal("Format Test Skill Name");
      expect(skill.description).to.equal(
        "Base description for testing formatting"
      );
      expect(skill.tags).to.deep.equal(["utility", "test", "format"]);
      expect(skill.examples).to.deep.equal([
        "Format example 1",
        "Format example 2 with 'quotes' & <tags>",
      ]);
      expect(skill.inputModes).to.deep.equal(["application/json"]);
      expect(skill.outputModes).to.deep.equal(["application/json"]);
    });

    it("should derive correct MIME types for different schema types", async () => {
      const stringSkill = defineSkill({
        id: "string-skill",
        name: "String Skill",
        description: "A skill with string input/output",
        tags: ["test"],
        examples: ["test string"],
        inputSchema: z.object({ text: z.string() }),
        handler: async (input): Promise<Task> => ({
          id: "task-id",
          contextId: "string-context",
          kind: "task",
          status: {
            state: TaskState.Completed,
            message: createInfoMessage("Success", "agent"),
            timestamp: new Date().toISOString(),
          },
        }),
        tools: [dummyTool],
      });

      const manifest: AgentConfig = {
        name: "String Test Agent",
        version: "1.0.0",
        description: "Testing string schema MIME types",
        url: "http://localhost:41241",
        capabilities: {
          streaming: false,
          pushNotifications: false,
          stateTransitionHistory: false,
        },
        defaultInputModes: ["application/json"],
        defaultOutputModes: ["application/json"],
        skills: [stringSkill],
      };

      const agent = Agent.create(manifest);
      const skill = agent.card.skills[0]!;

      expect(skill.inputModes).to.deep.equal(["application/json"]);
      expect(skill.outputModes).to.deep.equal(["application/json"]);
    });
  });

  describe("MCP Tool Handler Runtime Behavior", () => {
    let agent: Agent<any, any>;
    let successfulSkill: SkillDefinition<any, any>;
    let failingSkillHandler: SkillDefinition<any, any>;
    let crashingSkill: SkillDefinition<any, any>;

    beforeEach(() => {
      successfulSkill = defineSkill({
        id: "success-skill",
        name: "Successful Skill",
        description: "A skill that completes successfully",
        tags: ["test"],
        examples: ["Run success"],
        inputSchema: z.object({ data: z.string() }),
        handler: async (input): Promise<Task> => ({
          id: "task-success",
          contextId: "ctx-success",
          kind: "task",
          status: {
            state: TaskState.Completed,
            message: createInfoMessage(`Processed: ${input.data}`, "agent"),
            timestamp: new Date().toISOString(),
          },
          artifacts: [
            {
              artifactId: nanoid(),
              parts: [{ kind: "text", text: "Artifact Data" }],
            },
          ],
        }),
        tools: [dummyTool],
      });

      failingSkillHandler = defineSkill({
        id: "failing-skill-handler",
        name: "Failing Skill Handler",
        description: "A skill handler that returns a failed A2A Task",
        tags: ["test", "failure"],
        examples: ["Run failing handler"],
        inputSchema: z.object({ data: z.string() }),
        handler: async (input): Promise<Task> => {
          const opError = VibkitError.invalidParams(
            `Operation failed for input: ${input.data}`
          );
          return createErrorTask("failing-skill-handler", opError, "op-fail");
        },
        tools: [dummyTool],
      });

      crashingSkill = defineSkill({
        id: "crashing-skill",
        name: "Crashing Skill",
        description: "A skill that unexpectedly throws an error",
        tags: ["test", "crash"],
        examples: ["Run crash"],
        inputSchema: z.object({ data: z.string() }),
        handler: async (input): Promise<Task> => {
          throw new Error(`Intentional crash for input: ${input.data}`);
        },
        tools: [dummyTool],
      });

      const manifest: AgentConfig = {
        name: "Runtime Test Agent",
        version: "1.0.0",
        description: "Agent for testing MCP tool runtime behavior",
        url: "http://localhost:41241",
        capabilities: {
          streaming: false,
          pushNotifications: false,
          stateTransitionHistory: false,
        },
        defaultInputModes: ["application/json"],
        defaultOutputModes: ["application/json"],
        skills: [successfulSkill, failingSkillHandler, crashingSkill],
      };
      agent = Agent.create(manifest);
    });

    it("should register all skills correctly", async () => {
      expect(agent.card.skills).to.have.length(3);
      expect(agent.card.skills.map((s) => s.id)).to.include("success-skill");
      expect(agent.card.skills.map((s) => s.id)).to.include(
        "failing-skill-handler"
      );
      expect(agent.card.skills.map((s) => s.id)).to.include("crashing-skill");
    });

    it("should have proper MCP server instance", () => {
      expect(agent.mcpServer).to.exist;
      // The McpServer class does not expose name/version directly; check underlying server info instead.
      expect(agent.mcpServer.server).to.exist;
      expect(agent.mcpServer.server).to.have.property("_serverInfo");
    });

    it("should validate skill handler contracts", async () => {
      // Test that skill handlers return proper A2A objects
      const successResult = await successfulSkill.handler!({ data: "test" });
      expect(successResult).to.have.property("kind", "task");
      expect(successResult).to.have.property("id");
      expect(successResult).to.have.property("contextId");

      // Type guard to check if result is a Task
      if (successResult.kind === "task") {
        expect(successResult).to.have.property("status");
        expect(successResult.status).to.have.property(
          "state",
          TaskState.Completed
        );
      }

      const failResult = await failingSkillHandler.handler!({ data: "test" });
      expect(failResult).to.have.property("kind", "task");

      // Type guard to check if result is a Task
      if (failResult.kind === "task") {
        expect(failResult.status).to.have.property(
          "state",
          TaskState.Failed
        );
      }

      // Test that crashing skill actually throws
      try {
        await crashingSkill.handler!({ data: "test" });
        expect.fail("Expected crashing skill to throw an error");
      } catch (error: any) {
        expect(error.message).to.include("Intentional crash");
      }
    });
  });
});
