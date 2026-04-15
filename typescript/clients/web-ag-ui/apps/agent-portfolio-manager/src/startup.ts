import {
  createPortfolioManagerGatewayService,
  type PortfolioManagerGatewayService,
} from './agUiServer.js';
import type { PortfolioManagerGatewayEnv } from './portfolioManagerFoundation.js';

type PortfolioManagerServerEnv = PortfolioManagerGatewayEnv & {
  PORT?: string;
};

type PreparePortfolioManagerServerOptions = {
  env?: PortfolioManagerServerEnv;
  createService?: (options: { env: PortfolioManagerServerEnv }) => Promise<PortfolioManagerGatewayService>;
};

export async function preparePortfolioManagerServer(
  options: PreparePortfolioManagerServerOptions = {},
): Promise<{
  port: number;
  service: PortfolioManagerGatewayService;
}> {
  const env: PortfolioManagerServerEnv = options.env ?? process.env;
  const service = await (options.createService ?? createPortfolioManagerGatewayService)({
    env,
  });
  await service.control.inspectHealth();

  return {
    port: Number.parseInt(env.PORT ?? '3420', 10),
    service,
  };
}
