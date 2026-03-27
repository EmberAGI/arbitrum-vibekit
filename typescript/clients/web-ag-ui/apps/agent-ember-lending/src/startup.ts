import type { EnsuredPiRuntimePostgres, PiRuntimeGatewayService } from 'agent-runtime';
import { ensurePiRuntimePostgresReady } from 'agent-runtime';

import { createEmberLendingGatewayService } from './agUiServer.js';
import type { EmberLendingRuntimeEnv } from './privateRuntime.js';

type EmberLendingServerEnv = EmberLendingRuntimeEnv & {
  DATABASE_URL?: string;
  PORT?: string;
};

type PrepareEmberLendingServerOptions = {
  env?: EmberLendingServerEnv;
  ensureReady?: () => Promise<EnsuredPiRuntimePostgres | void>;
  createService?: (options: { env: EmberLendingServerEnv }) => Promise<PiRuntimeGatewayService>;
};

export async function prepareEmberLendingServer(
  options: PrepareEmberLendingServerOptions = {},
): Promise<{
  bootstrap: EnsuredPiRuntimePostgres | null;
  port: number;
  service: PiRuntimeGatewayService;
}> {
  const env = options.env ?? process.env;
  const bootstrap =
    (await (options.ensureReady ??
      (() =>
        ensurePiRuntimePostgresReady({
          env: {
            DATABASE_URL: env.DATABASE_URL,
          },
        })))()) ?? null;
  const service = await (options.createService ?? createEmberLendingGatewayService)({
    env,
  });

  return {
    bootstrap,
    port: Number.parseInt(env.PORT ?? '3411', 10),
    service,
  };
}
