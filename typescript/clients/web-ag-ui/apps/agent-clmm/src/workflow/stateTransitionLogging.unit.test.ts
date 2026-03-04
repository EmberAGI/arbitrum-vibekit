import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

const { copilotkitEmitStateMock } = vi.hoisted(() => ({
  copilotkitEmitStateMock: vi.fn(),
}));

vi.mock('@copilotkit/sdk-js/langgraph', () => ({
  copilotkitEmitState: copilotkitEmitStateMock,
}));

import {
  applyThreadPatch,
  createDefaultClmmThreadState,
  type ClmmState,
  reduceThreadStateForTest,
  type Task,
} from './context.js';
import { copilotkitEmitState } from './emitState.js';
import { createLangGraphCommand } from './langGraphCommandFactory.js';
import { buildLoggedStateUpdate } from './stateUpdateFactory.js';

type EnvKey =
  | 'CLMM_STATE_TRANSITION_LOG_ENABLED'
  | 'CLMM_STATE_TRANSITION_LOG_PATH'
  | 'CLMM_STATE_TRANSITION_LOG_INCLUDE_FULL_PATCH'
  | 'CLMM_STATE_EMISSION_LOG_ENABLED'
  | 'CLMM_STATE_EMISSION_LOG_PATH';

const ORIGINAL_ENV: Record<EnvKey, string | undefined> = {
  CLMM_STATE_TRANSITION_LOG_ENABLED: process.env['CLMM_STATE_TRANSITION_LOG_ENABLED'],
  CLMM_STATE_TRANSITION_LOG_PATH: process.env['CLMM_STATE_TRANSITION_LOG_PATH'],
  CLMM_STATE_TRANSITION_LOG_INCLUDE_FULL_PATCH: process.env['CLMM_STATE_TRANSITION_LOG_INCLUDE_FULL_PATCH'],
  CLMM_STATE_EMISSION_LOG_ENABLED: process.env['CLMM_STATE_EMISSION_LOG_ENABLED'],
  CLMM_STATE_EMISSION_LOG_PATH: process.env['CLMM_STATE_EMISSION_LOG_PATH'],
};

const resetTransitionLogEnv = () => {
  for (const key of Object.keys(ORIGINAL_ENV) as EnvKey[]) {
    const original = ORIGINAL_ENV[key];
    if (original === undefined) {
      delete process.env[key];
      continue;
    }
    process.env[key] = original;
  }
};

const createState = (): ClmmState => ({
  messages: [],
  copilotkit: { actions: [], context: [] },
  settings: { amount: undefined },
  private: {
    mode: undefined,
    pollIntervalMs: 30_000,
    streamLimit: 200,
    cronScheduled: false,
    bootstrapped: false,
  },
  thread: createDefaultClmmThreadState(),
});

const createTask = (state: 'working' | 'completed'): Task => ({
  id: 'task-1',
  taskStatus: {
    state,
    timestamp: new Date().toISOString(),
    message: {
      id: 'message-1',
      role: 'assistant',
      content: state,
    },
  },
});

describe('CLMM transition logging', () => {
  afterEach(() => {
    resetTransitionLogEnv();
    copilotkitEmitStateMock.mockReset();
  });

  it('writes an NDJSON record when applyThreadPatch changes render-driving state', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'clmm-transition-log-'));
    const logPath = join(tempDir, 'state-transitions.ndjson');

    process.env['CLMM_STATE_TRANSITION_LOG_ENABLED'] = 'true';
    process.env['CLMM_STATE_TRANSITION_LOG_PATH'] = logPath;
    process.env['CLMM_STATE_TRANSITION_LOG_INCLUDE_FULL_PATCH'] = 'true';

    const state = createState();
    applyThreadPatch(state, { task: createTask('working') });

    expect(existsSync(logPath)).toBe(true);

    const lines = readFileSync(logPath, 'utf8')
      .trim()
      .split('\n')
      .filter((line) => line.length > 0);

    expect(lines.length).toBe(1);
    const entry = JSON.parse(lines[0] ?? '{}') as {
      source?: string;
      changedFields?: string[];
      next?: { taskState?: string };
      patch?: { task?: { id?: string } };
    };

    expect(entry.source).toBe('applyThreadPatch');
    expect(entry.changedFields).toContain('taskState');
    expect(entry.next?.taskState).toBe('working');
    expect(entry.patch?.task?.id).toBe('task-1');

    rmSync(tempDir, { recursive: true, force: true });
  });

  it('does not write a log file when logging is disabled', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'clmm-transition-log-'));
    const logPath = join(tempDir, 'state-transitions.ndjson');

    delete process.env['CLMM_STATE_TRANSITION_LOG_ENABLED'];
    process.env['CLMM_STATE_TRANSITION_LOG_PATH'] = logPath;

    const state = createState();
    applyThreadPatch(state, { task: createTask('working') });

    expect(existsSync(logPath)).toBe(false);

    rmSync(tempDir, { recursive: true, force: true });
  });

  it('labels reducer-originated transitions with threadReducer source', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'clmm-transition-log-'));
    const logPath = join(tempDir, 'state-transitions.ndjson');

    process.env['CLMM_STATE_TRANSITION_LOG_ENABLED'] = 'true';
    process.env['CLMM_STATE_TRANSITION_LOG_PATH'] = logPath;
    process.env['CLMM_STATE_TRANSITION_LOG_INCLUDE_FULL_PATCH'] = 'false';

    const left = createDefaultClmmThreadState();
    reduceThreadStateForTest(left, { task: createTask('working') });

    expect(existsSync(logPath)).toBe(true);
    const entry = JSON.parse(readFileSync(logPath, 'utf8').trim()) as { source?: string };
    expect(entry.source).toBe('threadReducer');

    rmSync(tempDir, { recursive: true, force: true });
  });

  it('writes command emission records when command logging is enabled', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'clmm-emission-log-'));
    const logPath = join(tempDir, 'state-emissions.ndjson');

    process.env['CLMM_STATE_EMISSION_LOG_ENABLED'] = 'true';
    process.env['CLMM_STATE_EMISSION_LOG_PATH'] = logPath;

    createLangGraphCommand({
      goto: 'pollCycle',
      update: {
        thread: {
          task: createTask('working'),
          metrics: { iteration: 7 },
        },
      },
    });

    expect(existsSync(logPath)).toBe(true);
    const lines = readFileSync(logPath, 'utf8')
      .trim()
      .split('\n')
      .filter((line) => line.length > 0);
    expect(lines.length).toBe(1);

    const entry = JSON.parse(lines[0] ?? '{}') as {
      source?: string;
      goto?: string;
      updateKeys?: string[];
      threadPatchKeys?: string[];
      taskState?: string;
      metricsIteration?: number;
    };

    expect(entry.source).toBe('command');
    expect(entry.goto).toBe('pollCycle');
    expect(entry.updateKeys).toContain('thread');
    expect(entry.threadPatchKeys).toContain('task');
    expect(entry.taskState).toBe('working');
    expect(entry.metricsIteration).toBe(7);

    rmSync(tempDir, { recursive: true, force: true });
  });

  it('writes emission records when transition logging is enabled without emission flag', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'clmm-emission-log-'));
    const logPath = join(tempDir, 'state-emissions.ndjson');

    process.env['CLMM_STATE_TRANSITION_LOG_ENABLED'] = 'true';
    process.env['CLMM_STATE_EMISSION_LOG_PATH'] = logPath;
    delete process.env['CLMM_STATE_EMISSION_LOG_ENABLED'];

    createLangGraphCommand({
      goto: 'pollCycle',
      update: {
        thread: {
          task: createTask('working'),
        },
      },
    });

    expect(existsSync(logPath)).toBe(true);
    const lines = readFileSync(logPath, 'utf8')
      .trim()
      .split('\n')
      .filter((line) => line.length > 0);
    expect(lines.length).toBe(1);

    const entry = JSON.parse(lines[0] ?? '{}') as {
      source?: string;
      goto?: string;
      taskState?: string;
    };
    expect(entry.source).toBe('command');
    expect(entry.goto).toBe('pollCycle');
    expect(entry.taskState).toBe('working');

    rmSync(tempDir, { recursive: true, force: true });
  });

  it('writes plain state-update emission records when buildLoggedStateUpdate is used', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'clmm-emission-log-'));
    const logPath = join(tempDir, 'state-emissions.ndjson');

    process.env['CLMM_STATE_EMISSION_LOG_ENABLED'] = 'true';
    process.env['CLMM_STATE_EMISSION_LOG_PATH'] = logPath;

    buildLoggedStateUpdate('syncStateNode', {
      thread: {
        lifecycle: { phase: 'active' },
        task: createTask('working'),
        onboarding: { step: 2, key: 'funding-token' },
      },
    });

    expect(existsSync(logPath)).toBe(true);
    const lines = readFileSync(logPath, 'utf8')
      .trim()
      .split('\n')
      .filter((line) => line.length > 0);
    expect(lines.length).toBe(1);

    const entry = JSON.parse(lines[0] ?? '{}') as {
      source?: string;
      origin?: string;
      lifecyclePhase?: string;
      onboardingStep?: number;
      onboardingKey?: string;
      taskState?: string;
    };

    expect(entry.source).toBe('state-update');
    expect(entry.origin).toBe('syncStateNode');
    expect(entry.lifecyclePhase).toBe('active');
    expect(entry.onboardingStep).toBe(2);
    expect(entry.onboardingKey).toBe('funding-token');
    expect(entry.taskState).toBe('working');

    rmSync(tempDir, { recursive: true, force: true });
  });

  it('writes emit-state emission records when copilotkit state is emitted', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'clmm-emission-log-'));
    const logPath = join(tempDir, 'state-emissions.ndjson');

    process.env['CLMM_STATE_EMISSION_LOG_ENABLED'] = 'true';
    process.env['CLMM_STATE_EMISSION_LOG_PATH'] = logPath;
    copilotkitEmitStateMock.mockResolvedValue(undefined);

    await copilotkitEmitState(
      {} as Parameters<typeof copilotkitEmitState>[0],
      {
        thread: {
          task: createTask('working'),
          metrics: { iteration: 11 },
        },
      },
    );

    expect(copilotkitEmitStateMock).toHaveBeenCalledTimes(1);
    expect(existsSync(logPath)).toBe(true);
    const lines = readFileSync(logPath, 'utf8')
      .trim()
      .split('\n')
      .filter((line) => line.length > 0);
    expect(lines.length).toBe(1);

    const entry = JSON.parse(lines[0] ?? '{}') as {
      source?: string;
      origin?: string;
      taskState?: string;
      metricsIteration?: number;
    };

    expect(entry.source).toBe('emit-state');
    expect(entry.origin).toBeUndefined();
    expect(entry.taskState).toBe('working');
    expect(entry.metricsIteration).toBe(11);

    rmSync(tempDir, { recursive: true, force: true });
  });
});
