/**
 * Request Discovery Script
 *
 * This script helps identify what HTTP requests are made during test execution
 * by running tests with MSW in passthrough mode with detailed logging.
 *
 * Usage: tsx tests/utils/discover-requests.ts
 */

import { http, passthrough } from 'msw';
import { setupServer } from 'msw/node';

// Track all requests
const capturedRequests: Array<{
  method: string;
  url: string;
  headers: Record<string, string>;
  body: unknown;
}> = [];

// Create a catch-all handler that logs and passes through
const handlers = [
  http.all('*', async ({ request }) => {
    const url = request.url;
    const method = request.method;

    // Get headers (excluding sensitive auth)
    const headers: Record<string, string> = {};
    request.headers.forEach((value, key) => {
      if (key.toLowerCase() === 'authorization') {
        headers[key] = 'Bearer [REDACTED]';
      } else {
        headers[key] = value;
      }
    });

    // Get body
    let body: unknown = null;
    if (method !== 'GET' && method !== 'HEAD') {
      try {
        const contentType = request.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          body = await request.json();
        } else {
          body = await request.text();
        }
      } catch {
        // Ignore body parsing errors
      }
    }

    const requestInfo = {
      method,
      url,
      headers,
      body,
    };

    capturedRequests.push(requestInfo);

    console.log('\n=== HTTP Request Captured ===');
    console.log(`${method} ${url}`);
    console.log('Headers:', JSON.stringify(headers, null, 2));
    if (body) {
      console.log('Body:', JSON.stringify(body, null, 2));
    }
    console.log('=============================\n');

    // Pass through the request to the actual API
    return passthrough();
  }),
];

// Set up MSW server with logging
const server = setupServer(...handlers);

// Start server
server.listen({
  onUnhandledRequest: 'bypass', // Let all requests through
});

console.log('Request discovery server started. Monitoring all HTTP requests...');
console.log('Run your test now to see what requests are made.\n');

// Handle process termination
process.on('SIGINT', () => {
  console.log('\n\n=== Summary of Captured Requests ===');
  capturedRequests.forEach((req, index) => {
    console.log(`\n${index + 1}. ${req.method} ${req.url}`);
    if (req.body) {
      console.log('   Body preview:', JSON.stringify(req.body).substring(0, 100) + '...');
    }
  });
  console.log('\nTotal requests captured:', capturedRequests.length);

  server.close();
  process.exit(0);
});

// Export for use in tests
export { server, capturedRequests };
