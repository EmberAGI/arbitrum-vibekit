export type DomainJsonScalarType = 'string' | 'number' | 'integer' | 'boolean';
export type DomainJsonType = DomainJsonScalarType | 'object' | 'array';

export type DomainJsonSchema = {
  type: DomainJsonType;
  description?: string;
  properties?: Record<string, DomainJsonSchema>;
  required?: readonly string[];
  items?: DomainJsonSchema;
  enum?: readonly (string | number | boolean)[];
  additionalProperties?: boolean;
};

export type CoreRuntimeRecord = 'PiThread' | 'PiExecution' | 'PiAutomation' | 'AutomationRun';
export type DomainProjectionInputSource = CoreRuntimeRecord | 'DomainState' | 'DomainInterrupt';
export type DomainProjectionHookName =
  | 'projectThread'
  | 'buildCurrentArtifact'
  | 'buildActivityArtifact'
  | 'buildA2Ui';
export type DomainTransitionTrigger = 'user' | 'automation' | 'system';

export type DomainCommandDefinition<TCommand extends string = string> = {
  name: TCommand;
  description: string;
};

export type DomainLifecycleTransition<
  TCommand extends string = string,
  TPhase extends string = string,
> = {
  command: TCommand;
  from: readonly TPhase[];
  to: TPhase;
  trigger: DomainTransitionTrigger;
  description: string;
};

export type DomainLifecycleDefinition<
  TPhase extends string = string,
  TCommand extends string = string,
> = {
  initialPhase: TPhase;
  phases: readonly TPhase[];
  terminalPhases: readonly TPhase[];
  transitions: readonly DomainLifecycleTransition<TCommand, TPhase>[];
};

export type DomainInterruptDefinition<TInterrupt extends string = string> = {
  type: TInterrupt;
  description: string;
  requestSchema: DomainJsonSchema;
  responseSchema: DomainJsonSchema;
  surfacedInThread: boolean;
};

export type DomainProjectionHookDefinition<THookName extends string = string> = {
  name: THookName;
  description: string;
  consumes: readonly DomainProjectionInputSource[];
  emits: readonly string[];
};

export type DomainAutomationPolicyHookDefinition<THookName extends string = string> = {
  name: THookName;
  description: string;
};

export type DomainRuntimeBoundary<
  TCommand extends string = string,
  TPhase extends string = string,
  TInterrupt extends string = string,
  TProjectionHook extends string = string,
  TAutomationHook extends string = string,
> = {
  coreRuntimeOwns: readonly CoreRuntimeRecord[];
  moduleOwns: {
    commands: readonly TCommand[];
    lifecyclePhases: readonly TPhase[];
    interrupts: readonly TInterrupt[];
    projectionHooks: readonly TProjectionHook[];
    automationPolicyHooks: readonly TAutomationHook[];
  };
};

export type AgentDomainModule<
  TCommand extends string = string,
  TPhase extends string = string,
  TInterrupt extends string = string,
  TProjectionHook extends string = string,
  TAutomationHook extends string = string,
> = {
  moduleId: string;
  version: string;
  summary: string;
  commands: readonly DomainCommandDefinition<TCommand>[];
  lifecycle: DomainLifecycleDefinition<TPhase, TCommand>;
  interrupts: readonly DomainInterruptDefinition<TInterrupt>[];
  projectionHooks: readonly DomainProjectionHookDefinition<TProjectionHook>[];
  automationPolicyHooks: readonly DomainAutomationPolicyHookDefinition<TAutomationHook>[];
  runtimeBoundary: DomainRuntimeBoundary<
    TCommand,
    TPhase,
    TInterrupt,
    TProjectionHook,
    TAutomationHook
  >;
};

const REQUIRED_PROJECTION_HOOKS = [
  'projectThread',
  'buildCurrentArtifact',
  'buildActivityArtifact',
  'buildA2Ui',
] as const satisfies readonly DomainProjectionHookName[];

const CORE_RUNTIME_RECORDS = [
  'PiThread',
  'PiExecution',
  'PiAutomation',
  'AutomationRun',
] as const satisfies readonly CoreRuntimeRecord[];

const assertUniqueValues = (label: string, values: readonly string[]): void => {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      throw new Error(`Duplicate ${label}: ${value}.`);
    }
    seen.add(value);
  }
};

const assertSubset = (
  label: string,
  values: readonly string[],
  allowedValues: ReadonlySet<string>,
  errorPrefix: string,
): void => {
  for (const value of values) {
    if (!allowedValues.has(value)) {
      throw new Error(`${errorPrefix}: ${value}.`);
    }
  }
  assertUniqueValues(label, values);
};

const assertExactBoundaryMatch = (
  label: string,
  boundaryValues: readonly string[],
  definitionValues: readonly string[],
): void => {
  assertSubset(label, boundaryValues, new Set(definitionValues), `Unknown ${label.slice(0, -1)}`);
  if (boundaryValues.length !== definitionValues.length) {
    throw new Error(`Boundary ${label} must enumerate every declared ${label.slice(0, -1)}.`);
  }
};

export function defineAgentDomainModule<
  const TCommand extends string,
  const TPhase extends string,
  const TInterrupt extends string,
  const TProjectionHook extends string,
  const TAutomationHook extends string,
>(
  definition: AgentDomainModule<TCommand, TPhase, TInterrupt, TProjectionHook, TAutomationHook>,
): AgentDomainModule<TCommand, TPhase, TInterrupt, TProjectionHook, TAutomationHook> {
  const commandNames = definition.commands.map((command) => command.name);
  const phaseNames = [...definition.lifecycle.phases];
  const terminalPhases = [...definition.lifecycle.terminalPhases];
  const interruptTypes = definition.interrupts.map((interrupt) => interrupt.type);
  const projectionHookNames = definition.projectionHooks.map((hook) => hook.name);
  const automationPolicyHookNames = definition.automationPolicyHooks.map((hook) => hook.name);

  assertUniqueValues('command', commandNames);
  assertUniqueValues('lifecycle phase', phaseNames);
  assertUniqueValues('interrupt type', interruptTypes);
  assertUniqueValues('projection hook', projectionHookNames);
  assertUniqueValues('automation policy hook', automationPolicyHookNames);

  const phaseSet = new Set<string>(phaseNames);
  if (!phaseSet.has(definition.lifecycle.initialPhase)) {
    throw new Error(`Unknown initial lifecycle phase: ${definition.lifecycle.initialPhase}.`);
  }

  assertSubset('terminal phases', terminalPhases, phaseSet, 'Unknown terminal lifecycle phase');

  const commandSet = new Set<string>(commandNames);
  for (const transition of definition.lifecycle.transitions) {
    if (!commandSet.has(transition.command)) {
      throw new Error(`Unknown lifecycle command: ${transition.command}.`);
    }
    assertSubset('transition phases', [...transition.from, transition.to], phaseSet, 'Unknown lifecycle phase');
  }

  const projectionHookSet = new Set<string>(projectionHookNames);
  for (const hookName of REQUIRED_PROJECTION_HOOKS) {
    if (!projectionHookSet.has(hookName)) {
      throw new Error(`Missing required projection hook: ${hookName}.`);
    }
  }

  const coreRuntimeSet = new Set<string>(CORE_RUNTIME_RECORDS);
  assertSubset(
    'core runtime records',
    definition.runtimeBoundary.coreRuntimeOwns,
    coreRuntimeSet,
    'Unknown core runtime record',
  );
  assertExactBoundaryMatch('commands', definition.runtimeBoundary.moduleOwns.commands, commandNames);
  assertExactBoundaryMatch(
    'lifecycle phases',
    definition.runtimeBoundary.moduleOwns.lifecyclePhases,
    phaseNames,
  );
  assertExactBoundaryMatch('interrupts', definition.runtimeBoundary.moduleOwns.interrupts, interruptTypes);
  assertExactBoundaryMatch(
    'projection hooks',
    definition.runtimeBoundary.moduleOwns.projectionHooks,
    projectionHookNames,
  );
  assertExactBoundaryMatch(
    'automation policy hooks',
    definition.runtimeBoundary.moduleOwns.automationPolicyHooks,
    automationPolicyHookNames,
  );

  return definition;
}

export const getDomainCommandNames = <
  TCommand extends string,
  TPhase extends string,
  TInterrupt extends string,
  TProjectionHook extends string,
  TAutomationHook extends string,
>(
  definition: AgentDomainModule<TCommand, TPhase, TInterrupt, TProjectionHook, TAutomationHook>,
): TCommand[] => definition.commands.map((command) => command.name);

export const getDomainInterruptTypes = <
  TCommand extends string,
  TPhase extends string,
  TInterrupt extends string,
  TProjectionHook extends string,
  TAutomationHook extends string,
>(
  definition: AgentDomainModule<TCommand, TPhase, TInterrupt, TProjectionHook, TAutomationHook>,
): TInterrupt[] => definition.interrupts.map((interrupt) => interrupt.type);

export const getProjectionHookNames = <
  TCommand extends string,
  TPhase extends string,
  TInterrupt extends string,
  TProjectionHook extends string,
  TAutomationHook extends string,
>(
  definition: AgentDomainModule<TCommand, TPhase, TInterrupt, TProjectionHook, TAutomationHook>,
): TProjectionHook[] => definition.projectionHooks.map((hook) => hook.name);
