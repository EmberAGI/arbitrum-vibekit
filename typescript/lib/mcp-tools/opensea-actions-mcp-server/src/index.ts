#!/usr/bin/env node

import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import dotenv from 'dotenv'
import express from 'express'
import type { NextFunction, Request, Response } from 'express'

import { createServer } from './mcp.js'

dotenv.config()

async function main() {
  // Default: HTTP disabled unless explicitly enabled
  const httpEnabled = process.env.ENABLE_HTTP === 'true'

  const rpcUrl = process.env.ARBITRUM_RPC_URL || 'https://arbitrum.llamarpc.com'

  const server = await createServer({ rpcUrl })

  if (httpEnabled) {
    const app = express()

    // Permissive CORS for Inspector UI and other local tools
    app.use(function (req: Request, res: Response, next: NextFunction) {
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
      if (req.method === 'OPTIONS') {
        res.sendStatus(204)
        return
      }
      next()
    })

    app.use(function (req: Request, _res: Response, next: NextFunction) {
      console.error(`${req.method} ${req.url}`)
      next()
    })

    const transports: { [sessionId: string]: SSEServerTransport } = {}

    app.get('/sse', async (_req: Request, res: Response) => {
      console.error('Received connection')

      const transport = new SSEServerTransport('/messages', res)
      transports[transport.sessionId] = transport

      await server.connect(transport)
    })

    app.post('/messages', async (_req: Request, res: Response) => {
      const sessionId = _req.query.sessionId as string
      console.error(`Received message for session: ${sessionId}`)

      let bodyBuffer = Buffer.alloc(0)

      _req.on('data', (chunk: Buffer) => {
        bodyBuffer = Buffer.concat([bodyBuffer, chunk])
      })

      _req.on('end', async () => {
        try {
          const bodyStr = bodyBuffer.toString('utf8')
          const bodyObj = JSON.parse(bodyStr)
          console.log(`${JSON.stringify(bodyObj, null, 4)}`)
        } catch (error) {
          console.error(`Error handling request: ${error}`)
        }
      })
      const transport = transports[sessionId]
      if (!transport) {
        res.status(400).send('No transport found for sessionId')
        return
      }
      await transport.handlePostMessage(_req, res)
    })

    const PORT = process.env.PORT || 3050
    app.listen(PORT, () => {
      console.error(`OpenSea Actions MCP server is running on port ${PORT}`)
    })
  }

  const stdioTransport = new StdioServerTransport()
  console.error('Initializing stdio transport...')
  await server.connect(stdioTransport)
  console.error('OpenSea Actions MCP stdio server started and connected.')
  console.error('Server is now ready to receive stdio requests.')

  process.stdin.on('end', () => {
    console.error('Stdio connection closed, exiting...')
    process.exit(0)
  })
}

main().catch(() => process.exit(-1))
