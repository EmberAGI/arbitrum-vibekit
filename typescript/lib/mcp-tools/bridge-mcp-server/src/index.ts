#!/usr/bin/env node
import dotenv from 'dotenv';
import express from 'express';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  envSchema,
  listRoutesInput,
  estimateQuoteInput,
  oracleInput,
  validateQuoteInput,
  minOutInput,
  deadlineInput,
  approvalInput,
  eip2612PermitInput,
  permit2PermitInput,
  acrossTimeWindowInput,
  buildAcrossTxInput,
  listRoutes,
  getOraclePriceUSD,
  validateDestinationQuoteAgainstOracle,
  computeMinOut,
  computeDeadline,
  buildApprovalTx,
  buildEip2612Permit,
  buildPermit2Permit,
  getAcrossQuoteTimeWindow,
  buildAcrossBridgeTx,
  getSupportedAddresses,
} from './bridge.js';

import {
  stargateSwapInput,
  stargateCreditInput,
  stargatePoolsInput,
  listStargatePools,
  getStargateCredit,
  getStargateQuote,
  buildStargateSwapTx,
  getStargateAddresses,
} from './stargate.js';

import {
  intentInput,
  processIntent,
} from './intents.js';

dotenv.config();

async function createServer() {
  const server = new McpServer({ name: 'bridge-mcp-server', version: '0.1.0' });
  const env = envSchema.safeParse(process.env);
  if (!env.success) {
    throw new Error(`Invalid environment: ${env.error.message}`);
  }

  server.tool('list_routes', 'List available bridge routes for given pair', listRoutesInput.shape, async (args: unknown) => {
    const parsed = listRoutesInput.parse(args);
    const routes = listRoutes(parsed);
    return { content: [{ type: 'text', text: JSON.stringify(routes, null, 2) }] };
  });

  server.tool('estimate_bridge_quote', 'Estimate bridge quote (MVP placeholder)', estimateQuoteInput.shape, async (args: unknown) => {
    const parsed = estimateQuoteInput.parse(args);
    const feeBps = 30n;
    const out = (BigInt(parsed.amountIn) * (10_000n - feeBps)) / 10_000n;
    return { content: [{ type: 'text', text: JSON.stringify({ quotedOut: out.toString(), outDecimals: 18 }, null, 2) }] };
  });

  server.tool('get_oracle_price', 'Get oracle price from Chainlink aggregator (feed address required)', oracleInput.shape, async (args: unknown) => {
    const parsed = oracleInput.parse(args);
    const price = await getOraclePriceUSD(parsed, env.data);
    return { content: [{ type: 'text', text: JSON.stringify(price, null, 2) }] };
  });

  server.tool('validate_dest_quote_against_oracle', 'Validate destination quote against oracle with deviation guard', validateQuoteInput.shape, async (args: unknown) => {
    const parsed = validateQuoteInput.parse(args);
    const result = validateDestinationQuoteAgainstOracle(parsed);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  });

  server.tool('compute_min_destination_amount', 'Compute minOut using slippage guard in bps', minOutInput.shape, async (args: unknown) => {
    const parsed = minOutInput.parse(args);
    const result = computeMinOut(parsed);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  });

  server.tool('compute_deadline', 'Compute unix deadline seconds from now', deadlineInput.shape, async (args: unknown) => {
    const parsed = deadlineInput.parse(args);
    const result = computeDeadline(parsed);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  });

  server.tool('build_approval_tx', 'Build unsigned ERC20 approve tx', approvalInput.shape, async (args: unknown) => {
    const parsed = approvalInput.parse(args);
    const result = buildApprovalTx(parsed);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  });

  server.tool('build_eip2612_permit', 'Build EIP-2612 permit typed data', eip2612PermitInput.shape, async (args: unknown) => {
    const parsed = eip2612PermitInput.parse(args);
    const result = buildEip2612Permit(parsed);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  });

  server.tool('build_permit2_permit', 'Build Permit2 permit typed data', permit2PermitInput.shape, async (args: unknown) => {
    const parsed = permit2PermitInput.parse(args);
    const result = buildPermit2Permit(parsed);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  });

  server.tool('get_across_quote_time_window', 'Get Across SpokePool quote time window', acrossTimeWindowInput.shape, async (args: unknown) => {
    const parsed = acrossTimeWindowInput.parse(args);
    const result = await getAcrossQuoteTimeWindow(parsed, env.data);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  });

  server.tool('build_bridge_tx', 'Build unsigned bridge transaction (Across protocol)', buildAcrossTxInput.shape, async (args: unknown) => {
    const parsed = buildAcrossTxInput.parse(args);
    const result = buildAcrossBridgeTx(parsed, env.data);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  });

  // Stargate V2 Tools
  server.tool('list_stargate_pools', 'List Stargate V2 pools and liquidity info', stargatePoolsInput.shape, async (args: unknown) => {
    const parsed = stargatePoolsInput.parse(args);
    const pools = listStargatePools(parsed);
    return { content: [{ type: 'text', text: JSON.stringify(pools, null, 2) }] };
  });

  server.tool('get_stargate_credit', 'Get Stargate V2 credit-based bridging availability', stargateCreditInput.shape, async (args: unknown) => {
    const parsed = stargateCreditInput.parse(args);
    const credit = await getStargateCredit(parsed, env.data);
    return { content: [{ type: 'text', text: JSON.stringify(credit, null, 2) }] };
  });

  server.tool('get_stargate_quote', 'Get Stargate V2 bridge quote with fees', stargateSwapInput.shape, async (args: unknown) => {
    const parsed = stargateSwapInput.parse(args);
    const quote = await getStargateQuote(parsed, env.data);
    return { content: [{ type: 'text', text: JSON.stringify(quote, null, 2) }] };
  });

  server.tool('build_stargate_bridge_tx', 'Build Stargate V2 bridge transaction', stargateSwapInput.shape, async (args: unknown) => {
    const parsed = stargateSwapInput.parse(args);
    const tx = buildStargateSwapTx(parsed, env.data);
    // Handle BigInt serialization
    const serializedTx = JSON.stringify(tx, (key, value) => 
      typeof value === 'bigint' ? value.toString() : value
    );
    return { content: [{ type: 'text', text: serializedTx }] };
  });

  server.tool('get_stargate_addresses', 'Get Stargate V2 contract addresses for a chain', z.object({ chainId: z.number() }).shape, async (args: unknown) => {
    const parsed = z.object({ chainId: z.number() }).parse(args);
    const addresses = getStargateAddresses(parsed.chainId);
    return { content: [{ type: 'text', text: JSON.stringify(addresses, null, 2) }] };
  });

  // Intent-Based Bridging Tools
  server.tool('process_bridge_intent', 'Process natural language bridge intent and create execution plan', intentInput.shape, async (args: unknown) => {
    const parsed = intentInput.parse(args);
    const result = await processIntent(parsed, env.data);
    
    // Handle BigInt serialization in the result
    const serializedResult = JSON.stringify(result, (key, value) => 
      typeof value === 'bigint' ? value.toString() : value, 2
    );
    return { content: [{ type: 'text', text: serializedResult }] };
  });

  server.tool('get_supported_addresses', 'Get supported router/contract addresses', z.object({}).shape, async () => {
    return { content: [{ type: 'text', text: JSON.stringify(getSupportedAddresses(), null, 2) }] };
  });

  return server;
}

async function main() {
  const app = express();
  app.use((req: any, _res: any, next: any) => { console.log(`${req.method} ${req.url}`); next(); });

  const server = await createServer();
  const transports: { [sessionId: string]: SSEServerTransport } = {};

  const disableHttp = process.env.DISABLE_HTTP_SSE === '1';
  if (!disableHttp) {
    app.get('/sse', async (_req: any, res: any) => {
      const transport = new SSEServerTransport('/messages', res);
      transports[transport.sessionId] = transport;
      await server.connect(transport);
    });

    app.post('/messages', async (_req: any, res: any) => {
      const sessionId = _req.query.sessionId as string;
      const transport = transports[sessionId];
      if (!transport) { res.status(400).send('No transport found for sessionId'); return; }
      await transport.handlePostMessage(_req, res);
    });

    const PORT = process.env.PORT || 3002;
    app.listen(PORT, () => { console.log(`Bridge MCP SSE on :${PORT}`); });
  } else {
    console.log('HTTP SSE disabled via DISABLE_HTTP_SSE=1');
  }

  const stdio = new StdioServerTransport();
  console.error('Starting stdio transport...');
  await server.connect(stdio);
  console.error('Bridge MCP stdio server ready.');

  process.stdin.on('end', () => { console.error('Stdio closed, exiting'); process.exit(0); });
}

main().catch((err) => { console.error(err); process.exit(1); });

