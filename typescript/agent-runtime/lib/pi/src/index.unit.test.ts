import { readFileSync } from 'node:fs';

import { describe, expect, it, vi } from 'vitest';

import { createPiRuntimeGatewayService } from './index.js';

describe('agent-runtime-pi package contract', () => {
  it('anchors the gateway service on the real Pi foundation and shared runtime layers', () => {
    const packageJson = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    ) as {
      name?: string;
      dependencies?: Record<string, string>;
      scripts?: Record<string, string>;
    };

    expect(packageJson.name).toBe('agent-runtime-pi');
    expect(packageJson.dependencies).toMatchObject({
      '@mariozechner/pi-agent-core': expect.any(String),
      '@mariozechner/pi-ai': expect.any(String),
      'agent-runtime-contracts': 'workspace:^',
      'agent-runtime-postgres': 'workspace:^',
    });
    expect(packageJson.scripts).toMatchObject({
      build: expect.any(String),
      lint: expect.any(String),
      test: expect.any(String),
      'test:ci': expect.any(String),
    });
  });

  it('creates an AG-UI gateway surface without collapsing operator controls into runtime commands', async () => {
    const runtime = {
      connect: vi.fn(async () => [{ type: 'STATE_SNAPSHOT' }]),
      run: vi.fn(async () => [{ type: 'RUN_STARTED' }]),
      stop: vi.fn(async () => undefined),
    };
    const controlPlane = {
      inspectHealth: vi.fn(async () => ({ status: 'ok' as const })),
      listExecutions: vi.fn(async () => ['exec-1']),
    };

    const service = createPiRuntimeGatewayService({
      runtime,
      controlPlane,
    });

    expect(service).toMatchObject({
      connect: expect.any(Function),
      run: expect.any(Function),
      stop: expect.any(Function),
      control: {
        inspectHealth: expect.any(Function),
        listExecutions: expect.any(Function),
      },
    });
    expect(service).not.toHaveProperty('inspectHealth');

    await expect(service.connect({ threadId: 'thread-1' })).resolves.toEqual([{ type: 'STATE_SNAPSHOT' }]);
    await expect(service.run({ threadId: 'thread-1', runId: 'run-1' })).resolves.toEqual([{ type: 'RUN_STARTED' }]);
    await expect(service.stop({ threadId: 'thread-1', runId: 'run-1' })).resolves.toBeUndefined();
    await expect(service.control.inspectHealth()).resolves.toEqual({ status: 'ok' });
    await expect(service.control.listExecutions()).resolves.toEqual(['exec-1']);
  });
});
