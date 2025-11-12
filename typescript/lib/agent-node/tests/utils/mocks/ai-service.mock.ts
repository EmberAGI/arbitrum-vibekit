import type { AIContext, AIOptions, AIService } from '../../../src/ai/service.js';

/**
 * Stub implementation of AIService for testing
 */
export class StubAIService implements Partial<AIService> {
  public readonly availableTools = new Map<string, unknown>();
  public readonly processCalls: Array<{ context: AIContext; options?: AIOptions }> = [];
  public processHandler?: (context: AIContext, options?: AIOptions) => AsyncIterable<unknown>;

  streamMessage(context: AIContext, options?: AIOptions): AsyncIterable<unknown> {
    this.processCalls.push({ context, options });
    if (this.processHandler) {
      return this.processHandler(context, options);
    }
    // Return empty async iterable
    return (async function* () {})();
  }

  /**
   * Align with real AIService API used by test server to keep tools in sync
   */
  setTools(tools: Map<string, unknown>): void {
    this.availableTools.clear();
    for (const [name, def] of tools.entries()) {
      this.availableTools.set(name, def);
    }
  }

  /**
   * Set a handler for streamMessage calls
   */
  setProcessHandler(
    handler: (context: AIContext, options?: AIOptions) => AsyncIterable<unknown>,
  ): void {
    this.processHandler = handler;
  }

  /**
   * Helper to set a simple generator handler
   */
  setSimpleResponse(events: unknown[]): void {
    // Synthesize tool-result events for tool-call entries when tests don't provide them
    this.processHandler = async function* (_context: AIContext, options?: AIOptions) {
      await Promise.resolve();
      const evts = Array.isArray(events) ? events : [];
      const hasExplicitToolResult = evts.some(
        (e: unknown) =>
          !!e &&
          typeof e === 'object' &&
          'type' in (e as Record<string, unknown>) &&
          (e as { type?: unknown }).type === 'tool-result',
      );

      for (const raw of evts) {
        const event = raw;
        yield event;

        const isToolCall =
          !!event &&
          typeof event === 'object' &&
          'type' in (event as Record<string, unknown>) &&
          (event as { type?: unknown }).type === 'tool-call' &&
          'toolName' in (event as Record<string, unknown>);

        if (!hasExplicitToolResult && isToolCall) {
          // Attempt to execute the tool via options.tools to mimic AI SDK behavior
          const toolName = (event as { toolName: unknown }).toolName as string;
          const args =
            (event as { args?: unknown; input?: unknown }).args ??
            (event as { args?: unknown; input?: unknown }).input;

          const toolsRecord = options?.tools as unknown as
            | Record<string, { execute?: (a: unknown) => Promise<unknown> }>
            | undefined;
          let output: unknown = undefined;
          try {
            const tool = toolsRecord?.[toolName];
            if (tool && typeof tool.execute === 'function') {
              output = await tool.execute(args);
            }
          } catch (err) {
            output = { error: err instanceof Error ? err.message : String(err) };
          }

          yield {
            type: 'tool-result',
            toolCallId: (event as { toolCallId?: unknown }).toolCallId as string | undefined,
            toolName,
            output,
          } as unknown;
        }
      }
    };
  }

  /**
   * Add a tool to available tools
   */
  addTool(name: string, definition: unknown): void {
    this.availableTools.set(name, definition);
  }

  /**
   * Clear all recorded calls
   */
  clearCalls(): void {
    this.processCalls.length = 0;
  }

  /**
   * Reset all state
   */
  reset(): void {
    this.clearCalls();
    this.availableTools.clear();
    this.processHandler = undefined;
  }
}
