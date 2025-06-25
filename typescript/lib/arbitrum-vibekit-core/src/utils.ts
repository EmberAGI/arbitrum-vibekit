import { z } from 'zod';
import { VibkitError } from './error.js';
import { nanoid } from 'nanoid';
import escapeHtml from 'escape-html';
import type { AgentContext, VibkitToolDefinition } from './agent.js';
import type {
  Artifact,
  TaskStatus,
  Task,
  Message,
  Part,
} from '@google-a2a/types';
import { TaskState } from '@google-a2a/types';

/**
 * Error thrown when trying to use an unsupported Zod schema type
 */
export class UnsupportedSchemaError extends VibkitError {
  constructor(schemaType: string, skillName?: string) {
    const message = skillName
      ? `Skill "${skillName}": ${schemaType} not supported`
      : `${schemaType} not supported`;
    super('UnsupportedSchemaError', -32004, message); // Using UnsupportedOperationError code
  }
}

/**
 * Derives input MIME type from Zod input schema.
 * Used to align with A2A inputModes concept.
 *
 * @param inputSchema - Zod schema for input validation
 * @param skillNameForErrorMessage - Optional skill name for better error messages
 * @returns The input MIME type string
 * @throws UnsupportedSchemaError for unsupported schema types
 */
export function getInputMimeType(
  inputSchema: z.ZodTypeAny,
  skillNameForErrorMessage?: string
): string {
  if (inputSchema instanceof z.ZodString) {
    return 'text/plain';
  }

  if (inputSchema instanceof z.ZodObject || inputSchema instanceof z.ZodArray) {
    return 'application/json';
  }

  // Unsupported types
  if (inputSchema instanceof z.ZodBoolean) {
    throw new UnsupportedSchemaError('ZodBoolean', skillNameForErrorMessage);
  }
  if (inputSchema instanceof z.ZodNumber) {
    throw new UnsupportedSchemaError('ZodNumber', skillNameForErrorMessage);
  }
  if (inputSchema instanceof z.ZodEnum) {
    throw new UnsupportedSchemaError('ZodEnum', skillNameForErrorMessage);
  }
  if (inputSchema instanceof z.ZodNativeEnum) {
    throw new UnsupportedSchemaError('ZodNativeEnum', skillNameForErrorMessage);
  }

  throw new UnsupportedSchemaError(
    inputSchema._def?.typeName || 'Unknown',
    skillNameForErrorMessage
  );
}

/**
 * Generates a timestamp in ISO 8601 format.
 * @returns The current timestamp as a string.
 */
export function getCurrentTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Checks if a value is a plain object (excluding arrays and null).
 * @param value The value to check.
 * @returns True if the value is a plain object, false otherwise.
 */
export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Type guard to check if an object is a TaskStatus update (lacks 'parts').
 * Used to differentiate yielded updates from the handler.
 */
export function isTaskStatusUpdate(update: unknown): update is Omit<TaskStatus, 'timestamp'> {
  // Check if it has 'state' and NOT 'parts' (which Artifacts have)
  return isObject(update) && 'state' in update && !('parts' in (update as Record<string, unknown>));
}

/**
 * Type guard to check if an object is an Artifact update (has 'parts').
 * Used to differentiate yielded updates from the handler.
 */
export function isArtifactUpdate(update: unknown): update is Artifact {
  // Check if it has 'parts'
  return isObject(update) && 'parts' in (update as Record<string, unknown>);
}

/**
 * Creates an A2A Artifact object with the given parts and metadata.
 * @param parts - Array of Part objects for the artifact content
 * @param name - Optional name for the artifact
 * @param description - Optional description for the artifact
 * @param metadata - Optional metadata object
 * @returns A properly structured A2A Artifact
 */
export function createArtifact(
  parts: Part[],
  name?: string,
  description?: string,
  metadata?: Record<string, unknown>
): Artifact {
  return {
    artifactId: nanoid(),
    name,
    description,
    parts,
    metadata,
  };
}

/**
 * Creates an A2A Message object with the given content and role.
 * @param text - The message text content
 * @param role - The role (defaults to "agent")
 * @param contextId - Optional context ID for the message
 * @param taskId - Optional task ID for the message
 * @param metadata - Optional metadata for the message
 * @param referenceTaskIds - Optional array of reference task IDs for the message
 * @returns A properly structured A2A Message
 */
export function createInfoMessage(
  text: string,
  role: 'agent' | 'user' = 'agent',
  contextId?: string,
  taskId?: string,
  metadata?: Record<string, unknown>,
  referenceTaskIds?: string[]
): Message {
  return {
    kind: 'message',
    role,
    parts: [{ kind: 'text', text }],
    messageId: nanoid(),
    ...(contextId ? { contextId } : {}),
    ...(taskId ? { taskId } : {}),
    ...(metadata ? { metadata } : {}),
    ...(referenceTaskIds ? { referenceTaskIds } : {}),
  };
}

/**
 * Creates an A2A Task object indicating successful completion.
 * @param skillName - Name of the skill for contextId generation
 * @param artifacts - Optional array of artifacts produced by the task
 * @param message - Success message text
 * @param contextIdSuffix - Optional suffix for contextId (defaults to "success")
 * @returns A properly structured A2A Task with "completed" status
 */
export function createSuccessTask(
  skillName: string,
  artifacts?: Artifact[],
  message: string = 'Task completed successfully',
  contextIdSuffix: string = 'success'
): Task {
  return {
    id: nanoid(),
    contextId: `${skillName}-${contextIdSuffix}-${Date.now()}-${nanoid(6)}`,
    kind: 'task',
    status: {
      state: TaskState.Completed,
      message: createInfoMessage(message, 'agent'),
      timestamp: getCurrentTimestamp(),
    },
    ...(artifacts && artifacts.length > 0 ? { artifacts } : {}),
  };
}

/**
 * Creates an A2A Task object indicating failure.
 * @param skillName - Name of the skill for contextId generation
 * @param error - VibkitError or Error object with failure details
 * @param contextIdSuffix - Optional suffix for contextId (defaults to "error")
 * @returns A properly structured A2A Task with "failed" status
 */
export function createErrorTask(
  skillName: string,
  error: VibkitError | Error,
  contextIdSuffix: string = 'error'
): Task {
  const errorDetails =
    error instanceof VibkitError
      ? { name: error.name, message: error.message, code: error.code }
      : { name: error.name || 'Error', message: error.message };
  return {
    id: nanoid(),
    contextId: `${skillName}-${contextIdSuffix}-${Date.now()}-${nanoid(6)}`,
    kind: 'task',
    status: {
      state: TaskState.Failed,
      message: createInfoMessage(error.message, 'agent'),
      timestamp: getCurrentTimestamp(),
    },
    metadata: { error: errorDetails },
  };
}

/**
 * Formats a tool description with tags and examples in XML for MCP tool metadata.
 * @param description - The base description string
 * @param tags - Array of tag strings
 * @param examples - Array of example strings
 * @returns The formatted description string with XML tags/examples
 */
export function formatToolDescriptionWithTagsAndExamples(
  description: string,
  tags: string[],
  examples: string[]
): string {
  const tagsXml = `<tags>${tags.map(tag => `<tag>${escapeHtml(tag)}</tag>`).join('')}</tags>`;
  const examplesXml = `<examples>${examples
    .map(ex => `<example>${escapeHtml(ex)}</example>`)
    .join('')}</examples>`;
  return `${description}\n\n${tagsXml}\n${examplesXml}`;
}

/**
 * Hook function type that can transform data before or after tool execution
 */
export type HookFunction<TArgs, TResult, TContext = any, TSkillInput = any> = (
  data: TArgs,
  context: AgentContext<TContext, TSkillInput>
) => Promise<TArgs> | TArgs;

/**
 * Configuration for before/after hooks on a tool
 */
export interface HookConfig<TArgs, TResult, TContext = any, TSkillInput = any> {
  before?: HookFunction<TArgs, TArgs, TContext, TSkillInput>;
  after?: HookFunction<TResult, TResult, TContext, TSkillInput>;
}

/**
 * Wraps a VibkitToolDefinition with before/after hooks for composable behavior.
 * Before hooks can transform input arguments before the tool executes.
 * After hooks can transform the result after the tool executes.
 *
 * @param tool The tool to wrap with hooks
 * @param hooks Configuration object with optional before/after hooks
 * @returns A new VibkitToolDefinition with the hooks applied
 */
export function withHooks<TParams extends z.ZodTypeAny, TResult, TContext = any, TSkillInput = any>(
  tool: VibkitToolDefinition<TParams, TResult, TContext, TSkillInput>,
  hooks: HookConfig<z.infer<TParams>, TResult, TContext, TSkillInput>
): VibkitToolDefinition<TParams, TResult, TContext, TSkillInput> {
  return {
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
    execute: async (args, context) => {
      // Apply before hook if present
      let processedArgs = args;
      if (hooks.before) {
        processedArgs = await hooks.before(args, context);
      }

      // Execute the original tool
      let result = await tool.execute(processedArgs, context);

      // Apply after hook if present
      if (hooks.after) {
        result = await hooks.after(result, context);
      }

      return result;
    },
  };
}
