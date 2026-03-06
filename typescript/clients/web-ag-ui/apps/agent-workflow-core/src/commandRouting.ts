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

export function resolveCycleCommandTarget(input: {
  bootstrapped: boolean;
  onboardingReady: boolean;
}): Extract<CommandRoutingTarget, 'bootstrap' | 'syncState' | 'runCycleCommand'> {
  if (!input.bootstrapped) {
    return 'bootstrap';
  }
  return input.onboardingReady ? 'runCycleCommand' : 'syncState';
}

export function resolveCommandReplayGuardState(input: {
  parsedCommand: AgentCommand | null;
  clientMutationId?: string;
  lastAppliedCommandMutationId?: string;
}): {
  suppressDuplicateCommand: boolean;
  lastAppliedCommandMutationId?: string;
} {
  if (!input.parsedCommand || input.parsedCommand === 'sync') {
    return {
      suppressDuplicateCommand: false,
      lastAppliedCommandMutationId: input.lastAppliedCommandMutationId,
    };
  }

  if (!input.clientMutationId || input.clientMutationId.length === 0) {
    return {
      suppressDuplicateCommand: false,
      lastAppliedCommandMutationId: input.lastAppliedCommandMutationId,
    };
  }

  if (input.clientMutationId === input.lastAppliedCommandMutationId) {
    return {
      suppressDuplicateCommand: true,
      lastAppliedCommandMutationId: input.lastAppliedCommandMutationId,
    };
  }

  return {
    suppressDuplicateCommand: false,
    lastAppliedCommandMutationId: input.clientMutationId,
  };
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
      return resolveCycleCommandTarget({
        bootstrapped: input.bootstrapped,
        onboardingReady: true,
      });
    case 'sync':
      return input.bootstrapped ? 'syncState' : 'bootstrap';
    default:
      return '__end__';
  }
}
