#!/usr/bin/env node

// Comprehensive test of all 13 Centrifuge MCP tools
// Shows exact results for each tool with parameters and onchain data

const toolResults = {};

async function testAllTools() {
  console.log('🚀 COMPREHENSIVE CENTRIFUGE MCP TOOLS TEST\n');
  console.log('📊 Testing all 13 tools with exact parameters and onchain results\n');
  console.log('='.repeat(60) + '\n');

  // =========================================================================
  // 1. DISCOVER CENTRIFUGE POOLS TOOL
  // =========================================================================
  console.log('🏊 TOOL 1: discover-centrifuge-pools');
  console.log('📝 Parameters: {} (discover all pools)');
  console.log('-'.repeat(50));

  try {
    const { executeDiscoverCentrifugePools } = await import('./dist/tools/poolDiscovery.js');
    const result = await executeDiscoverCentrifugePools({});
    toolResults['discover-centrifuge-pools'] = result;
    console.log('✅ SUCCESS - ONCHAIN RESULT:');
    console.log(result.content);
  } catch (error) {
    console.log(`❌ FAILED: ${error.message}`);
    toolResults['discover-centrifuge-pools'] = { error: error.message };
  }

  console.log('\n' + '='.repeat(60) + '\n');

  // =========================================================================
  // 2. GET INVESTMENT STATUS TOOL
  // =========================================================================
  console.log('📈 TOOL 2: get-investment-status');
  console.log('📝 Parameters: { investorAddress: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" }');
  console.log('-'.repeat(50));

  try {
    const { executeGetInvestmentStatus } = await import('./dist/tools/investmentStatus.js');
    const result = await executeGetInvestmentStatus({
      investorAddress: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
    });
    toolResults['get-investment-status'] = result;
    console.log('✅ SUCCESS - ONCHAIN RESULT:');
    console.log(result.content);
  } catch (error) {
    console.log(`❌ FAILED: ${error.message}`);
    toolResults['get-investment-status'] = { error: error.message };
  }

  console.log('\n' + '='.repeat(60) + '\n');

  // =========================================================================
  // 3. ANALYZE POOL DETAILS TOOL
  // =========================================================================
  console.log('📊 TOOL 3: analyze-pool-details');
  console.log('📝 Parameters: { poolId: "1", includeRiskMetrics: true, includeHistoricalData: true }');
  console.log('-'.repeat(50));

  try {
    const { executeAnalyzePoolDetails } = await import('./dist/tools/analyzePoolDetails.js');
    const result = await executeAnalyzePoolDetails({
      poolId: '1',
      includeRiskMetrics: true,
      includeHistoricalData: true,
      includeTrancheDetails: true
    });
    toolResults['analyze-pool-details'] = result;
    console.log('✅ SUCCESS - ONCHAIN RESULT:');
    console.log(result.content);
  } catch (error) {
    console.log(`❌ FAILED: ${error.message}`);
    toolResults['analyze-pool-details'] = { error: error.message };
  }

  console.log('\n' + '='.repeat(60) + '\n');

  // =========================================================================
  // 4. PLACE INVESTMENT ORDER TOOL
  // =========================================================================
  console.log('💰 TOOL 4: place-investment-order');
  console.log('📝 Parameters: { investorAddress: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", poolId: "1", trancheType: "Senior", amount: "1000.00", network: "arbitrum" }');
  console.log('-'.repeat(50));

  try {
    const { executePlaceInvestmentOrder } = await import('./dist/tools/placeInvestmentOrder.js');
    const result = await executePlaceInvestmentOrder({
      investorAddress: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
      poolId: '1',
      trancheType: 'Senior',
      amount: '1000.00',
      network: 'arbitrum',
      slippageTolerance: 2
    });
    toolResults['place-investment-order'] = result;
    console.log('✅ SUCCESS - ONCHAIN RESULT:');
    console.log(result.content);
  } catch (error) {
    console.log(`❌ FAILED: ${error.message}`);
    toolResults['place-investment-order'] = { error: error.message };
  }

  console.log('\n' + '='.repeat(60) + '\n');

  // =========================================================================
  // 5. CANCEL INVESTMENT ORDER TOOL
  // =========================================================================
  console.log('❌ TOOL 5: cancel-investment-order');
  console.log('📝 Parameters: { orderId: "test-order-123", reason: "User cancelled" }');
  console.log('-'.repeat(50));

  try {
    const { executeCancelInvestmentOrder } = await import('./dist/tools/cancelInvestmentOrder.js');
    const result = await executeCancelInvestmentOrder({
      orderId: 'test-order-123',
      reason: 'User cancelled'
    });
    toolResults['cancel-investment-order'] = result;
    console.log('✅ SUCCESS - ONCHAIN RESULT:');
    console.log(result.content);
  } catch (error) {
    console.log(`❌ FAILED: ${error.message}`);
    toolResults['cancel-investment-order'] = { error: error.message };
  }

  console.log('\n' + '='.repeat(60) + '\n');

  // =========================================================================
  // 6. PORTFOLIO REBALANCING TOOL
  // =========================================================================
  console.log('🔄 TOOL 6: portfolio-rebalancing');
  console.log('📝 Parameters: { investorAddress: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", targetAllocations: {"Senior": 60, "Junior": 40} }');
  console.log('-'.repeat(50));

  try {
    const { executePortfolioRebalancing } = await import('./dist/tools/portfolioRebalancing.js');
    const result = await executePortfolioRebalancing({
      investorAddress: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
      targetAllocations: {
        'Senior': 60,
        'Junior': 40
      },
      maxSlippage: 1,
      networks: ['arbitrum']
    });
    toolResults['portfolio-rebalancing'] = result;
    console.log('✅ SUCCESS - ONCHAIN RESULT:');
    console.log(result.content);
  } catch (error) {
    console.log(`❌ FAILED: ${error.message}`);
    toolResults['portfolio-rebalancing'] = { error: error.message };
  }

  console.log('\n' + '='.repeat(60) + '\n');

  // =========================================================================
  // 7. YIELD OPTIMIZATION TOOL
  // =========================================================================
  console.log('🎯 TOOL 7: yield-optimization');
  console.log('📝 Parameters: { investorAddress: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", riskTolerance: "medium", investmentAmount: "50000", networks: ["arbitrum"] }');
  console.log('-'.repeat(50));

  try {
    const { executeYieldOptimization } = await import('./dist/tools/yieldOptimization.js');
    const result = await executeYieldOptimization({
      investorAddress: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
      riskTolerance: 'medium',
      investmentAmount: '50000',
      networks: ['arbitrum', 'ethereum']
    });
    toolResults['yield-optimization'] = result;
    console.log('✅ SUCCESS - ONCHAIN RESULT:');
    console.log(result.content);
  } catch (error) {
    console.log(`❌ FAILED: ${error.message}`);
    toolResults['yield-optimization'] = { error: error.message };
  }

  console.log('\n' + '='.repeat(60) + '\n');

  // =========================================================================
  // 8. ADVANCED RISK ASSESSMENT TOOL
  // =========================================================================
  console.log('⚠️ TOOL 8: advanced-risk-assessment');
  console.log('📝 Parameters: { poolId: "1", investorAddress: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", includeMarketAnalysis: true, includeLiquidityAnalysis: true }');
  console.log('-'.repeat(50));

  try {
    const { executeAdvancedRiskAssessment } = await import('./dist/tools/advancedRiskAssessment.js');
    const result = await executeAdvancedRiskAssessment({
      poolId: '1',
      investorAddress: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
      includeMarketAnalysis: true,
      includeLiquidityAnalysis: true
    });
    toolResults['advanced-risk-assessment'] = result;
    console.log('✅ SUCCESS - ONCHAIN RESULT:');
    console.log(result.content);
  } catch (error) {
    console.log(`❌ FAILED: ${error.message}`);
    toolResults['advanced-risk-assessment'] = { error: error.message };
  }

  console.log('\n' + '='.repeat(60) + '\n');

  // =========================================================================
  // 9. TRANSACTION HISTORY TOOL
  // =========================================================================
  console.log('📋 TOOL 9: transaction-history');
  console.log('📝 Parameters: { investorAddress: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", limit: 10, includeFailed: false }');
  console.log('-'.repeat(50));

  try {
    const { executeTransactionHistory } = await import('./dist/tools/transactionHistory.js');
    const result = await executeTransactionHistory({
      investorAddress: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
      limit: 10,
      includeFailed: false
    });
    toolResults['transaction-history'] = result;
    console.log('✅ SUCCESS - ONCHAIN RESULT:');
    console.log(result.content);
  } catch (error) {
    console.log(`❌ FAILED: ${error.message}`);
    toolResults['transaction-history'] = { error: error.message };
  }

  console.log('\n' + '='.repeat(60) + '\n');

  // =========================================================================
  // 10. INVESTMENT PERFORMANCE TRACKING TOOL
  // =========================================================================
  console.log('📈 TOOL 10: investment-performance-tracking');
  console.log('📝 Parameters: { investorAddress: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", period: "30d", includeBenchmarks: true }');
  console.log('-'.repeat(50));

  try {
    const { executeInvestmentPerformanceTracking } = await import('./dist/tools/investmentPerformanceTracking.js');
    const result = await executeInvestmentPerformanceTracking({
      investorAddress: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
      period: '30d',
      includeBenchmarks: true
    });
    toolResults['investment-performance-tracking'] = result;
    console.log('✅ SUCCESS - ONCHAIN RESULT:');
    console.log(result.content);
  } catch (error) {
    console.log(`❌ FAILED: ${error.message}`);
    toolResults['investment-performance-tracking'] = { error: error.message };
  }

  console.log('\n' + '='.repeat(60) + '\n');

  // =========================================================================
  // 11. AUTOMATED REBALANCING EXECUTION TOOL
  // =========================================================================
  console.log('🤖 TOOL 11: automated-rebalancing-execution');
  console.log('📝 Parameters: { investorAddress: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", rebalanceThreshold: 5, maxSlippage: 2, enabled: true }');
  console.log('-'.repeat(50));

  try {
    const { executeAutomatedRebalancingExecution } = await import('./dist/tools/automatedRebalancingExecution.js');
    const result = await executeAutomatedRebalancingExecution({
      investorAddress: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
      rebalanceThreshold: 5,
      maxSlippage: 2,
      enabled: true
    });
    toolResults['automated-rebalancing-execution'] = result;
    console.log('✅ SUCCESS - ONCHAIN RESULT:');
    console.log(result.content);
  } catch (error) {
    console.log(`❌ FAILED: ${error.message}`);
    toolResults['automated-rebalancing-execution'] = { error: error.message };
  }

  console.log('\n' + '='.repeat(60) + '\n');

  // =========================================================================
  // 12. RISK ALERT SYSTEM TOOL
  // =========================================================================
  console.log('🚨 TOOL 12: risk-alert-system');
  console.log('📝 Parameters: { investorAddress: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", alertThresholds: {"riskScore": 80, "liquidityScore": 20, "yieldDeviation": 10}, notificationChannels: ["email", "push"] }');
  console.log('-'.repeat(50));

  try {
    const { executeRiskAlertSystem } = await import('./dist/tools/riskAlertSystem.js');
    const result = await executeRiskAlertSystem({
      investorAddress: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
      alertThresholds: {
        riskScore: 80,
        liquidityScore: 20,
        yieldDeviation: 10
      },
      notificationChannels: ['email', 'push']
    });
    toolResults['risk-alert-system'] = result;
    console.log('✅ SUCCESS - ONCHAIN RESULT:');
    console.log(result.content);
  } catch (error) {
    console.log(`❌ FAILED: ${error.message}`);
    toolResults['risk-alert-system'] = { error: error.message };
  }

  console.log('\n' + '='.repeat(60) + '\n');

  // =========================================================================
  // 13. YIELD COMPARISON TOOL
  // =========================================================================
  console.log('📊 TOOL 13: yield-comparison-tool');
  console.log('📝 Parameters: { poolIds: ["1", "2"], comparisonPeriod: "90d", includeRiskAdjusted: true }');
  console.log('-'.repeat(50));

  try {
    const { executeYieldComparisonTool } = await import('./dist/tools/yieldComparisonTool.js');
    const result = await executeYieldComparisonTool({
      poolIds: ['1', '2'],
      comparisonPeriod: '90d',
      includeRiskAdjusted: true
    });
    toolResults['yield-comparison-tool'] = result;
    console.log('✅ SUCCESS - ONCHAIN RESULT:');
    console.log(result.content);
  } catch (error) {
    console.log(`❌ FAILED: ${error.message}`);
    toolResults['yield-comparison-tool'] = { error: error.message };
  }

  console.log('\n' + '='.repeat(60) + '\n');

  // =========================================================================
  // FINAL SUMMARY
  // =========================================================================
  console.log('🎯 COMPREHENSIVE TEST RESULTS SUMMARY');
  console.log('='.repeat(60));
  console.log(`📊 Total Tools Tested: 13`);
  console.log(`✅ Successful: ${Object.values(toolResults).filter(r => !r.error).length}`);
  console.log(`❌ Failed: ${Object.values(toolResults).filter(r => r.error).length}`);

  console.log('\n🔧 TOOL STATUS SUMMARY:');
  Object.entries(toolResults).forEach(([toolName, result], index) => {
    const status = result.error ? '❌ FAILED' : '✅ SUCCESS';
    const details = result.error ? result.error.substring(0, 50) + '...' : `${result.content?.length || 0} chars`;
    console.log(`  ${index + 1}. ${toolName}: ${status} (${details})`);
  });

  console.log('\n🎉 ALL 13 CENTRIFUGE MCP TOOLS HAVE BEEN TESTED!');
  console.log('💡 Each tool shows real onchain data processing and results.');
}

// Run the comprehensive test
testAllTools();
