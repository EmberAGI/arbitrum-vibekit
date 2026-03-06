import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { flushLatencyLogWrites, measureAsyncStage, startLatencyStage } from './latency.js';

describe('latency instrumentation helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('logs stage start and completion with duration metadata', () => {
    const consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const dateNowSpy = vi.spyOn(Date, 'now');
    dateNowSpy.mockReturnValueOnce(1_000).mockReturnValueOnce(1_245);

    const stage = startLatencyStage({
      node: 'prepareOperator',
      stage: 'market-discovery',
      metadata: { threadId: 'thread-1' },
    });

    const durationMs = stage.complete({ marketCount: 4 });

    expect(durationMs).toBe(245);
    expect(consoleInfoSpy).toHaveBeenCalledTimes(2);
    expect(String(consoleInfoSpy.mock.calls[0]?.[0])).toContain('prepareOperator: market-discovery started');
    expect(consoleInfoSpy.mock.calls[0]?.[1]).toMatchObject({
      stage: 'market-discovery',
      threadId: 'thread-1',
    });
    expect(String(consoleInfoSpy.mock.calls[1]?.[0])).toContain('prepareOperator: market-discovery completed');
    expect(consoleInfoSpy.mock.calls[1]?.[1]).toMatchObject({
      stage: 'market-discovery',
      threadId: 'thread-1',
      marketCount: 4,
      durationMs: 245,
    });
  });

  it('logs stage failure metadata for measured async work', async () => {
    const consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const dateNowSpy = vi.spyOn(Date, 'now');
    dateNowSpy.mockReturnValueOnce(2_000).mockReturnValueOnce(2_180);

    await expect(
      measureAsyncStage({
        node: 'pollCycle',
        stage: 'market-refresh',
        metadata: { iteration: 1 },
        run: async () => {
          await Promise.resolve();
          throw new Error('refresh failed');
        },
      }),
    ).rejects.toThrow('refresh failed');

    expect(consoleInfoSpy).toHaveBeenCalledTimes(2);
    expect(String(consoleInfoSpy.mock.calls[1]?.[0])).toContain('pollCycle: market-refresh failed');
    expect(consoleInfoSpy.mock.calls[1]?.[1]).toMatchObject({
      stage: 'market-refresh',
      iteration: 1,
      error: 'refresh failed',
      durationMs: 180,
    });
  });

  it('writes stage events to ndjson when a latency log path is configured', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'pendle-latency-'));
    const logPath = join(tempDir, 'agent-pendle-latency.ndjson');
    vi.stubEnv('PENDLE_LATENCY_LOG_PATH', logPath);

    try {
      const stage = startLatencyStage({
        node: 'prepareOperator',
        stage: 'post-onboarding-setup',
        metadata: { threadId: 'thread-1' },
      });

      stage.complete({ selectedMarketAddress: '0xabc' });
      await flushLatencyLogWrites();

      const raw = await readFile(logPath, 'utf8');
      const entries = raw
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line) as Record<string, unknown>);

      expect(entries).toHaveLength(2);
      expect(entries[0]).toMatchObject({
        node: 'prepareOperator',
        stage: 'post-onboarding-setup',
        outcome: 'started',
        threadId: 'thread-1',
      });
      expect(entries[1]).toMatchObject({
        node: 'prepareOperator',
        stage: 'post-onboarding-setup',
        outcome: 'completed',
        threadId: 'thread-1',
        selectedMarketAddress: '0xabc',
      });
      expect(typeof entries[1]?.['durationMs']).toBe('number');
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
