import { Agent } from '@mariozechner/pi-agent-core';
import type { Model } from '@mariozechner/pi-ai';
import { describe, expect, it } from 'vitest';

import { createPiRuntimeGatewayFoundation } from './index.js';

describe('pi gateway foundation', () => {
  it('builds the gateway around a real pi-agent-core Agent and postgres bootstrap planning', () => {
    const foundation = createPiRuntimeGatewayFoundation({
      model: { id: 'test-model' } as unknown as Model<any>,
      systemPrompt: 'You are Pi.',
    });

    expect(foundation.agent).toBeInstanceOf(Agent);
    expect(foundation.bootstrapPlan).toEqual({
      mode: 'local-docker',
      databaseUrl: 'postgresql://postgres:postgres@127.0.0.1:55432/pi_runtime',
      startCommand:
        'docker run --name pi-runtime-postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=pi_runtime -p 55432:5432 -d postgres:17',
    });
  });
});
