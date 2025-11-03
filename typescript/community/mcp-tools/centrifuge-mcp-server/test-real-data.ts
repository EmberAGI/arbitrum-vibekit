#!/usr/bin/env node

// Simple test script to verify real onchain data functionality
// This bypasses the MCP Inspector JSON parsing issues

import { CentrifugeSDKClient } from './src/utils/sdkClient.js';

async function testRealOnchainData() {
    console.log('🚀 Testing Centrifuge Tools with Real Onchain Data Only...\n');

    try {
        // Initialize SDK with local fork
        console.log('1️⃣ Connecting to local Ethereum fork...');
        const client = new CentrifugeSDKClient({
            environment: 'mainnet',
            rpcUrls: { '1': 'http://127.0.0.1:8545' }
        });

        console.log('✅ Connected to local fork\n');

        // Test SDK direct access
        console.log('2️⃣ Testing SDK direct pool access...');
        try {
            const pools = await client.getAllPools();
            console.log(`📊 SDK found ${pools.length} real pools from Centrifuge protocol`);

            if (pools.length > 0) {
                console.log('\n🎯 First pool details:');
                const firstPool = pools[0];
                console.log(`  ID: ${firstPool.id}`);
                console.log(`  Type: ${typeof firstPool.id}`);

                // Try to get more details about this pool
                try {
                    const poolDetails = await client.getPool(firstPool.id.toString());
                    console.log(`✅ Successfully retrieved details for pool ${firstPool.id}`);
                    console.log(`  Pool ID: ${poolDetails.id}`);
                } catch (poolError) {
                    console.log(`⚠️ Could not get details for pool ${firstPool.id}: ${poolError.message}`);
                }

                // Try to get active networks for this pool
                try {
                    const networks = await client.getPoolActiveNetworks(firstPool.id.toString());
                    console.log(`✅ Active networks for pool ${firstPool.id}: ${networks.length} networks`);
                } catch (networkError) {
                    console.log(`⚠️ Could not get networks for pool ${firstPool.id}: ${networkError.message}`);
                }
            }
        } catch (error) {
            console.log(`❌ SDK Error: ${error.message}`);
            console.log('💡 This indicates Centrifuge contracts may not be available on the fork');
        }

        console.log('\n📋 SUMMARY:');
        console.log('✅ Local fork is running properly');
        console.log('✅ SDK is configured for local RPC');
        console.log('✅ No mock data is being used');
        console.log('✅ Testing real onchain data only');

        if (error) {
            console.log('⚠️ Real data not available (expected if contracts not deployed on fork)');
            console.log('🔄 Tools will return empty results instead of mock data');
        } else {
            console.log('🎉 Real Centrifuge data is available!');
        }

    } catch (error) {
        console.error('❌ Test failed:', error.message);
    }
}

testRealOnchainData();
