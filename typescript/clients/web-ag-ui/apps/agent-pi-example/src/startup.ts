import type { EnsuredPiRuntimePostgres, PiRuntimeGatewayService } from 'agent-runtime';
import { ensurePiRuntimePostgresReady } from 'agent-runtime';

import { createPiExampleGatewayService } from './agUiServer.js';
import {
  startPiExampleAutomationScheduler,
  type PiExampleAutomationScheduler,
} from './automationScheduler.js';
import type { PiExampleGatewayEnv } from './piExampleFoundation.js';
import {
  createPiExampleRuntimeStateStore,
  type PiExampleRuntimeStateStore,
} from './runtimeState.js';

type PiExampleServerEnv = PiExampleGatewayEnv & {
  PORT?: string;
};

type PreparePiExampleServerOptions = {
  env?: PiExampleServerEnv;
  ensureReady?: () => Promise<EnsuredPiRuntimePostgres | void>;
  createService?: (options: {
    env: PiExampleServerEnv;
    runtimeState: PiExampleRuntimeStateStore;
  }) => PiRuntimeGatewayService;
  startScheduler?: (options: {
    databaseUrl: string;
    runtimeState: PiExampleRuntimeStateStore;
  }) => PiExampleAutomationScheduler;
};

export async function preparePiExampleServer(
  options: PreparePiExampleServerOptions = {},
): Promise<{
  bootstrap: EnsuredPiRuntimePostgres | null;
  port: number;
  service: PiRuntimeGatewayService;
  scheduler: PiExampleAutomationScheduler | null;
}> {
  const env = options.env ?? process.env;
  const runtimeState = createPiExampleRuntimeStateStore();

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
    runtimeState,
  });
  const databaseUrl = bootstrap?.databaseUrl ?? env.DATABASE_URL ?? null;

  return {
    bootstrap,
    port: Number.parseInt(env.PORT ?? '3410', 10),
    service,
    scheduler: databaseUrl
      ? (options.startScheduler ?? startPiExampleAutomationScheduler)({
          databaseUrl,
          runtimeState,
        })
      : null,
  };
}
