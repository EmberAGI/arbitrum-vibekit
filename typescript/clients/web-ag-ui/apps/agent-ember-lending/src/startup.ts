import {
  createEmberLendingGatewayService,
  type EmberLendingGatewayService,
} from './agUiServer.js';
import type { EmberLendingGatewayEnv } from './emberLendingFoundation.js';

type EmberLendingServerEnv = EmberLendingGatewayEnv & {
  PORT?: string;
};

type PrepareEmberLendingServerOptions = {
  env?: EmberLendingServerEnv;
  createService?: (options: {
    env: EmberLendingServerEnv;
  }) => Promise<EmberLendingGatewayService>;
};

export async function prepareEmberLendingServer(
  options: PrepareEmberLendingServerOptions = {},
): Promise<{
  port: number;
  service: EmberLendingGatewayService;
}> {
  const env: EmberLendingServerEnv = options.env ?? process.env;
  const service = await (options.createService ?? createEmberLendingGatewayService)({
    env,
  });
  await service.control.inspectHealth();

  return {
    port: Number.parseInt(env.PORT ?? '3430', 10),
    service,
  };
}
