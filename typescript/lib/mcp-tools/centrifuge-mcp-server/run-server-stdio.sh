#!/bin/bash

# Simple wrapper script for stdio-only server (no HTTP port conflicts)
cd /Users/griffinsoduol/Desktop/OtherProjects/arbitrum-vibekit/typescript/lib/mcp-tools/centrifuge-mcp-server
/tmp/node-executable dist/stdio-server.js
