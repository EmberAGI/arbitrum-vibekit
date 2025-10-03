import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'

async function main() {
  const sseUrl = process.env.SSE_URL || 'http://localhost:3035/sse'

  const client = new Client(
    { name: 'opensea-e2e-client', version: '1.0.0' },
    { capabilities: { tools: {}, resources: {}, prompts: {} } }
  )

  const transport = new SSEClientTransport(new URL(sseUrl))
  await client.connect(transport)
  console.log(`[client] connected to ${sseUrl}`)

  const tools = await client.listTools()
  console.log('[client] tools:', JSON.stringify(tools, null, 2))

  const result = await client.callTool({
    name: 'get_collection',
    arguments: { collection_slug: 'alchemy-denver2025-blue' },
  })
  console.log('[client] get_collection result:', JSON.stringify(result, null, 2))

  await client.close()
}

main().catch((err) => {
  console.error('[client] error:', err)
  process.exit(1)
})


