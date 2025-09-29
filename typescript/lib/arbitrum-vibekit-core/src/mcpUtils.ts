import {
  CallToolResultSchema,
  TextContentSchema,
  CallToolResult,
} from "@modelcontextprotocol/sdk/types.js";
import type { Task, Message } from "@google-a2a/types";
import { nanoid } from "nanoid";
import { ZodType } from "zod";

/**
 * Extracts the raw text content from an MCP tool response.
 * Use this when expecting a plain text response, not JSON.
 */
export function parseMcpToolResponseText(rawResponse: unknown): string {
  const { content, isError } = CallToolResultSchema.parse(rawResponse);

  if (isError) {
    if (content && content.length > 0) {
      const { text } = TextContentSchema.parse(content[0]);
      throw new Error(text);
    }
    throw new Error("MCP response is an error.");
  }

  if (!content || content.length === 0) {
    throw new Error("MCP response content is empty.");
  }

  // Validate and extract 'text' from the first content item
  const { text } = TextContentSchema.parse(content[0]);
  return text;
}

/**
 * Parses and validates the JSON payload of an MCP tool response.
 * Use this when expecting a JSON response that should be validated against a schema.
 */
export function parseMcpToolResponsePayload<T>(
  rawResponse: unknown,
  schema: ZodType<T>
): T {
  const { content, structuredContent, isError } = CallToolResultSchema.parse(rawResponse);

  // If the MCP tool signaled an error, extract and throw its message
  if (isError) {
    if (!content || content.length === 0) {
      throw new Error("MCP tool error without content.");
    }
    // Extract text from first content part and throw
    const { text } = TextContentSchema.parse(content[0]);
    throw new Error(text);
  }

  if (!structuredContent) {
    throw new Error("Expected structured content but received text content.");
  }

  return schema.parse(structuredContent);
}

/**
 * Converts an agentId to a Tag URI authority: lowercase, hyphens for non-alphanumerics, no leading/trailing/collapsed hyphens.
 */
function toTagUriAuthority(agentId: string): string {
  return agentId
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-") // replace non-alphanum with hyphen
    .replace(/^-+|-+$/g, "") // trim leading/trailing hyphens
    .replace(/-+/g, "-"); // collapse multiple hyphens
}

/**
 * Creates an MCP tool response envelope for successful A2A responses.
 * The A2A object (Task or Message) is JSON stringified and wrapped in resource content.
 */
export function createMcpA2AResponse(
  a2aObject: Task | Message,
  agentId: string
): CallToolResult {
  const jsonString = JSON.stringify(a2aObject);
  const today = new Date().toISOString().split("T")[0]; // "YYYY-MM-DD"
  const authority = toTagUriAuthority(agentId);

  return {
    content: [
      {
        type: "resource" as const,
        resource: {
          text: jsonString,
          uri: `tag:${authority},${today}:${nanoid()}`,
          mimeType: "application/json",
        },
      } as const,
    ],
  };
}

/**
 * Creates an MCP tool response envelope for error responses.
 */
export function createMcpErrorResponse(
  message: string,
  errorName?: string
): CallToolResult {
  const responseText = errorName ? `[${errorName}]: ${message}` : message;
  return {
    isError: true,
    content: [
      {
        type: "text" as const,
        text: responseText,
      },
    ],
  };
}

/**
 * Creates an MCP tool response envelope for plain text responses.
 */
export function createMcpTextResponse(text: string): CallToolResult {
  return {
    content: [
      {
        type: "text" as const,
        text,
      },
    ],
  };
}
