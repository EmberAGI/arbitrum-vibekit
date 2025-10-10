#!/usr/bin/env node

import { TriggerXClient } from 'sdk-triggerx';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';

import { createServer } from './mcp.js';

dotenv.config();

async function main() {
  const app = express();

  // Parse JSON bodies for custom endpoints
  app.use(express.json());

  app.use(cors());
  app.use(function (req, _res, next) {
    console.error(`${req.method} ${req.url}`);
    next();
  });

  // Validate required environment variables
  const apiKey = process.env.NEXT_PUBLIC_TRIGGERX_API_KEY;
  if (!apiKey) {
    console.error('Error: NEXT_PUBLIC_TRIGGERX_API_KEY environment variable is required');
    process.exit(1);
  }

  // Initialize TriggerX client
  console.error('Initializing TriggerX Client mcp server...');
  process.env.API_KEY = apiKey;
  const triggerxClient = new TriggerXClient(apiKey);
  (triggerxClient as any).apiKey = apiKey;
  console.error('TriggerX Client initialized successfully');

  // Create MCP server
  const server = await createServer(triggerxClient);

  const transports: { [sessionId: string]: SSEServerTransport } = {};

  app.get('/sse', async (_req, res) => {
    console.error('Received SSE connection');

    const transport = new SSEServerTransport('/messages', res);
    transports[transport.sessionId] = transport;

    await server.connect(transport);
  });

  app.post('/messages', async (req, res) => {
    const sessionId = req.query.sessionId as string;
    console.error(`Received message for session: ${sessionId}`);

    let bodyBuffer = Buffer.alloc(0);

    req.on('data', chunk => {
      bodyBuffer = Buffer.concat([bodyBuffer, chunk]);
    });

    req.on('end', async () => {
      try {
        // Parse the body
        const bodyStr = bodyBuffer.toString('utf8');
        const bodyObj = JSON.parse(bodyStr);
        console.error(`${JSON.stringify(bodyObj, null, 4)}`);
      } catch (error) {
        console.error(`Error handling request: ${error}`);
      }
    });
    
    const transport = transports[sessionId];
    if (!transport) {
      res.status(400).send('No transport found for sessionId');
      return;
    }
    await transport.handlePostMessage(req, res);
  });

  // Endpoint to accept signed job creation requests
  app.post('/submit-job', async (req, res) => {
    try {
      const { jobInput, signature, userAddress } = req.body || {};

      if (!jobInput || !signature || !userAddress) {
        return res.status(400).json({ success: false, error: 'jobInput, signature, and userAddress are required' });
      }

      // NOTE: In a production flow, verify the signature over the exact jobInput string
      // using your chosen scheme (e.g., EIP-191 personal_sign). Example with viem:
      // const recovered = await recoverMessageAddress({ message: JSON.stringify(jobInput), signature });
      // if (recovered.toLowerCase() !== userAddress.toLowerCase()) { return res.status(401).json({ success:false, error:'Bad signature' }); }

      // TODO: Call TriggerX SDK/API to create the job with the signed payload.
      // For now, echo back a stubbed response to confirm wiring is correct.
      return res.json({
        success: true,
        message: 'Received signed job. Submit to TriggerX API here.',
        data: { jobInput, signature, userAddress },
      });
    } catch (err) {
      console.error('submit-job error', err);
      return res.status(500).json({ success: false, error: (err as Error).message });
    }
  });

  // Add root endpoint to list available tools
  app.get('/', (_req, res) => {
    res.json({
      name: 'AutoSynth MCP Server',
      version: '1.0.0',
      status: 'running',
      description: 'Automated job scheduling with time, event, and condition triggers using TriggerX platform',
      endpoints: {
        '/': 'Server information (this response)',
        '/sse': 'Server-Sent Events endpoint for MCP connection',
        '/messages': 'POST endpoint for MCP messages',
      },
      tools: [
        { name: 'createTimeJob', description: 'Create time-based scheduled jobs (interval, cron, specific)' },
        { name: 'createEventJob', description: 'Create event-triggered jobs when blockchain events occur' },
        { name: 'createConditionJob', description: 'Create condition-based jobs when API/contract conditions are met' },
        { name: 'getJobs', description: 'Retrieve all jobs or specific job by ID' },
        { name: 'deleteJob', description: 'Delete a specific job by ID' },
        { name: 'getUserData', description: 'Get user statistics and job count' },
      ],
    });
  });

  const PORT = process.env.PORT || 3002;
  app.listen(PORT, () => {
    console.error(`AutoSynth MCP Server running on port ${PORT}`);
    console.error(`SSE Endpoint: http://localhost:${PORT}/sse`);
    console.error(`Message Endpoint: http://localhost:${PORT}/messages`);
    console.error(`Tools Endpoint: http://localhost:${PORT}/`);
  });

  // Start stdio transport
  const stdioTransport = new StdioServerTransport();
  console.error('Initializing stdio transport...');
  await server.connect(stdioTransport);
  console.error('AutoSynth MCP stdio server started and connected.');
  console.error('Server is now ready to receive stdio requests.');

  // Exit when stdio is closed (e.g., when parent process ends)
  process.stdin.on('end', () => {
    console.error('Stdio connection closed, exiting...');
    process.exit(0);
  });
}

main().catch(() => process.exit(-1));
