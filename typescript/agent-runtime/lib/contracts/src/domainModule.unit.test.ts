import { describe, expect, it } from 'vitest';

import {
  defiLifecycleDomainModule,
  defineAgentDomainModule,
  getDomainCommandNames,
  getDomainInterruptTypes,
  getProjectionHookNames,
} from './index.js';

describe('domainModule', () => {
  it('defines a pluggable SPI for commands, lifecycle, interrupts, projections, and automation policy hooks', () => {
    const domainModule = defineAgentDomainModule({
      moduleId: 'operator-lifecycle',
      version: '0.1.0',
      summary: 'Lifecycle contract for a generic operator domain module.',
      commands: [
        {
          name: 'activate',
          description: 'Start operator activity for the current thread.',
        },
        {
          name: 'retire',
          description: 'Retire operator activity and close the lifecycle.',
        },
      ],
      lifecycle: {
        initialPhase: 'draft',
        phases: ['draft', 'active', 'inactive'],
        terminalPhases: ['inactive'],
        transitions: [
          {
            command: 'activate',
            from: ['draft'],
            to: 'active',
            trigger: 'user',
            description: 'Activate the operator lifecycle.',
          },
          {
            command: 'retire',
            from: ['active'],
            to: 'inactive',
            trigger: 'user',
            description: 'Retire the operator lifecycle.',
          },
        ],
      },
      interrupts: [
        {
          type: 'approval',
          description: 'Request approval before activation continues.',
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
              approved: { type: 'boolean' },
            },
            required: ['approved'],
            additionalProperties: false,
          },
          surfacedInThread: true,
        },
      ],
      projectionHooks: [
        {
          name: 'projectThread',
          description: 'Project domain state into the visible thread view.',
          consumes: ['PiThread', 'PiExecution', 'DomainState'],
          emits: ['thread-patch'],
        },
        {
          name: 'buildCurrentArtifact',
          description: 'Build the stable current-state artifact for the thread.',
          consumes: ['PiThread', 'PiExecution', 'DomainState'],
          emits: ['current-artifact'],
        },
        {
          name: 'buildActivityArtifact',
          description: 'Build the append-only activity artifact for the thread.',
          consumes: ['PiExecution', 'DomainState'],
          emits: ['activity-artifact'],
        },
        {
          name: 'buildA2Ui',
          description: 'Build inline A2UI payloads for the active interrupt or step.',
          consumes: ['PiThread', 'PiExecution', 'DomainInterrupt'],
          emits: ['a2ui-payload'],
        },
      ],
      automationPolicyHooks: [
        {
          name: 'canResumeAutomation',
          description: 'Decide whether paused work may resume automatically.',
        },
      ],
      runtimeBoundary: {
        coreRuntimeOwns: ['PiThread', 'PiExecution', 'PiAutomation', 'AutomationRun'],
        moduleOwns: {
          commands: ['activate', 'retire'],
          lifecyclePhases: ['draft', 'active', 'inactive'],
          interrupts: ['approval'],
          projectionHooks: [
            'projectThread',
            'buildCurrentArtifact',
            'buildActivityArtifact',
            'buildA2Ui',
          ],
          automationPolicyHooks: ['canResumeAutomation'],
        },
      },
    });

    expect(getDomainCommandNames(domainModule)).toEqual(['activate', 'retire']);
    expect(getDomainInterruptTypes(domainModule)).toEqual(['approval']);
    expect(getProjectionHookNames(domainModule)).toEqual([
      'projectThread',
      'buildCurrentArtifact',
      'buildActivityArtifact',
      'buildA2Ui',
    ]);
  });

  it('captures the first DeFi lifecycle module boundary above the Pi core runtime', () => {
    expect(defiLifecycleDomainModule.moduleId).toBe('defi-lifecycle');
    expect(defiLifecycleDomainModule.runtimeBoundary.coreRuntimeOwns).toEqual([
      'PiThread',
      'PiExecution',
      'PiAutomation',
      'AutomationRun',
    ]);
    expect(getDomainCommandNames(defiLifecycleDomainModule)).toEqual([
      'hire',
      'setup',
      'sync',
      'fire',
    ]);
    expect(getDomainInterruptTypes(defiLifecycleDomainModule)).toEqual([
      'operator-config',
      'delegation-approval',
      'sync-review',
      'fire-confirmation',
    ]);
    expect(getProjectionHookNames(defiLifecycleDomainModule)).toEqual([
      'projectThread',
      'buildCurrentArtifact',
      'buildActivityArtifact',
      'buildA2Ui',
    ]);
    expect(defiLifecycleDomainModule.lifecycle.transitions).toContainEqual({
      command: 'fire',
      from: ['hired', 'setup', 'active', 'syncing'],
      to: 'inactive',
      trigger: 'user',
      description: 'Terminate the active DeFi operator lifecycle.',
    });
    expect(defiLifecycleDomainModule.runtimeBoundary.moduleOwns.automationPolicyHooks).toEqual([
      'shouldScheduleSync',
      'buildAutomationContext',
    ]);
  });

  it('rejects lifecycle transitions that reference undeclared commands', () => {
    expect(() =>
      defineAgentDomainModule({
        moduleId: 'invalid-module',
        version: '0.1.0',
        summary: 'Invalid contract for validation coverage.',
        commands: [
          {
            name: 'hire',
            description: 'Hire the operator.',
          },
        ],
        lifecycle: {
          initialPhase: 'prehire',
          phases: ['prehire', 'active'],
          terminalPhases: [],
          transitions: [
            {
              command: 'fire',
              from: ['active'],
              to: 'prehire',
              trigger: 'user',
              description: 'This command is undeclared and should fail.',
            },
          ],
        },
        interrupts: [],
        projectionHooks: [
          {
            name: 'projectThread',
            description: 'Project thread state.',
            consumes: ['PiThread', 'DomainState'],
            emits: ['thread-patch'],
          },
          {
            name: 'buildCurrentArtifact',
            description: 'Build the current artifact.',
            consumes: ['PiThread', 'DomainState'],
            emits: ['current-artifact'],
          },
          {
            name: 'buildActivityArtifact',
            description: 'Build the activity artifact.',
            consumes: ['PiExecution', 'DomainState'],
            emits: ['activity-artifact'],
          },
          {
            name: 'buildA2Ui',
            description: 'Build inline UI.',
            consumes: ['PiExecution', 'DomainInterrupt'],
            emits: ['a2ui-payload'],
          },
        ],
        automationPolicyHooks: [],
        runtimeBoundary: {
          coreRuntimeOwns: ['PiThread', 'PiExecution'],
          moduleOwns: {
            commands: ['hire'],
            lifecyclePhases: ['prehire', 'active'],
            interrupts: [],
            projectionHooks: [
              'projectThread',
              'buildCurrentArtifact',
              'buildActivityArtifact',
              'buildA2Ui',
            ],
            automationPolicyHooks: [],
          },
        },
      }),
    ).toThrow('Unknown lifecycle command: fire.');
  });
});
