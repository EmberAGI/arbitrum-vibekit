/// <reference types="mocha" />
import { expect } from 'chai';
import 'dotenv/config';
import { extractMessageText, extractPerpetualsMarketsData } from 'test-utils';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

import { createPerpetualsAgent } from '../src/index.js';

describe('Perpetuals Agent Integration Tests', function () {
  this.timeout(60000);

  const PORT = 31116;
  let agentServer: any;
  let mcpClient: Client;
  const walletAddress = '0x000000000000000000000000000000000000dead';

  before(async () => {
    const agent = createPerpetualsAgent();
    await agent.start(PORT);
    agentServer = agent;

    mcpClient = new Client({ name: 'perps-integration-test', version: '0.0.0' });
    const transport = new StreamableHTTPClientTransport(new URL(`http://localhost:${PORT}/messages`));
    await mcpClient.connect(transport);
  });

  after(async () => {
    await mcpClient.close();
    await agentServer.stop();
  });

  it('should find ETH/USD [WETH-USDC] perpetual market', async () => {
    const resp = await mcpClient.callTool({
      name: 'ask-perpetuals-agent',
      arguments: {
        instruction: 'List all perpetual markets on Arbitrum',
        walletAddress,
      },
    });

    expect(resp).to.exist;
    expect(resp.content).to.exist;

    // Extract the task from the response
    const contentArr = resp.content as any[];
    expect(contentArr).to.be.an('array');
    expect(contentArr.length).to.be.greaterThan(0);
    const resource = contentArr[0];
    expect(resource.type).to.equal('resource');

    const task = JSON.parse(resource.resource.text);
    expect(task.kind).to.equal('task');
    expect(task.status.state).to.equal('completed');
    
    // Extract message text using test-utils
    const messageText = extractMessageText(task);
    expect(messageText).to.be.a('string').with.length.greaterThan(0);
    

    
    // Extract markets data using test-utils
    const marketsData = extractPerpetualsMarketsData(task);
    expect(marketsData.markets).to.be.an('array').with.length.greaterThan(0);
    
    // Look for the specific ETH/USD [WETH-USDC] market
    const WETH_ADDRESS = '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1';
    const USDC_ADDRESS = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';
    const ETH_ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
    
    const ethUsdMarket = marketsData.markets.find(market => 
      market.indexToken.address === ETH_ZERO_ADDRESS &&
      market.longToken.address === WETH_ADDRESS && 
      market.shortToken.address === USDC_ADDRESS
    );
    
    expect(ethUsdMarket).to.exist;
    expect(ethUsdMarket!.name).to.equal('ETH/USD [WETH-USDC]');
  });
}); 