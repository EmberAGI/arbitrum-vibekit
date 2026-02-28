import type { AgentCommand } from './taskLifecycle.js';

export type CommandRoutingTarget =
  | 'hireCommand'
  | 'fireCommand'
  | 'runCycleCommand'
  | 'bootstrap'
  | 'syncState'
  | '__end__';

export function resolveRunCommandForThread(input: {
  parsedCommand: AgentCommand | null;
}): AgentCommand | undefined {
  return input.parsedCommand ?? undefined;
}

export function resolveCommandTargetForBootstrappedFlow(input: {
  resolvedCommand: string | null | undefined;
  bootstrapped: boolean;
}): CommandRoutingTarget {
  if (!input.resolvedCommand) {
    return '__end__';
  }

  switch (input.resolvedCommand) {
    case 'hire':
      return 'hireCommand';
    case 'fire':
      return 'fireCommand';
    case 'cycle':
      return input.bootstrapped ? 'runCycleCommand' : 'bootstrap';
    case 'sync':
      return input.bootstrapped ? 'syncState' : 'bootstrap';
    default:
      return '__end__';
  }
}
