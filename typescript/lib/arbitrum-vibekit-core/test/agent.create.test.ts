import { expect } from "chai";
import { z } from "zod";
import { Agent, defineSkill, VibkitToolDefinition } from "../src/agent.js";
import type { Task } from "@google-a2a/types";
import { TaskState } from "@google-a2a/types";

describe("Agent.create()", () => {
  const minimalToolParametersSchema = z.object({ param: z.string() });
  const minimalTool: VibkitToolDefinition<
    typeof minimalToolParametersSchema,
    Task
  > = {
    name: "minimal-test-tool",
    description: "A test tool",
    parameters: minimalToolParametersSchema,
    execute: async (args, context) => ({
      id: "test-task",
      contextId: "test-context",
      kind: "task",
      status: {
        state: TaskState.Completed,
        message: {
          kind: "message",
          role: "agent",
          parts: [{ kind: "text", text: args.param }],
          messageId: "msg-id",
        },
        timestamp: new Date().toISOString(),
      },
    }),
  };

  const minimalSkill = defineSkill({
    id: "test-skill",
    name: "Test Skill",
    description: "A test skill",
    tags: ["test"],
    examples: ["Test example"],
    inputSchema: z.object({ input: z.string() }),
    tools: [minimalTool],
  });

  const minimalAgentConfig = {
    name: "Test Agent",
    version: "1.0.0",
    description: "A test agent",
    url: "http://localhost:41241",
    capabilities: {
      streaming: false,
      pushNotifications: false,
      stateTransitionHistory: false,
    },
    defaultInputModes: ["application/json"],
    defaultOutputModes: ["application/json"],
    skills: [minimalSkill],
  };

  it("should create an agent with minimal valid configuration", () => {
    const agent = Agent.create(minimalAgentConfig);
    expect(agent).to.be.instanceOf(Agent);
    expect(agent.card.name).to.equal("Test Agent");
    expect(agent.card.version).to.equal("1.0.0");
    expect(agent.card.description).to.equal("A test agent");
    expect(agent.card.skills).to.have.lengthOf(1);
    expect(agent.card.skills![0]!.id).to.equal("test-skill");
    expect(agent.card.skills![0]!.name).to.equal("Test Skill");
  });

  it("should create an agent with an LLM model provided", () => {
    const mockLLM = {
      supports: { objectJson: true, objectToolMode: true },
      doGenerate: async (params: any) => {
        if (params.mode?.type === "object-json") {
          return {
            type: "result",
            finishReason: "stop",
            usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
            object: {},
          };
        }
        if (params.mode?.type === "object-tool") {
          return {
            type: "result",
            finishReason: "tool-calls",
            usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
            toolCalls: [{ toolCallId: "id", toolName: "test", args: "test" }],
          };
        }
        return {
          type: "result",
          text: "test",
          toolCalls: [],
          toolResults: [],
          finishReason: "stop",
          usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
          rawResponse: { headers: {} },
        };
      },
      doStream: async function* (params: any) {
        if (params.mode?.type === "object-json") {
          yield { type: "object-json-delta", objectDelta: "{}" };
        } else if (params.mode?.type === "object-tool") {
          yield {
            type: "tool-call-delta",
            toolCallId: "id",
            toolName: "test",
            argsTextDelta: "{}",
          };
        } else {
          yield { type: "text-delta", textDelta: "test" };
        }
        yield {
          type: "finish",
          finishReason: "stop",
          usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        };
      },
    } as any;

    const agent = Agent.create(minimalAgentConfig, {
      llm: {
        model: mockLLM,
      },
    });
    expect(agent).to.be.instanceOf(Agent);
  });

  it("should create an agent with a base system prompt", () => {
    const mockLLM = {
      supports: { objectJson: true, objectToolMode: true },
      doGenerate: async (params: any) => {
        return {
          type: "result",
          text: "test",
          toolCalls: [],
          toolResults: [],
          finishReason: "stop",
          usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
          rawResponse: { headers: {} },
        };
      },
      doStream: async function* (params: any) {
        yield { type: "text-delta", textDelta: "test" };
        yield {
          type: "finish",
          finishReason: "stop",
          usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        };
      },
    } as any;

    const systemPrompt = "This is a base system prompt.";
    const agent = Agent.create(minimalAgentConfig, {
      llm: {
        model: mockLLM,
        baseSystemPrompt: systemPrompt,
      },
    });
    expect(agent).to.be.instanceOf(Agent);
  });

  it("should throw an error when no skills are provided", () => {
    const invalidConfig = {
      name: "Test Agent",
      version: "1.0.0",
      description: "A test agent",
      url: "http://localhost:41241",
      capabilities: {
        streaming: false,
        pushNotifications: false,
        stateTransitionHistory: false,
      },
      defaultInputModes: ["application/json"],
      defaultOutputModes: ["application/json"],
      skills: [],
    };
    expect(() => Agent.create(invalidConfig as any)).to.throw(
      "Agent creation requires at least one skill to be defined in 'manifest.skills'."
    );
  });

  it("should throw an error when skill has no id", () => {
    expect(() =>
      defineSkill({
        id: "",
        name: "Test Skill",
        description: "A test skill",
        tags: ["test"],
        examples: ["Test example"],
        inputSchema: z.object({ input: z.string() }),
        tools: [minimalTool],
      } as any)
    ).to.throw("Skill must have a non-empty id");
  });

  it("should throw an error when skill has no tags", () => {
    expect(() =>
      defineSkill({
        id: "test-skill",
        name: "Test Skill",
        description: "A test skill",
        tags: [],
        examples: ["Test example"],
        inputSchema: z.object({ input: z.string() }),
        tools: [minimalTool],
      } as any)
    ).to.throw('Skill "Test Skill" must have at least one tag');
  });

  it("should throw an error when skill has no examples", () => {
    expect(() =>
      defineSkill({
        id: "test-skill",
        name: "Test Skill",
        description: "A test skill",
        tags: ["test"],
        examples: [],
        inputSchema: z.object({ input: z.string() }),
        tools: [minimalTool],
      } as any)
    ).to.throw('Skill "Test Skill" must have at least one example');
  });

  it("should throw an error when skill has no tools", () => {
    expect(() =>
      defineSkill({
        id: "test-skill",
        name: "Test Skill",
        description: "A test skill",
        tags: ["test"],
        examples: ["Test example"],
        inputSchema: z.object({ input: z.string() }),
        tools: [],
      } as any)
    ).to.throw(
      'Skill "Test Skill" must have at least one tool for business logic'
    );
  });

  it("should throw an error when skill has unsupported schema type", () => {
    expect(() =>
      defineSkill({
        id: "test-skill",
        name: "Test Skill",
        description: "A test skill",
        tags: ["test"],
        examples: ["Test example"],
        inputSchema: z.boolean(),
        tools: [minimalTool],
      } as any)
    ).to.throw('Skill "Test Skill": ZodBoolean not supported');
  });
});
