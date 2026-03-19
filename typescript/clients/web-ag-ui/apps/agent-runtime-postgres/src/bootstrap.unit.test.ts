import { describe, expect, it } from 'vitest';

import { resolvePostgresBootstrapPlan } from './index.js';

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
});
