import type { CreateAgentRuntimeOptions } from 'agent-runtime';

type PortfolioManagerAgentTool = NonNullable<CreateAgentRuntimeOptions['tools']>[number];

type DiagnosticToolArgs = {
  label?: string;
};

function parseDiagnosticToolArgs(args: unknown): DiagnosticToolArgs {
  if (typeof args !== 'object' || args === null) {
    return {};
  }

  const label =
    'label' in args && typeof args.label === 'string' && args.label.trim().length > 0
      ? args.label.trim()
      : undefined;

  return { label };
}

export function createPortfolioManagerDiagnosticTool(): PortfolioManagerAgentTool {
  return {
    name: 'diagnostic_runtime_ping',
    label: 'Diagnostic Runtime Ping',
    description:
      'Diagnostic-only tool that returns a simple local payload without touching Shared Ember or domain commands.',
    parameters: {
      type: 'object',
      properties: {
        label: {
          type: 'string',
          description: 'Optional label to echo back in the diagnostic result.',
        },
      },
      additionalProperties: false,
    } as unknown as PortfolioManagerAgentTool['parameters'],
    execute: async (_toolCallId, args) => {
      const toolArgs = parseDiagnosticToolArgs(args);
      const executedAt = new Date().toISOString();
      const label = toolArgs.label ?? 'default';

      return {
        content: [
          {
            type: 'text' as const,
            text: `diagnostic runtime ping ok (${label}) at ${executedAt}`,
          },
        ],
        details: {
          label,
          executedAt,
          source: 'agent-portfolio-manager',
        },
      };
    },
  };
}
