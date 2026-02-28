import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  applyThreadPatch,
  createDefaultClmmThreadState,
  type ClmmState,
  reduceThreadStateForTest,
  type Task,
} from './context.js';

type EnvKey =
  | 'CLMM_STATE_TRANSITION_LOG_ENABLED'
  | 'CLMM_STATE_TRANSITION_LOG_PATH'
  | 'CLMM_STATE_TRANSITION_LOG_INCLUDE_FULL_PATCH';

const ORIGINAL_ENV: Record<EnvKey, string | undefined> = {
  CLMM_STATE_TRANSITION_LOG_ENABLED: process.env['CLMM_STATE_TRANSITION_LOG_ENABLED'],
  CLMM_STATE_TRANSITION_LOG_PATH: process.env['CLMM_STATE_TRANSITION_LOG_PATH'],
  CLMM_STATE_TRANSITION_LOG_INCLUDE_FULL_PATCH: process.env['CLMM_STATE_TRANSITION_LOG_INCLUDE_FULL_PATCH'],
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
});
