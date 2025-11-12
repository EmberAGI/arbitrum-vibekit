import type { AgentContext } from '@emberai/arbitrum-vibekit-core';
import type { Task, Message } from '@emberai/arbitrum-vibekit-core/google-a2a-types';

/**
 * Composes multiple 'before' hooks into a single 'before' hook.
 * Hooks are run in sequence, and any hook can short-circuit by returning a Task or Message.
 *
 * @param hooks An array of 'before' hook functions.
 * @returns A single 'before' hook function that runs the provided hooks in sequence.
 */
export function composeBeforeHooks<
  TArgs extends object,
  TContext extends AgentContext<any, any>,
>(
  ...hooks: Array<
    (args: TArgs, context: TContext) => Promise<TArgs | Task | Message> | TArgs | Task | Message
  >
): (args: TArgs, context: TContext) => Promise<TArgs | Task | Message> {
  return async (args, context) => {
    let currentArgs = args;
    for (const hook of hooks) {
      const result = await hook(currentArgs, context);
      // Check if the hook short-circuited by returning a Task or Message
      if (
        typeof result === 'object' &&
        result !== null &&
        'kind' in result &&
        (result.kind === 'task' || result.kind === 'message')
      ) {
        return result; // Short-circuit and return the Task/Message
      }
      currentArgs = result as TArgs; // Otherwise, it's the modified args
    }
    return currentArgs;
  };
}

/**
 * Composes multiple 'after' hooks into a single 'after' hook.
 * Hooks are run in sequence, each transforming the result.
 *
 * @param hooks An array of 'after' hook functions.
 * @returns A single 'after' hook function that runs the provided hooks in sequence.
 */
export function composeAfterHooks<
  TResult,
  TContext extends AgentContext<any, any>,
>(
  ...hooks: Array<(result: TResult, context: TContext) => Promise<TResult> | TResult>
): (result: TResult, context: TContext) => Promise<TResult> {
  return async (result, context) => {
    let currentResult = result;
    for (const hook of hooks) {
      currentResult = await hook(currentResult, context);
    }
    return currentResult;
  };
}
