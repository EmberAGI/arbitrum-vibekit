import { z, ZodType } from "zod";
// Importing from the explicit compiled output path (with extension) avoids
// Node.js ESM resolution issues in production Docker images where specifier
// extension searching is disabled.
import {
  CallToolResultSchema,
  TextContentSchema,
} from "@modelcontextprotocol/sdk/types.js";

/**
 * Parses the MCP envelope and returns a string or validated JSON.
 */
export function parseMcpToolResponse(rawResponse: unknown): string;
export function parseMcpToolResponse<T>(
  rawResponse: unknown,
  schema: ZodType<T>
): T;
export function parseMcpToolResponse<T>(
  rawResponse: unknown,
  schema?: ZodType<T>
): string | T {
  // Parse the MCP envelope
  const envelope = CallToolResultSchema.parse(rawResponse);

  // If the MCP tool signaled an error, extract and throw its message
  if (envelope.isError) {
    if (!envelope.content || envelope.content.length === 0) {
      throw new Error("MCP tool error without content.");
    }
    // Extract text from first content part and throw
    const { text } = TextContentSchema.parse(envelope.content[0]);
    throw new Error(text);
  }

  // Continue with normal content parsing
  const { content } = envelope;

  if (!content || content.length === 0) {
    throw new Error("MCP response content is empty.");
  }
  // Validate and extract 'text' from the first content item
  const { text } = TextContentSchema.parse(content[0]);

  let jsonPayload: unknown;
  try {
    jsonPayload = JSON.parse(text);
  } catch {
    if (schema) {
      throw new Error("Expected JSON payload but received plain text.");
    }
    return text;
  }

  if (!schema) {
    throw new Error("Expected plain text but received JSON payload.");
  }

  return schema.parse(jsonPayload);
}
