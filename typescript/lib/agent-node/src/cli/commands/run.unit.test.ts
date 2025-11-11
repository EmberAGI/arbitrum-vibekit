import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mocks
vi.mock('../output.js', () => ({
  cliOutput: {
    print: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    blank: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../a2a/server.js', () => ({
  createA2AServer: vi.fn(async () => ({
    address: () => ({ address: '::', port: 3000 }),
    close: (cb: (err?: unknown) => void) => cb(),
  })),
}));

vi.mock('./workflow-install.js', () => ({
  workflowInstallCommand: vi.fn(async () => {}),
}));

import { runCommand } from './run.js';
import { workflowInstallCommand } from './workflow-install.js';

describe('runCommand - workflow auto-install', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it('calls workflowInstallCommand by default with expected options', async () => {
    // Given: default options
    // When: executing runCommand
    await runCommand({});
    // Then: it calls workflowInstallCommand with expected defaults
    expect(workflowInstallCommand).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({
        configDir: expect.any(String),
        all: true,
        frozenLockfile: undefined,
        quiet: true,
      }),
    );
  });

  it('passes frozenLockfile through to workflowInstallCommand', async () => {
    // Given: frozen lockfile enabled
    // When: executing runCommand
    await runCommand({ frozenLockfile: true });
    // Then: it forwards the flag to workflowInstallCommand
    expect(workflowInstallCommand).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({
        frozenLockfile: true,
      }),
    );
  });

  it('skips auto-install when noInstall is true', async () => {
    // Given: noInstall enabled
    // When: executing runCommand
    await runCommand({ noInstall: true });
    // Then: it does not invoke workflowInstallCommand
    expect(workflowInstallCommand).not.toHaveBeenCalled();
  });
});
