import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { writeClmmFailureLog } from './failureLog.js';

describe('writeClmmFailureLog', () => {
  it('writes full execution failures to NDJSON without needing env configuration', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'clmm-failure-log-'));
    const logPath = join(tempDir, 'clmm-failures.ndjson');

    writeClmmFailureLog(
      {
        timestamp: '2026-03-10T16:25:41.731Z',
        iteration: 10465,
        action: 'adjust-range',
        threadId: 'thread-1',
        retainedError: 'Short retained failure summary',
        fullError:
          'The total cost (gas * gas fee + value) exceeds the balance. data: 0xcef6d2090000000000000000000000000000000000000000000000000000000000000060',
      },
      logPath,
    );

    expect(existsSync(logPath)).toBe(true);

    const lines = readFileSync(logPath, 'utf8')
      .trim()
      .split('\n')
      .filter((line) => line.length > 0);

    expect(lines).toHaveLength(1);

    const entry = JSON.parse(lines[0] ?? '{}') as {
      iteration?: number;
      action?: string;
      retainedError?: string;
      fullError?: string;
    };

    expect(entry.iteration).toBe(10465);
    expect(entry.action).toBe('adjust-range');
    expect(entry.retainedError).toBe('Short retained failure summary');
    expect(entry.fullError).toContain('data: 0xcef6d209');

    rmSync(tempDir, { recursive: true, force: true });
  });
});
