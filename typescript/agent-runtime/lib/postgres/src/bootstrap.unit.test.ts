import { describe, expect, it, vi } from 'vitest';

import { ensurePiRuntimePostgresReady, resolvePostgresBootstrapPlan } from './index.js';

describe('bootstrap', () => {
  it('uses an explicit DATABASE_URL when one is provided', () => {
    expect(
      resolvePostgresBootstrapPlan({
        DATABASE_URL: 'postgresql://custom:secret@db.internal:5432/pi_runtime',
      }),
    ).toEqual({
      mode: 'external',
      databaseUrl: 'postgresql://custom:secret@db.internal:5432/pi_runtime',
      startCommand: null,
    });
  });

  it('returns a local docker bootstrap plan when DATABASE_URL is absent', () => {
    expect(resolvePostgresBootstrapPlan({})).toEqual({
      mode: 'local-docker',
      databaseUrl: 'postgresql://postgres:postgres@127.0.0.1:55432/pi_runtime',
      startCommand:
        'docker run --name pi-runtime-postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=pi_runtime -p 55432:5432 -d postgres:17',
    });
  });

  it('ensures an external DATABASE_URL is reachable without starting local docker', async () => {
    const waitForDatabase = vi.fn(async () => undefined);
    const applySchema = vi.fn(async () => undefined);
    const executeCommand = vi.fn(async () => 0);

    await expect(
      ensurePiRuntimePostgresReady({
        env: {
          DATABASE_URL: 'postgresql://pi:secret@db.internal:5432/pi_runtime',
        },
        executeCommand,
        waitForDatabase,
        applySchema,
      }),
    ).resolves.toEqual({
      bootstrapPlan: {
        mode: 'external',
        databaseUrl: 'postgresql://pi:secret@db.internal:5432/pi_runtime',
        startCommand: null,
      },
      databaseUrl: 'postgresql://pi:secret@db.internal:5432/pi_runtime',
      startedLocalDocker: false,
    });

    expect(executeCommand).not.toHaveBeenCalled();
    expect(waitForDatabase).toHaveBeenCalledTimes(1);
    expect(waitForDatabase).toHaveBeenCalledWith('postgresql://pi:secret@db.internal:5432/pi_runtime');
    expect(applySchema).toHaveBeenCalledTimes(1);
    expect(applySchema).toHaveBeenCalledWith(
      'postgresql://pi:secret@db.internal:5432/pi_runtime',
      expect.arrayContaining([expect.stringContaining('create table if not exists pi_threads')]),
    );
  });

  it('starts local docker postgres when the default database is not already reachable', async () => {
    const waitForDatabase = vi
      .fn<(_: string) => Promise<void>>()
      .mockRejectedValueOnce(new Error('connect ECONNREFUSED'))
      .mockResolvedValueOnce(undefined);
    const applySchema = vi.fn(async () => undefined);
    const executeCommand = vi
      .fn<(_: string) => Promise<number>>()
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(0);

    await expect(
      ensurePiRuntimePostgresReady({
        env: {},
        executeCommand,
        waitForDatabase,
        applySchema,
      }),
    ).resolves.toEqual({
      bootstrapPlan: {
        mode: 'local-docker',
        databaseUrl: 'postgresql://postgres:postgres@127.0.0.1:55432/pi_runtime',
        startCommand:
          'docker run --name pi-runtime-postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=pi_runtime -p 55432:5432 -d postgres:17',
      },
      databaseUrl: 'postgresql://postgres:postgres@127.0.0.1:55432/pi_runtime',
      startedLocalDocker: true,
    });

    expect(executeCommand).toHaveBeenNthCalledWith(1, 'docker info > /dev/null 2>&1');
    expect(executeCommand).toHaveBeenNthCalledWith(2, 'docker start pi-runtime-postgres');
    expect(executeCommand).toHaveBeenNthCalledWith(
      3,
      'docker run --name pi-runtime-postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=pi_runtime -p 55432:5432 -d postgres:17',
    );
    expect(waitForDatabase).toHaveBeenCalledTimes(2);
    expect(applySchema).toHaveBeenCalledTimes(1);
  });

  it('fails with an explicit Docker readiness error when no DATABASE_URL is set and Docker is unavailable', async () => {
    const waitForDatabase = vi.fn<(_: string) => Promise<void>>().mockRejectedValueOnce(new Error('connect ECONNREFUSED'));
    const applySchema = vi.fn(async () => undefined);
    const executeCommand = vi.fn<(_: string) => Promise<number>>().mockResolvedValueOnce(1);

    await expect(
      ensurePiRuntimePostgresReady({
        env: {},
        executeCommand,
        waitForDatabase,
        applySchema,
      }),
    ).rejects.toThrow('running Docker daemon or an explicit DATABASE_URL');

    expect(executeCommand).toHaveBeenCalledTimes(1);
    expect(executeCommand).toHaveBeenCalledWith('docker info > /dev/null 2>&1');
    expect(applySchema).not.toHaveBeenCalled();
  });
});
