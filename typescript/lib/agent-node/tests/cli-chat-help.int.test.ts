import { describe, it, expect, beforeEach, vi } from 'vitest';

// We will invoke the CLI help entrypoint and capture stdout

describe('agent help (behavior)', () => {
  const originalArgv = process.argv.slice();
  const originalExit = process.exit;
  const originalLog = console.log;
  const originalError = console.error;

  beforeEach(() => {
    vi.restoreAllMocks();
    process.argv = ['node', 'agent', 'help'];
  });

  it('prints chat and run flags with --log-dir and mentions LOG_LEVEL=ERROR for chat', async () => {
    const lines: string[] = [];
    // Capture both stdout and stderr
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (console.log as any) = (msg: string) => lines.push(String(msg));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (console.error as any) = (msg: string) => lines.push(String(msg));
    // Prevent process.exit from terminating test
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (process.exit as any) = vi.fn();

    // Dynamically import the CLI index to run help
    await import('../src/cli/index.js');

    const output = lines.join('\n');
    // Chat section includes --log-dir and --respect-log-level
    expect(output).toMatch(/chat[\s\S]*--log-dir/);
    expect(output).toMatch(/chat[\s\S]*--respect-log-level/);
    // Run section includes --log-dir and --respect-log-level in attach context
    expect(output).toMatch(/run[\s\S]*--log-dir/);
    expect(output).toMatch(/run[\s\S]*--respect-log-level/);
    // Default behavior line mentions LOG_LEVEL=ERROR
    expect(output).toMatch(/LOG_LEVEL=ERROR/);

    // Restore globals
    process.argv = originalArgv;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (process.exit as any) = originalExit as unknown as (code?: number) => never;
    console.log = originalLog;
    console.error = originalError;
  });
});
