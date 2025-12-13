# Compatibility Notes

## Uniswap SDK and Ethers Version Compatibility

The Uniswap MCP Server uses the latest Uniswap SDK packages which require **ethers v6**. However, the vibekit codebase currently uses **ethers v5**.

### Current Status

- **Uniswap SDK packages**: Latest versions (require ethers v6)
- **Vibekit codebase**: Uses ethers v5
- **Status**: Code structure is complete, but SDK integration needs ethers v6 compatibility layer or migration

### Options for Resolution

1. **Use ethers v6 adapter**: Create an adapter layer to bridge ethers v5 and v6
2. **Upgrade to ethers v6**: Migrate the entire vibekit codebase to ethers v6 (larger change)
3. **Use older Uniswap SDK versions**: Find versions compatible with ethers v5 (may have limited features)

### Recommended Approach

For production use, we recommend:
1. Testing the current implementation with ethers v6 in an isolated environment
2. Creating an adapter layer if needed
3. Or waiting for vibekit to migrate to ethers v6

### Installation

The packages may show peer dependency warnings during installation. This is expected due to the ethers version mismatch. The code structure is complete and ready for testing once the ethers compatibility is resolved.

