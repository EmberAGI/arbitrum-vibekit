import type { EnsuredPiRuntimePostgres, PiRuntimeGatewayService } from 'agent-runtime';
import { ensurePiRuntimePostgresReady } from 'agent-runtime';

import { createPiExampleGatewayService } from './agUiServer.js';
import type { PiExampleGatewayEnv } from './piExampleFoundation.js';

type PiExampleServerEnv = PiExampleGatewayEnv & {
  PORT?: string;
};

type PreparePiExampleServerOptions = {
  env?: PiExampleServerEnv;
  ensureReady?: () => Promise<EnsuredPiRuntimePostgres | void>;
  createService?: (options: { env: PiExampleServerEnv }) => PiRuntimeGatewayService;
};

export async function preparePiExampleServer(
  options: PreparePiExampleServerOptions = {},
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

  const service = (options.createService ?? createPiExampleGatewayService)({
    env,
  });

  return {
    bootstrap,
    port: Number.parseInt(env.PORT ?? '3410', 10),
    service,
  };
}
