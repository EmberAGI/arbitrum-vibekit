#!/usr/bin/env node
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js'
import express from 'express'
import { createServer } from './mcp'
import { AlloraAPIClient, ChainSlug } from '@alloralabs/allora-sdk'
import { PassThrough, Readable } from 'stream'
import getRawBody from 'raw-body'
import dotenv from 'dotenv'

dotenv.config()

async function main() {
    const app = express()

    app.use(function(req, res, next) {
        console.log(`${req.method} ${req.url}`)
        next()
    })
    
    const apiKey = process.env.ALLORA_API_KEY || 'UP-86455f53320d4ee48a958cc0'
    if (!apiKey) {
        console.error('Error: ALLORA_API_KEY environment variable is required')
        process.exit(1)
    }

    const alloraClient = new AlloraAPIClient({ chainSlug: ChainSlug.TESTNET, apiKey })
    const server = await createServer(alloraClient)

    const transports: {[sessionId: string]: SSEServerTransport} = {}

    app.get('/sse', async (req, res) => {
        console.log('Received connection')

        const transport = new SSEServerTransport('/messages', res)
        transports[transport.sessionId] = transport

        await server.connect(transport)
    })

    app.post('/messages', async (req, res) => {
        const sessionId = req.query.sessionId as string
        console.log(`Received message for session: ${sessionId}`)
        
        let bodyBuffer = Buffer.alloc(0)
        
        req.on('data', chunk => {
            bodyBuffer = Buffer.concat([bodyBuffer, chunk])
        })
        
        req.on('end', async () => {
            try {
                // Parse the body
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
        }
        await transport.handlePostMessage(req, res)
    })

    const PORT = process.env.PORT || 3001
    app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`)
    })
}

main().catch(() => process.exit(-1))