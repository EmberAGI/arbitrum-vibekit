import { defineAgentDomainModule } from './domainModule.js';

export const DEFI_LIFECYCLE_COMMANDS = ['hire', 'setup', 'sync', 'fire'] as const;
export const DEFI_LIFECYCLE_PHASES = [
  'prehire',
  'hired',
  'setup',
  'active',
  'syncing',
  'inactive',
] as const;
export const DEFI_LIFECYCLE_INTERRUPTS = [
  'operator-config',
  'delegation-approval',
  'sync-review',
  'fire-confirmation',
] as const;

export const defiLifecycleDomainModule = defineAgentDomainModule({
  moduleId: 'defi-lifecycle',
  version: '0.1.0',
  summary:
    'Pi-owned DeFi lifecycle module for hire/setup/sync/fire flows layered above the core runtime.',
  commands: [
    {
      name: 'hire',
      description: 'Start the DeFi operator lifecycle for a newly selected strategy.',
    },
    {
      name: 'setup',
      description: 'Collect operator configuration and delegation prerequisites.',
    },
    {
      name: 'sync',
      description: 'Refresh the active strategy state and reconcile pending work.',
    },
    {
      name: 'fire',
      description: 'Terminate the active DeFi operator lifecycle and revoke future activity.',
    },
  ],
  lifecycle: {
    initialPhase: 'prehire',
    phases: DEFI_LIFECYCLE_PHASES,
    terminalPhases: ['inactive'],
    transitions: [
      {
        command: 'hire',
        from: ['prehire'],
        to: 'hired',
        trigger: 'user',
        description: 'Commit to a DeFi operator and create the owned lifecycle.',
      },
      {
        command: 'setup',
        from: ['hired'],
        to: 'setup',
        trigger: 'user',
        description: 'Collect setup state that belongs to the domain module.',
      },
      {
        command: 'sync',
        from: ['setup', 'active'],
        to: 'syncing',
        trigger: 'automation',
        description: 'Run a reusable sync cycle against the active DeFi configuration.',
      },
      {
        command: 'fire',
        from: ['hired', 'setup', 'active', 'syncing'],
        to: 'inactive',
        trigger: 'user',
        description: 'Terminate the active DeFi operator lifecycle.',
      },
    ],
  },
  interrupts: [
    {
      type: 'operator-config',
      description: 'Collect the operator configuration required to continue setup.',
      requestSchema: {
        type: 'object',
        properties: {
          missingFields: {
            type: 'array',
            items: { type: 'string' },
          },
        },
        required: ['missingFields'],
        additionalProperties: false,
      },
      responseSchema: {
        type: 'object',
        properties: {
          operatorName: { type: 'string' },
          mandate: { type: 'string' },
        },
        required: ['operatorName', 'mandate'],
        additionalProperties: false,
      },
      surfacedInThread: true,
    },
    {
      type: 'delegation-approval',
      description: 'Request delegation approval before automation or trading may continue.',
      requestSchema: {
        type: 'object',
        properties: {
          chainId: { type: 'integer' },
          delegateAddress: { type: 'string' },
        },
        required: ['chainId', 'delegateAddress'],
        additionalProperties: false,
      },
      responseSchema: {
        type: 'object',
        properties: {
          approved: { type: 'boolean' },
          signatureId: { type: 'string' },
        },
        required: ['approved'],
        additionalProperties: false,
      },
      surfacedInThread: true,
    },
    {
      type: 'sync-review',
      description: 'Ask the user to review a sync plan before applying visible changes.',
      requestSchema: {
        type: 'object',
        properties: {
          summary: { type: 'string' },
        },
        required: ['summary'],
        additionalProperties: false,
      },
      responseSchema: {
        type: 'object',
        properties: {
          approved: { type: 'boolean' },
        },
        required: ['approved'],
        additionalProperties: false,
      },
      surfacedInThread: true,
    },
    {
      type: 'fire-confirmation',
      description: 'Confirm teardown before the module transitions into the inactive state.',
      requestSchema: {
        type: 'object',
        properties: {
          reason: { type: 'string' },
        },
        required: ['reason'],
        additionalProperties: false,
      },
      responseSchema: {
        type: 'object',
        properties: {
          confirmed: { type: 'boolean' },
        },
        required: ['confirmed'],
        additionalProperties: false,
      },
      surfacedInThread: true,
    },
  ],
  projectionHooks: [
    {
      name: 'projectThread',
      description: 'Project domain lifecycle state into the canonical PiThread view.',
      consumes: ['PiThread', 'PiExecution', 'DomainState'],
      emits: ['thread-patch', 'lifecycle-summary'],
    },
    {
      name: 'buildCurrentArtifact',
      description: 'Build the stable current-state artifact for the root thread.',
      consumes: ['PiThread', 'PiExecution', 'DomainState'],
      emits: ['current-artifact'],
    },
    {
      name: 'buildActivityArtifact',
      description: 'Build the append-only activity artifact for user-visible history.',
      consumes: ['PiExecution', 'DomainState'],
      emits: ['activity-artifact'],
    },
    {
      name: 'buildA2Ui',
      description: 'Build inline A2UI payloads for setup, sync review, and fire confirmation.',
      consumes: ['PiThread', 'PiExecution', 'DomainInterrupt'],
      emits: ['a2ui-payload'],
    },
  ],
  automationPolicyHooks: [
    {
      name: 'shouldScheduleSync',
      description: 'Decide whether saved automation may enqueue a sync run for this module.',
    },
    {
      name: 'buildAutomationContext',
      description: 'Build the domain context required by automation-triggered sync executions.',
    },
  ],
  runtimeBoundary: {
    coreRuntimeOwns: ['PiThread', 'PiExecution', 'PiAutomation', 'AutomationRun'],
    moduleOwns: {
      commands: DEFI_LIFECYCLE_COMMANDS,
      lifecyclePhases: DEFI_LIFECYCLE_PHASES,
      interrupts: DEFI_LIFECYCLE_INTERRUPTS,
      projectionHooks: [
        'projectThread',
        'buildCurrentArtifact',
        'buildActivityArtifact',
        'buildA2Ui',
      ],
      automationPolicyHooks: ['shouldScheduleSync', 'buildAutomationContext'],
    },
  },
});
