#!/usr/bin/env node
/**
 * PancakeSwap MCP Server
 * DeFi trading tools for AI agents
 */

import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import dotenv from 'dotenv'
import express from 'express'

import { createServer } from './mcp.js'

dotenv.config()

async function main() {
  const app = express()

  // Middleware
  app.use(express.json())
  app.use(function (req, _res, next) {
    console.log(`${req.method} ${req.url}`)
    next()
  })

  // Create MCP server
  const server = await createServer()

  // HTTP transport for web clients
  const transports = {} as { [sessionId: string]: SSEServerTransport }

  app.get('/sse', async (_req, res) => {
    console.log('Received SSE connection')

    const transport = new SSEServerTransport('/messages', res)
    transports[transport.sessionId] = transport

    await server.connect(transport)
  })

  app.post('/messages', async (req, res) => {
    const sessionId = req.query.sessionId as string
    console.log(`Received message for session: ${sessionId}`)

    const transport = transports[sessionId]
    if (!transport) {
      res.status(400).send('No transport found for sessionId')
      return
    }
    await transport.handlePostMessage(req, res)
  })

  // Health check endpoint
  app.get('/health', (_req, res) => {
    res.json({
      status: 'healthy',
      service: 'pancakeswap-mcp-server',
      version: '1.0.0',
      chain: process.env.PANCAKESWAP_CHAIN || 'bsc'
    })
  })

  // Start HTTP server
  const PORT = process.env.PORT || 3002
  app.listen(PORT, () => {
    console.error(`🥞 PancakeSwap MCP Server running on port ${PORT}`)
    console.error(`📍 Health check: http://localhost:${PORT}/health`)
    console.error(`🔌 MCP SSE: http://localhost:${PORT}/sse`)
    console.error(`📊 Chain: ${process.env.PANCAKESWAP_CHAIN || 'bsc'}`)
    console.error(`🌐 RPC: ${process.env.RPC_URL || 'default'}`)
  })

  // Start stdio transport for local MCP clients
  const stdioTransport = new StdioServerTransport()
  console.error('Initializing stdio transport...')
  await server.connect(stdioTransport)
  console.error('PancakeSwap MCP stdio server started and connected.')
  console.error('Server is now ready to receive stdio requests.')

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.error(`\n🛑 Received ${signal}. Shutting down gracefully...`)
    process.exit(0)
  }

  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.stdin.on('end', () => {
    console.error('Stdio connection closed, exiting...')
    process.exit(0)
  })
}

main().catch((error) => {
  console.error('Failed to start PancakeSwap MCP server:', error)
  process.exit(1)
})
