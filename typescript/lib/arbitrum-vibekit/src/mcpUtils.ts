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
  const { content } = CallToolResultSchema.parse(rawResponse);

  if (content.length === 0) {
    throw new Error("MCP response content is empty.");
  }
  // Validate and extract 'text' from the first content item
  const { text } = TextContentSchema.parse(content[0]);

  // If no schema provided, return the text directly
  if (!schema) {
    return text;
  }

  // If schema is provided, try to parse as JSON and validate
  try {
    const jsonPayload = JSON.parse(text);
    return schema.parse(jsonPayload);
  } catch (e) {
    throw new Error(`Failed to parse or validate JSON: ${e instanceof Error ? e.message : String(e)}`);
  }
}
