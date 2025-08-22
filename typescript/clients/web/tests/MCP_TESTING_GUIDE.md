# CoinGecko MCP Server Frontend Testing Guide

This guide provides comprehensive testing strategies for verifying that the CoinGecko MCP server integration works correctly with your web client.

## 🚀 Quick Start Testing

### 1. Build and Start the MCP Server

```bash
# Navigate to the MCP server directory
cd arbitrum-vibekit/typescript/lib/mcp-tools/coingecko-mcp-server

# Install dependencies
pnpm install

# Build the server
pnpm build

# Start the server
pnpm dev
```

You should see output like:
```
CoinGecko MCP Server is running on port 3011
Initializing stdio transport...
CoinGecko MCP stdio server started and connected.
```

### 2. Run Manual Tests

```bash
# Navigate to the web client tests directory
cd arbitrum-vibekit/typescript/clients/web/tests

# Run the manual testing script
node manual-mcp-test.js

# Or run in interactive mode
node manual-mcp-test.js --interactive
```

## 🧪 Testing Strategies

### A. Manual Testing Script

The `manual-mcp-test.js` script provides several testing modes:

#### Quick Test Mode
```bash
node manual-mcp-test.js
```
This runs all tests automatically and reports results.

#### Interactive Mode
```bash
node manual-mcp-test.js --interactive
```
This provides an interactive interface where you can:
- `test` - Run all tests
- `chart BTC 7` - Generate a BTC chart for 7 days
- `tokens` - Get list of supported tokens
- `http` - Test HTTP endpoint
- `quit` - Exit

### B. Playwright Integration Tests

Run the automated browser tests:

```bash
# Navigate to web client directory
cd arbitrum-vibekit/typescript/clients/web

# Run MCP integration tests
npx playwright test tests/mcp-integration.test.ts
```

### C. Unit Tests

Test the MCP server directly:

```bash
# Navigate to MCP server directory
cd arbitrum-vibekit/typescript/lib/mcp-tools/coingecko-mcp-server

# Run the test script
node test-mcp.js
```

## 🔍 What to Test

### 1. Server Connectivity

**Test**: Verify the MCP server starts and accepts connections
```bash
# Check if server is running
curl http://localhost:3011/sse
```

**Expected**: Server should respond with SSE headers

### 2. Tool Discovery

**Test**: Verify tools are discoverable
```bash
# Use the manual test script
node manual-mcp-test.js
```

**Expected**: Should find `generate_chart` and `get_supported_tokens` tools

### 3. Chart Generation

**Test**: Generate a price chart
```bash
# Interactive mode
node manual-mcp-test.js --interactive
# Then type: chart BTC 7
```

**Expected**: Should return chart data with prices array

### 4. Error Handling

**Test**: Try invalid tokens
```bash
# Interactive mode
node manual-mcp-test.js --interactive
# Then type: chart INVALIDTOKEN 7
```

**Expected**: Should return error message about unsupported token

### 5. Web Client Integration

**Test**: Use the web interface
1. Start the web client
2. Navigate to the chat interface
3. Send message: "Generate a price chart for BTC over 7 days"
4. Verify chart appears

**Expected**: Chart should render with interactive elements

## 🐛 Troubleshooting

### Common Issues

#### 1. MCP Server Won't Start

**Symptoms**: Server fails to start or crashes
**Solutions**:
```bash
# Check if port 3002 is in use
lsof -i :3011

# Kill any existing process
kill -9 <PID>

# Check dependencies
cd arbitrum-vibekit/typescript/lib/mcp-tools/coingecko-mcp-server
pnpm install
```

#### 2. Connection Refused

**Symptoms**: "Connection refused" errors
**Solutions**:
```bash
# Verify server is running
ps aux | grep coingecko-mcp-server

# Check server logs
cd arbitrum-vibekit/typescript/lib/mcp-tools/coingecko-mcp-server
pnpm dev 2>&1 | tee server.log
```

#### 3. Chart Not Rendering

**Symptoms**: Chart data received but not displayed
**Solutions**:
- Check browser console for errors
- Verify `PriceChart` component is working
- Check if MCP response format matches expected format

#### 4. Rate Limiting Issues

**Symptoms**: API errors or timeouts
**Solutions**:
- Check CoinGecko API status
- Verify retry logic is working
- Check server logs for rate limit messages

### Debug Mode

Enable debug logging:

```bash
# Set debug environment variable
DEBUG=* pnpm dev

# Or modify the server code to add more logging
```

## 📊 Test Results Validation

### Successful Test Indicators

1. **Server Startup**: ✅ "CoinGecko MCP stdio server started and connected"
2. **Tool Discovery**: ✅ Found 2 tools (`generate_chart`, `get_supported_tokens`)
3. **Chart Generation**: ✅ Chart data with >0 data points
4. **Error Handling**: ✅ Proper error messages for invalid tokens
5. **Web Integration**: ✅ Chart renders in browser

### Performance Benchmarks

- **Server Startup**: < 5 seconds
- **Chart Generation**: < 10 seconds
- **Error Response**: < 2 seconds
- **Web Rendering**: < 3 seconds

## 🔧 Advanced Testing

### Load Testing

Test multiple concurrent requests:

```bash
# Use the interactive test script
node manual-mcp-test.js --interactive

# Send multiple chart requests quickly
chart BTC 7
chart ETH 7
chart USDC 7
```

### Network Failure Testing

Test resilience to network issues:

```bash
# Start server
pnpm dev

# In another terminal, block network
sudo iptables -A INPUT -p tcp --dport 3011 -j DROP

# Try to generate chart (should fail gracefully)

# Restore network
sudo iptables -D INPUT -p tcp --dport 3011 -j DROP
```

### Memory Leak Testing

Monitor memory usage during extended use:

```bash
# Start server with memory monitoring
node --inspect dist/index.js

# Use Chrome DevTools to monitor memory
# Or use process monitoring
watch -n 1 'ps aux | grep coingecko-mcp-server'
```

## 📝 Test Checklist

### Pre-Testing Setup
- [ ] MCP server builds successfully
- [ ] Dependencies installed
- [ ] Port 3011 available
- [ ] Web client configured

### Basic Functionality
- [ ] Server starts without errors
- [ ] Tools are discoverable
- [ ] Chart generation works
- [ ] Error handling works
- [ ] HTTP endpoint accessible

### Integration Testing
- [ ] Web client connects to MCP server
- [ ] Chart requests work through web interface
- [ ] Charts render correctly
- [ ] Error messages display properly
- [ ] Multiple requests work

### Performance Testing
- [ ] Response times are acceptable
- [ ] Memory usage is stable
- [ ] Concurrent requests work
- [ ] Network failures handled gracefully

### User Experience
- [ ] Charts are interactive
- [ ] Loading states work
- [ ] Error messages are clear
- [ ] UI is responsive

## 🎯 Success Criteria

A successful integration test should demonstrate:

1. **Reliability**: Server handles requests consistently
2. **Performance**: Response times under 10 seconds
3. **Error Handling**: Graceful failure with clear messages
4. **User Experience**: Smooth chart rendering and interaction
5. **Integration**: Seamless web client integration

## 📞 Getting Help

If you encounter issues:

1. **Check the logs**: Look for error messages in server output
2. **Verify configuration**: Ensure URLs and ports are correct
3. **Test components**: Test MCP server and web client separately
4. **Check dependencies**: Ensure all packages are installed
5. **Review documentation**: Check the README and example files

## 🔄 Continuous Testing

For ongoing development, consider:

1. **Automated tests**: Run tests in CI/CD pipeline
2. **Monitoring**: Set up alerts for server failures
3. **Health checks**: Implement endpoint health monitoring
4. **Performance tracking**: Monitor response times and errors

This testing guide ensures your CoinGecko MCP server integration is robust and ready for production use. 