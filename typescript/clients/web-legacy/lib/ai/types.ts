/**
 * Temporary type definitions for AI SDK v5 migration
 *
 * DataStreamWriter was removed in AI SDK v5. This is a compatibility shim
 * for code that hasn't been migrated yet. These tools are currently unused
 * (commented out in route.ts) but need to type-check for the build.
 */

export interface DataStreamWriter {
  writeData(data: { type: string; content: unknown }): void;
}

/**
 * CoreTool type was removed in AI SDK v5. Using a generic Record type
 * as a placeholder until tools are properly migrated.
 */
export type CoreTool = Record<string, unknown>;
