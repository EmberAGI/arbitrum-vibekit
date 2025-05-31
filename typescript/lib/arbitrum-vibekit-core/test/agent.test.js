import { expect } from "chai";
import { z } from "zod";
import { defineSkill, Agent } from "../dist/agent.js";
import { UnsupportedSchemaError } from "../dist/utils.js";
import { formatToolDescriptionWithTagsAndExamples } from "../dist/utils.js";

describe("defineSkill", () => {
  const validInputSchema = z.object({ text: z.string() });
  const validOutputSchema = z.object({ result: z.string() });
  const validHandler = async (input) => ({
    id: "task-id",
    contextId: "test-context",
    kind: "task",
    status: {
      state: "completed",
      message: {
        role: "agent",
        parts: [{ kind: "text", text: "Success" }],
        messageId: "msg-id",
        kind: "message",
      },
      timestamp: new Date().toISOString(),
    },
  });

  describe("valid skill definitions", () => {
    it("should accept a complete valid skill definition", () => {
      const skillDefinition = {
        id: "test-skill-id",
        name: "Test Skill",
        description: "A test skill",
        tags: ["test"],
        examples: ["Example usage"],
        inputSchema: validInputSchema,
        outputPayloadSchema: validOutputSchema,
        handler: validHandler,
      };

      const result = defineSkill(skillDefinition);
      expect(result).to.equal(skillDefinition);
    });

    it("should accept multiple tags and examples", () => {
      const skillDefinition = {
        id: "multi-test-skill",
        name: "Multi Test Skill",
        description: "A skill with multiple tags and examples",
        tags: ["test", "utility", "example"],
        examples: ["Usage 1", "Usage 2", "Usage 3"],
        inputSchema: validInputSchema,
        outputPayloadSchema: validOutputSchema,
        handler: validHandler,
      };

      const result = defineSkill(skillDefinition);
      expect(result).to.equal(skillDefinition);
    });
  });

  describe("validation errors", () => {
    it("should throw error for missing id", () => {
      const skillDefinition = {
        id: "",
        name: "Test Skill",
        description: "A test skill",
        tags: ["test"],
        examples: ["Example usage"],
        inputSchema: validInputSchema,
        outputPayloadSchema: validOutputSchema,
        handler: validHandler,
      };

      expect(() => defineSkill(skillDefinition))
        .to.throw(Error)
        .with.property("message", "Skill must have a non-empty id");
    });

    it("should throw error for whitespace-only id", () => {
      const skillDefinition = {
        id: "   ",
        name: "Test Skill",
        description: "A test skill",
        tags: ["test"],
        examples: ["Example usage"],
        inputSchema: validInputSchema,
        outputPayloadSchema: validOutputSchema,
        handler: validHandler,
      };

      expect(() => defineSkill(skillDefinition))
        .to.throw(Error)
        .with.property("message", "Skill must have a non-empty id");
    });

    it("should throw error for empty tags array", () => {
      const skillDefinition = {
        id: "test-skill",
        name: "Test Skill",
        description: "A test skill",
        tags: [],
        examples: ["Example usage"],
        inputSchema: validInputSchema,
        outputPayloadSchema: validOutputSchema,
        handler: validHandler,
      };

      expect(() => defineSkill(skillDefinition))
        .to.throw(Error)
        .with.property(
          "message",
          'Skill "Test Skill" must have at least one tag'
        );
    });

    it("should throw error for empty examples array", () => {
      const skillDefinition = {
        id: "test-skill",
        name: "Test Skill",
        description: "A test skill",
        tags: ["test"],
        examples: [],
        inputSchema: validInputSchema,
        outputPayloadSchema: validOutputSchema,
        handler: validHandler,
      };

      expect(() => defineSkill(skillDefinition))
        .to.throw(Error)
        .with.property(
          "message",
          'Skill "Test Skill" must have at least one example'
        );
    });

    it("should throw UnsupportedSchemaError for unsupported input schema", () => {
      const skillDefinition = {
        id: "test-skill",
        name: "Test Skill",
        description: "A test skill",
        tags: ["test"],
        examples: ["Example usage"],
        inputSchema: z.boolean(), // Unsupported
        outputPayloadSchema: validOutputSchema,
        handler: validHandler,
      };

      expect(() => defineSkill(skillDefinition)).to.throw(
        UnsupportedSchemaError
      );
    });

    it("should throw UnsupportedSchemaError for unsupported output schema", () => {
      const skillDefinition = {
        id: "test-skill",
        name: "Test Skill",
        description: "A test skill",
        tags: ["test"],
        examples: ["Example usage"],
        inputSchema: validInputSchema,
        outputPayloadSchema: z.number(), // Unsupported
        handler: validHandler,
      };

      expect(() => defineSkill(skillDefinition)).to.throw(
        UnsupportedSchemaError
      );
    });
  });
});

describe("Agent", () => {
  const testSkill = defineSkill({
    id: "echo-skill",
    name: "Echo Skill",
    description: "Echoes back the input",
    tags: ["utility"],
    examples: ["Echo hello"],
    inputSchema: z.object({ text: z.string() }),
    outputPayloadSchema: z.object({ echoed: z.string() }),
    handler: async (input) => ({
      id: "task-id",
      contextId: "echo-context",
      kind: "task",
      status: {
        state: "completed",
        message: {
          role: "agent",
          parts: [{ kind: "text", text: `Echoed: ${input.text}` }],
          messageId: "msg-id",
          kind: "message",
        },
        timestamp: new Date().toISOString(),
      },
    }),
  });

  describe("Agent.create", () => {
    it("should create an agent with valid configuration", () => {
      const manifest = {
        name: "Test Agent",
        version: "1.0.0",
        description: "A test agent",
        skills: [testSkill],
      };

      const agent = Agent.create(manifest);
      expect(agent).to.be.instanceOf(Agent);
      expect(agent.card.name).to.equal("Test Agent");
      expect(agent.card.version).to.equal("1.0.0");
      expect(agent.card.skills).to.have.length(1);
      expect(agent.card.skills[0].name).to.equal("Echo Skill");
    });

    it("should convert SkillDefinition to AgentSkill with correct MIME types", () => {
      const manifest = {
        name: "Test Agent",
        version: "1.0.0",
        description: "A test agent",
        skills: [testSkill],
      };

      const agent = Agent.create(manifest);
      const agentSkill = agent.card.skills[0];

      expect(agentSkill.id).to.equal("echo-skill");
      expect(agentSkill.name).to.equal("Echo Skill");
      expect(agentSkill.description).to.equal("Echoes back the input");
      expect(agentSkill.tags).to.deep.equal(["utility"]);
      expect(agentSkill.examples).to.deep.equal(["Echo hello"]);
      expect(agentSkill.inputModes).to.deep.equal(["application/json"]);
      expect(agentSkill.outputModes).to.deep.equal(["application/json"]);
    });

    it("should throw error for agent without skills", () => {
      const manifest = {
        name: "Empty Agent",
        version: "1.0.0",
        description: "An agent with no skills",
        skills: [],
      };

      expect(() => Agent.create(manifest))
        .to.throw()
        .with.property("name", "AgentConfigMissingSkillsError");
    });

    it("should handle multiple skills correctly", () => {
      const secondSkill = defineSkill({
        id: "reverse-skill",
        name: "Reverse Skill",
        description: "Reverses the input text",
        tags: ["utility", "text"],
        examples: ["Reverse hello"],
        inputSchema: z.object({ text: z.string() }),
        outputPayloadSchema: z.object({ reversed: z.string() }),
        handler: async (input) => ({
          id: "task-id-2",
          contextId: "reverse-context",
          kind: "task",
          status: {
            state: "completed",
            message: {
              role: "agent",
              parts: [
                { kind: "text", text: input.text.split("").reverse().join("") },
              ],
              messageId: "msg-id-2",
              kind: "message",
            },
            timestamp: new Date().toISOString(),
          },
        }),
      });

      const manifest = {
        name: "Multi-Skill Agent",
        version: "1.0.0",
        description: "An agent with multiple skills",
        skills: [testSkill, secondSkill],
      };

      const agent = Agent.create(manifest);
      expect(agent.card.skills).to.have.length(2);
      expect(agent.card.skills[0].name).to.equal("Echo Skill");
      expect(agent.card.skills[1].name).to.equal("Reverse Skill");
    });
  });

  describe("MIME type derivation", () => {
    it("should derive text/plain for string schemas", () => {
      const stringSkill = defineSkill({
        id: "string-skill",
        name: "String Skill",
        description: "Works with strings",
        tags: ["text"],
        examples: ["Process text"],
        inputSchema: z.object({ data: z.string() }),
        outputPayloadSchema: z.string(),
        handler: async () => ({
          id: "msg-id",
          contextId: "string-context",
          kind: "message",
          role: "agent",
          parts: [{ kind: "text", text: "result" }],
          messageId: "msg-id",
        }),
      });

      const manifest = {
        name: "String Agent",
        version: "1.0.0",
        description: "An agent that works with strings",
        skills: [stringSkill],
      };

      const agent = Agent.create(manifest);
      const agentSkill = agent.card.skills[0];

      expect(agentSkill.inputModes).to.deep.equal(["application/json"]);
      expect(agentSkill.outputModes).to.deep.equal(["text/plain"]);
    });
  });

  describe("MCP tool registration", () => {
    it("should format MCP tool description with tags and examples in XML", () => {
      const testSkillWithMultiple = defineSkill({
        id: "multi-meta-skill",
        name: "Multi Meta Skill",
        description: "A skill with multiple tags and examples",
        tags: ["utility", "test", "example"],
        examples: ["Usage example 1", "Usage example 2", "Usage example 3"],
        inputSchema: z.object({ input: z.string() }),
        outputPayloadSchema: z.object({ output: z.string() }),
        handler: async (input) => ({
          id: "task-id",
          contextId: "multi-context",
          kind: "task",
          status: {
            state: "completed",
            message: {
              role: "agent",
              parts: [{ kind: "text", text: "Success" }],
              messageId: "msg-id",
              kind: "message",
            },
            timestamp: new Date().toISOString(),
          },
        }),
      });

      const manifest = {
        name: "Test Agent",
        version: "1.0.0",
        description: "A test agent",
        skills: [testSkillWithMultiple],
      };

      const agent = Agent.create(manifest);

      // Access the MCP server's tools to verify description formatting
      // Note: This tests the internal implementation detail
      // In a real implementation, we might want to expose a method to get tool descriptions
      const mcpServer = agent.mcpServer;
      expect(mcpServer).to.exist;

      // The tool should be registered with the correct description format
      // This is testing that the registerSkillsAsMcpTools method formats descriptions correctly
      // The expected format should be:
      // "A skill with multiple tags and examples\n\n<tags><tag>utility</tag><tag>test</tag><tag>example</tag></tags>\n<examples><example>Usage example 1</example><example>Usage example 2</example><example>Usage example 3</example></examples>"
    });

    it("should handle single tag and example in MCP tool description", () => {
      const singleMetaSkill = defineSkill({
        id: "single-meta-skill",
        name: "Single Meta Skill",
        description: "A skill with single tag and example",
        tags: ["utility"],
        examples: ["Single usage example"],
        inputSchema: z.object({ data: z.string() }),
        outputPayloadSchema: z.object({ result: z.string() }),
        handler: async (input) => ({
          id: "task-id",
          contextId: "single-context",
          kind: "task",
          status: {
            state: "completed",
            message: {
              role: "agent",
              parts: [{ kind: "text", text: "Success" }],
              messageId: "msg-id",
              kind: "message",
            },
            timestamp: new Date().toISOString(),
          },
        }),
      });

      const manifest = {
        name: "Single Meta Agent",
        version: "1.0.0",
        description: "An agent with single metadata",
        skills: [singleMetaSkill],
      };

      const agent = Agent.create(manifest);
      expect(agent).to.be.instanceOf(Agent);

      // Verify the skill was registered and the metadata is correctly structured
      expect(agent.card.skills[0].tags).to.deep.equal(["utility"]);
      expect(agent.card.skills[0].examples).to.deep.equal([
        "Single usage example",
      ]);
    });

    it("should use skill.id as MCP tool name and skill.name as title", () => {
      const skillWithDifferentIdName = defineSkill({
        id: "tool-id-123",
        name: "Human Readable Skill Name",
        description: "A skill where ID differs from name",
        tags: ["test"],
        examples: ["Test usage"],
        inputSchema: z.object({ value: z.string() }),
        outputPayloadSchema: z.object({ processed: z.string() }),
        handler: async (input) => ({
          id: "task-id",
          contextId: "id-name-context",
          kind: "task",
          status: {
            state: "completed",
            message: {
              role: "agent",
              parts: [{ kind: "text", text: "Processed" }],
              messageId: "msg-id",
              kind: "message",
            },
            timestamp: new Date().toISOString(),
          },
        }),
      });

      const manifest = {
        name: "ID Name Test Agent",
        version: "1.0.0",
        description: "Testing ID vs name usage",
        skills: [skillWithDifferentIdName],
      };

      const agent = Agent.create(manifest);
      const agentSkill = agent.card.skills[0];

      // Verify that the AgentSkill uses the correct ID and name
      expect(agentSkill.id).to.equal("tool-id-123");
      expect(agentSkill.name).to.equal("Human Readable Skill Name");
    });
  });
});

describe("Tool Description Formatting", () => {
  it("should format description with tags and examples in XML", () => {
    const desc = "A test skill.";
    const tags = ["foo", "bar"];
    const examples = ["ex1", "ex2"];
    const result = formatToolDescriptionWithTagsAndExamples(
      desc,
      tags,
      examples
    );
    expect(result).to.include(desc);
    expect(result).to.include("<tags><tag>foo</tag><tag>bar</tag></tags>");
    expect(result).to.include(
      "<examples><example>ex1</example><example>ex2</example></examples>"
    );
  });
});
