import { z, ZodType } from "zod";
// Importing from the explicit compiled output path (with extension) avoids
// Node.js ESM resolution issues in production Docker images where specifier
// extension searching is disabled.
import {
  CallToolResultSchema,
  TextContentSchema,
} from "@modelcontextprotocol/sdk/types.js";

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

  // If the MCP tool signaled an error, extract and throw its message
  if (isError) {
    if (!content || content.length === 0) {
      throw new Error("MCP tool error without content.");
    }
    // Extract text from first content part and throw
    const { text } = TextContentSchema.parse(content[0]);
    throw new Error(text);
  }

  if (!content || content.length === 0) {
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
