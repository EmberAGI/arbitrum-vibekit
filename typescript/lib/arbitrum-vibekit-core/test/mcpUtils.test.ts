import { expect } from "chai";
import { defineSkill, Agent } from "../src/agent.js";
import {
  createMcpA2AResponse,
  createMcpErrorResponse,
  createMcpTextResponse,
} from "../src/mcpUtils.js";
import type { Task, Message } from "@google-a2a/types";
import { TaskState } from "@google-a2a/types";

describe("MCP Utils", () => {
  describe("createMcpA2AResponse", () => {
    it("should create a valid MCP response for A2A Task object", () => {
      const a2aTask: Task = {
        id: "task-123",
        contextId: "context-456",
        kind: "task",
        status: {
          state: TaskState.Completed,
          message: {
            role: "agent",
            parts: [{ kind: "text", text: "Task completed successfully" }],
            messageId: "msg-789",
            kind: "message",
          },
          timestamp: "2023-12-19T10:00:00.000Z",
        },
      };

      const result = createMcpA2AResponse(a2aTask, "test-agent");

      expect(result).to.have.property("content");
      expect(result.content).to.be.an("array").with.length(1);

      const contentItem = result.content![0]!;
      expect(contentItem.type).to.equal("resource");
      expect(contentItem).to.have.nested.property("resource.text");
      expect(contentItem).to.have.nested.property("resource.uri");
      expect(contentItem).to.have.nested.property(
        "resource.mimeType",
        "application/json"
      );

      // Verify the JSON content
      const parsedContent = JSON.parse((contentItem as any).resource.text);
      expect(parsedContent).to.deep.equal(a2aTask);
    });

    it("should create a valid MCP response for A2A Message object", () => {
      const a2aMessage: Message = {
        // Removed 'id' field - Message uses 'messageId'
        contextId: "context-456",
        kind: "message",
        role: "agent",
        parts: [{ kind: "text", text: "This is a message" }],
        messageId: "msg-123",
      };

      const result = createMcpA2AResponse(a2aMessage, "test-agent");

      expect(result).to.have.property("content");
      expect(result.content).to.be.an("array").with.length(1);

      const contentItem = result.content![0]!;
      expect(contentItem.type).to.equal("resource");
      expect((contentItem as any).resource.mimeType).to.equal(
        "application/json"
      );

      // Verify the JSON content
      const parsedContent = JSON.parse((contentItem as any).resource.text);
      expect(parsedContent).to.deep.equal(a2aMessage);
    });

    it("should generate unique URIs for different calls", () => {
      const a2aObject: Message = {
        // Removed 'id' field - Message uses 'messageId'
        contextId: "test-context",
        kind: "message",
        role: "agent",
        parts: [{ kind: "text", text: "Test" }],
        messageId: "test-msg",
      };

      const result1 = createMcpA2AResponse(a2aObject, "test-agent");
      const result2 = createMcpA2AResponse(a2aObject, "test-agent");

      const uri1 = (result1.content![0]! as any).resource.uri;
      const uri2 = (result2.content![0]! as any).resource.uri;

      expect(uri1).to.not.equal(uri2);
    });

    it("should handle agent names with special characters", () => {
      const a2aObject: Message = {
        // Removed 'id' field - Message uses 'messageId'
        contextId: "test-context",
        kind: "message",
        role: "agent",
        parts: [{ kind: "text", text: "Test" }],
        messageId: "test-msg",
      };

      const result = createMcpA2AResponse(
        a2aObject,
        "Test Agent With Spaces & Special!"
      );

      const uri = (result.content![0]! as any).resource.uri;
      expect(uri).to.match(
        /^tag:test-agent-with-spaces-special,\d{4}-\d{2}-\d{2}:/
      );
    });

    it("should use today's date in tag URI", () => {
      const a2aObject: Message = {
        // Removed 'id' field - Message uses 'messageId'
        contextId: "test-context",
        kind: "message",
        role: "agent",
        parts: [{ kind: "text", text: "Test" }],
        messageId: "test-msg",
      };

      const result = createMcpA2AResponse(a2aObject, "test-agent");
      const uri = (result.content![0]! as any).resource.uri;

      const today = new Date().toISOString().split("T")[0];
      expect(uri).to.include(today);
    });
  });

  describe("createMcpErrorResponse", () => {
    it("should create a valid error response with message only", () => {
      const errorMessage = "Something went wrong";
      const result = createMcpErrorResponse(errorMessage);

      expect(result).to.have.property("isError", true);
      expect(result).to.have.property("content");
      expect(result.content).to.be.an("array").with.length(1);

      const contentItem = result.content![0]!;
      expect(contentItem.type).to.equal("text");
      expect((contentItem as any).text).to.equal(errorMessage);
    });

    it("should create a valid error response with error name prefix", () => {
      const errorMessage = "Invalid input provided";
      const errorName = "ValidationError";
      const result = createMcpErrorResponse(errorMessage, errorName);

      expect(result).to.have.property("isError", true);
      expect(result).to.have.property("content");
      expect(result.content).to.be.an("array").with.length(1);

      const contentItem = result.content![0]!;
      expect(contentItem.type).to.equal("text");
      expect((contentItem as any).text).to.equal(
        "[ValidationError]: Invalid input provided"
      );
    });

    it("should handle empty error messages", () => {
      const result = createMcpErrorResponse("");

      expect(result).to.have.property("isError", true);
      expect((result.content![0]! as any).text).to.equal("");
    });
  });

  describe("createMcpTextResponse", () => {
    it("should create a valid text response", () => {
      const text = "This is a plain text response";
      const result = createMcpTextResponse(text);

      expect(result).to.not.have.property("isError");
      expect(result).to.have.property("content");
      expect(result.content).to.be.an("array").with.length(1);

      const contentItem = result.content![0]!;
      expect(contentItem.type).to.equal("text");
      expect((contentItem as any).text).to.equal(text);
    });

    it("should handle empty text", () => {
      const result = createMcpTextResponse("");

      expect((result.content![0]! as any).text).to.equal("");
    });

    it("should handle multiline text", () => {
      const text = "Line 1\nLine 2\nLine 3";
      const result = createMcpTextResponse(text);

      expect((result.content![0]! as any).text).to.equal(text);
    });
  });

  describe("URI format validation", () => {
    it("should generate valid Tag URIs according to RFC 4151", () => {
      const a2aObject: Message = {
        // Removed 'id' field - Message uses 'messageId'
        contextId: "test-context",
        kind: "message",
        role: "agent",
        parts: [{ kind: "text", text: "Test" }],
        messageId: "test-msg",
      };

      const result = createMcpA2AResponse(a2aObject, "example-agent");
      const uri = (result.content![0]! as any).resource.uri;

      // Should match the pattern: tag:authority,date:specific
      expect(uri).to.match(/^tag:[a-z0-9-]+,\d{4}-\d{2}-\d{2}:[a-zA-Z0-9_-]+$/);
    });

    it("should slugify agent names properly", () => {
      const a2aObject: Message = {
        // Removed 'id' field - Message uses 'messageId'
        contextId: "test-context",
        kind: "message",
        role: "agent",
        parts: [{ kind: "text", text: "Test" }],
        messageId: "test-msg",
      };

      // Test various problematic agent names
      const testCases = [
        { input: "Simple Agent", expected: "simple-agent" },
        { input: "Agent_With_Underscores", expected: "agent-with-underscores" },
        { input: "Agent123", expected: "agent123" },
        { input: "___Leading_Trailing___", expected: "leading-trailing" },
        { input: "Multiple   Spaces", expected: "multiple-spaces" },
        { input: "Special!@#$%Characters", expected: "special-characters" },
      ];

      testCases.forEach(({ input, expected }) => {
        const result = createMcpA2AResponse(a2aObject, input);
        const uri = (result.content![0]! as any).resource.uri;
        expect(uri).to.include(`tag:${expected},`);
      });
    });
  });
});
