#!/usr/bin/env node

// Simple HTTP API Server for Web Demo
// Bridges web interface to MCP server

import express from 'express';
import cors from 'cors';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
const PORT = process.env.API_PORT || 3001;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

let mcpServer = null;
let mcpServerReady = false;

// Start MCP Server
function startMCPServer() {
    return new Promise((resolve, reject) => {
        console.log('🚀 Starting MCP Server...');
        
        mcpServer = spawn('node', ['./dist/index.js'], {
            stdio: ['pipe', 'pipe', 'pipe'],
            env: { ...process.env, DISABLE_HTTP_SSE: '1' }
        });

        let output = '';
        mcpServer.stdout.on('data', (data) => {
            output += data.toString();
            console.log('MCP Server:', data.toString().trim());
            
            if (output.includes('Bridge MCP stdio server ready')) {
                mcpServerReady = true;
                console.log('✅ MCP Server ready!');
                resolve();
            }
        });

        mcpServer.stderr.on('data', (data) => {
            const error = data.toString();
            console.error('MCP Server Error:', error);
            
            if (error.includes('Invalid environment')) {
                reject(new Error('Environment variables missing. Please check your .env file.'));
            }
        });

        mcpServer.on('close', (code) => {
            console.log(`MCP Server exited with code ${code}`);
            mcpServerReady = false;
        });

        setTimeout(() => {
            if (!mcpServerReady) {
                reject(new Error('MCP Server startup timeout'));
            }
        }, 10000);
    });
}

// Send MCP Request
async function sendMCPRequest(tool, args = {}) {
    if (!mcpServerReady || !mcpServer) {
        throw new Error('MCP Server not ready');
    }

    return new Promise((resolve, reject) => {
        const request = {
            jsonrpc: '2.0',
            id: Date.now(),
            method: 'tools/call',
            params: {
                name: tool,
                arguments: args
            }
        };

        let response = '';
        const timeout = setTimeout(() => {
            reject(new Error('Request timeout'));
        }, 30000);

        const dataHandler = (data) => {
            response += data.toString();
            try {
                const lines = response.split('\n');
                for (const line of lines) {
                    if (line.trim() && line.includes('"jsonrpc"')) {
                        clearTimeout(timeout);
                        mcpServer.stdout.removeListener('data', dataHandler);
                        const result = JSON.parse(line.trim());
                        resolve(result);
                        return;
                    }
                }
            } catch (e) {
                // Continue collecting data
            }
        };

        mcpServer.stdout.on('data', dataHandler);
        mcpServer.stdin.write(JSON.stringify(request) + '\n');
    });
}

// API Routes
app.get('/api/status', (req, res) => {
    res.json({
        serverRunning: mcpServerReady,
        status: mcpServerReady ? 'online' : 'offline'
    });
});

app.post('/api/start-server', async (req, res) => {
    try {
        if (mcpServerReady) {
            return res.json({ success: true, message: 'Server already running' });
        }
        
        await startMCPServer();
        res.json({ success: true, message: 'MCP Server started successfully' });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            error: error.message,
            hint: error.message.includes('environment') ? 
                'Create a .env file with ARBITRUM_RPC_URL and ETHEREUM_RPC_URL' : null
        });
    }
});

app.post('/api/tool/:toolName', async (req, res) => {
    try {
        const { toolName } = req.params;
        const args = req.body;
        
        console.log(`🔧 API Call: ${toolName}`, args);
        
        const result = await sendMCPRequest(toolName, args);
        
        // Parse the content if it's a successful MCP response
        let parsedResult = result;
        if (result.result && result.result.content && result.result.content[0] && result.result.content[0].text) {
            try {
                parsedResult = {
                    ...result,
                    parsedContent: JSON.parse(result.result.content[0].text)
                };
            } catch (e) {
                // Keep original if parsing fails
            }
        }
        
        res.json({ success: true, data: parsedResult });
    } catch (error) {
        console.error(`❌ Tool ${req.params.toolName} failed:`, error.message);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Serve the functional web demo
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'functional-web-demo.html'));
});

// Cleanup on exit
process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down...');
    if (mcpServer) {
        mcpServer.kill();
    }
    process.exit(0);
});

app.listen(PORT, () => {
    console.log('🌐 API Server running at:');
    console.log(`   http://localhost:${PORT}`);
    console.log('');
    console.log('🎯 Ready to test Enhanced Bridge MCP Server features!');
    console.log('   • Open the URL above in your browser');
    console.log('   • Click "Start Server" to begin testing');
    console.log('   • Test all enhanced features interactively');
});
