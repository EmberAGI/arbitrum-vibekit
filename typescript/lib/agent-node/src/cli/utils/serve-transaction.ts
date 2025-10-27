import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Parameters for serving the transaction signing page.
 */
export type ServeTransactionPageParams = {
  to: string;
  data: string;
  chainId: number;
  agentName?: string;
  onAgentIdReceived?: (agentId: number) => void;
};

/**
 * Serves a local HTTP server with the transaction signing page.
 * @param params Transaction parameters to pass to the frontend
 * @param port Port to serve on (default: 3456)
 * @returns Promise that resolves with the server URL
 */
export async function serveTransactionSigningPage(
  params: ServeTransactionPageParams,
  port = 3456,
): Promise<string> {
  const htmlPath = join(__dirname, '..', 'templates', 'sign-transaction.html');
  const htmlContent = readFileSync(htmlPath, 'utf-8');

  return new Promise((resolve, reject) => {
    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      // Handle callback endpoint for agent ID
      if (req.method === 'POST' && req.url === '/callback') {
        let body = '';
        req.on('data', (chunk) => {
          body += chunk.toString();
        });
        req.on('end', () => {
          try {
            const data = JSON.parse(body);
            if (data.agentId && params.onAgentIdReceived) {
              params.onAgentIdReceived(data.agentId);
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
          } catch (error) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid request' }));
          }
        });
        return;
      }

      // Only accept GET requests to root path
      if (req.method !== 'GET' || !req.url?.startsWith('/')) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
        return;
      }

      // Serve the HTML file
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(htmlContent);
    });

    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        reject(new Error(`Port ${port} is already in use`));
      } else {
        reject(err);
      }
    });

    server.listen(port, 'localhost', () => {
      // Build URL with query parameters
      const url = new URL(`http://localhost:${port}`);
      url.searchParams.set('to', params.to);
      url.searchParams.set('data', params.data);
      url.searchParams.set('chainId', params.chainId.toString());
      if (params.agentName) {
        url.searchParams.set('agentName', params.agentName);
      }

      resolve(url.toString());
    });

    // Keep server alive - user will need to manually close it or it will close with the process
  });
}

/**
 * Opens a URL in the default browser using platform-specific commands.
 * @param url The URL to open
 */
export async function openBrowser(url: string): Promise<void> {
  const { exec } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const execAsync = promisify(exec);

  const platform = process.platform;
  let command: string;

  switch (platform) {
    case 'darwin':
      command = `open "${url}"`;
      break;
    case 'win32':
      command = `start "" "${url}"`;
      break;
    default: // linux and others
      command = `xdg-open "${url}"`;
      break;
  }

  try {
    await execAsync(command);
  } catch (error) {
    throw new Error(`Failed to open browser: ${error}`);
  }
}
