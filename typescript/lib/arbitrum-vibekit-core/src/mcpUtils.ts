import { z, ZodType } from "zod";
// Importing from the explicit compiled output path (with extension) avoids
// Node.js ESM resolution issues in production Docker images where specifier
// extension searching is disabled.
import {
  CallToolResultSchema,
  TextContentSchema,
  CallToolResult,
} from "@modelcontextprotocol/sdk/types.js";
import type { Task, Message } from "@google-a2a/types/src/types.js";
import { nanoid } from "nanoid";

/**
 * Extracts the raw text content from an MCP tool response.
 * Use this when expecting a plain text response, not JSON.
 */
export function parseMcpToolResponseText(rawResponse: unknown): string {
  const { content, isError } = CallToolResultSchema.parse(rawResponse);

  if (isError) {
    if (content.length > 0) {
      const { text } = TextContentSchema.parse(content[0]);
      throw new Error(text);
    }
    throw new Error("MCP response is an error.");
  }

  if (content.length === 0) {
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
  const { content, isError } = CallToolResultSchema.parse(rawResponse);

  if (isError) {
    if (content.length > 0) {
      const { text } = TextContentSchema.parse(content[0]);
      throw new Error(text);
    }
    throw new Error("MCP response is an error.");
  }

  if (content.length === 0) {
    throw new Error("MCP response content is empty.");
  }

  // Validate and extract 'text' from the first content item
  const { text } = TextContentSchema.parse(content[0]);

  // Try to parse as JSON and validate against schema
  try {
    const jsonPayload = JSON.parse(text);
    return schema.parse(jsonPayload);
  } catch (e: unknown) {
    if (e instanceof SyntaxError) {
      throw new Error("Expected JSON payload but received plain text.");
    }
    // Otherwise it's a schema validation error
    throw e;
  }
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
