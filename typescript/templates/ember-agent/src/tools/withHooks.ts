import type { VibkitToolDefinition, AgentContext } from '@emberai/arbitrum-vibekit-core';
import type { Task, Message } from '@emberai/arbitrum-vibekit-core/google-a2a-types';
import type { z } from 'zod';

/**
 * Hook function type that can either transform arguments or short-circuit with a Task/Message
 */
export type BeforeHook<TArgs, TContext = any, TSkillInput = any> = (
  args: TArgs,
  context: AgentContext<TContext, TSkillInput>
) => Promise<TArgs | Task | Message> | TArgs | Task | Message;

/**
 * After hook function type that transforms the result into a Task/Message
 */
export type AfterHook<TResult, TArgs, TContext = any, TSkillInput = any> = (
  result: TResult,
  context: AgentContext<TContext, TSkillInput>,
  args: TArgs
) => Promise<Task | Message>;

/**
 * Configuration for before/after hooks on a tool
 */
export interface EmberHookConfig<TArgs, TResult, TContext = any, TSkillInput = any> {
  before?: BeforeHook<TArgs, TContext, TSkillInput>;
  after?: AfterHook<TResult, TArgs, TContext, TSkillInput>;
}

/**
 * Wraps a VibkitToolDefinition with before/after hooks for the ember agent.
 * Before hooks can transform input arguments or return a Task/Message to short-circuit.
 * After hooks transform the raw result into a Task/Message.
 *
 * @param tool The tool to wrap with hooks
 * @param hooks Configuration object with optional before/after hooks
 * @returns A new VibkitToolDefinition with the hooks applied
 */
export function withHooks<TParams extends z.ZodTypeAny, TResult, TContext = any, TSkillInput = any>(
  tool: VibkitToolDefinition<TParams, TResult, TContext, TSkillInput>,
  hooks: EmberHookConfig<z.infer<TParams>, TResult, TContext, TSkillInput>
): VibkitToolDefinition<TParams, Task | Message, TContext, TSkillInput> {
  return {
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
    execute: async (args, context) => {
      // Apply before hook if present
      let processedArgs = args;
      if (hooks.before) {
        const beforeResult = await hooks.before(args, context);

        // Check if the hook returned a Task/Message (short-circuit)
        if (
          typeof beforeResult === 'object' &&
          beforeResult !== null &&
          'kind' in beforeResult &&
          (beforeResult.kind === 'task' || beforeResult.kind === 'message')
        ) {
          return beforeResult as Task | Message;
        }

        processedArgs = beforeResult as z.infer<TParams>;
      }

      // Execute the original tool
      const result = await tool.execute(processedArgs, context);

      // Apply after hook if present
      if (hooks.after) {
        return await hooks.after(result, context, processedArgs);
      }

      // If no after hook, the tool must already return Task | Message
      return result as Task | Message;
    },
  };
}
