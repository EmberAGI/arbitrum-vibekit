#!/usr/bin/env node

// Simple test script to verify Beefy plugin loading
import { initializePublicRegistry } from '../../dist/index.js';

console.log('🧪 Testing Beefy Plugin Registry...\n');

const chainConfigs = [
  {
    chainId: 42161,
    rpcUrl: 'https://arb1.arbitrum.io/rpc',
    wrappedNativeToken: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
  },
];

async function testBeefyPlugin() {
  try {
    console.log('📋 Initializing plugin registry...');
    const registry = initializePublicRegistry(chainConfigs);

    console.log('🔍 Loading plugins...');
    let pluginCount = 0;
    let beefyFound = false;

    for await (const plugin of registry.getPlugins()) {
      pluginCount++;
      console.log(`\n📦 Plugin ${pluginCount}:`);
      console.log(`   Name: ${plugin.name}`);
      console.log(`   Type: ${plugin.type}`);
      console.log(`   ID: ${plugin.id || 'N/A'}`);
      console.log(`   Actions: ${plugin.actions.length}`);

      if (plugin.name.includes('Beefy')) {
        beefyFound = true;
        console.log('   🥩 BEEFY PLUGIN FOUND!');

        // List actions
        plugin.actions.forEach((action, i) => {
          console.log(`   Action ${i + 1}: ${action.type} - ${action.name}`);
        });
      }
    }

    console.log(`\n📊 Summary:`);
    console.log(`   Total plugins loaded: ${pluginCount}`);
    console.log(`   Beefy plugin found: ${beefyFound ? '✅ YES' : '❌ NO'}`);

    if (beefyFound) {
      console.log('\n🎉 SUCCESS: Beefy plugin is working correctly!');
    } else {
      console.log('\n❌ ISSUE: Beefy plugin was not loaded');
    }
  } catch (error) {
    console.error('\n💥 Error testing plugin:', error.message);
    console.error('Stack:', error.stack);
  }
}

testBeefyPlugin();
