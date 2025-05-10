import { z, ZodType } from "zod";
import {
  CallToolResultSchema,
  TextContentSchema,
} from "@modelcontextprotocol/sdk/types";

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
