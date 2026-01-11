
======================================================================
🔴 POLYMARKET LIVE ORDER CANCELLATION TEST
======================================================================
Wallet: 0x73b45E9DC72dC32Fb6b539d006e9Cb78830c18F5
======================================================================


stdout | tests/polymarket-cancel-orders.live.test.ts > Polymarket LIVE Order Cancellation Tests > Step 1: Show Current Positions > should display all current positions

📊 Fetching current positions...


stdout | tests/polymarket-cancel-orders.live.test.ts > Polymarket LIVE Order Cancellation Tests > Step 1: Show Current Positions > should display all current positions
============================================================
📍 CURRENT POSITIONS
============================================================
   No positions found (wallet has no filled orders)
============================================================

stdout | tests/polymarket-cancel-orders.live.test.ts > Polymarket LIVE Order Cancellation Tests > Step 2: Show Current Open Orders > should display all open orders

📊 Fetching open orders...

stdout | tests/polymarket-cancel-orders.live.test.ts > Polymarket LIVE Order Cancellation Tests > Step 2: Show Current Open Orders > should display all open orders
============================================================
📋 CURRENT OPEN ORDERS
============================================================
   Total Open Orders: 5

   📝 Order #1
      ID: 0x9f2ecebf5d01b34bf40ac8347e936b1315b5f16e95181c10d444892e7b5da5d9
      Market: 6377373959477560608325823...
      Outcome: unknown
      Side: BUY
      Price: 0.05
      Size: 10
      Status: open

   📝 Order #2
      ID: 0x36f3360377437d9e36e4103a11a38f357d9c2a458941245956b1aea74fe6353f
      Market: 5925949593456259631864497...
      Outcome: unknown
      Side: BUY
      Price: 0.05
      Size: 10
      Status: open

   📝 Order #3
      ID: 0x9168d82387650c830b03550b5802fc3a70d2ed2fab2b74c0a37bbb9ec4e35886
      Market: 6377373959477560608325823...
      Outcome: unknown
      Side: BUY
      Price: 0.05
      Size: 10
      Status: open

   📝 Order #4
      ID: 0x91fed75e3aeeefffeffe3a00036379748debcbc296e64a27b5804b995980cb82
      Market: 5925949593456259631864497...
      Outcome: unknown
      Side: BUY
      Price: 0.05
      Size: 10
      Status: open

   📝 Order #5
      ID: 0x51a021c8968f2dbd2030e26e8dd95c02856c3b3fa37700d9ee03a83abd6d0c55
      Market: 5787849305014842563782278...
      Outcome: unknown
      Side: BUY
      Price: 0.25
      Size: 5
      Status: open

============================================================

stdout | tests/polymarket-cancel-orders.live.test.ts > Polymarket LIVE Order Cancellation Tests > Step 3: Cancel Orders One by One (First Half) > should cancel orders individually

🗑️  Cancelling first half of orders one by one...

   Orders to cancel individually: 3
   Orders to cancel with cancelAll: 2

   ❌ Cancelling order: 0x9f2ecebf5d01b34bf4...

stdout | tests/polymarket-cancel-orders.live.test.ts > Polymarket LIVE Order Cancellation Tests > Step 3: Cancel Orders One by One (First Half) > should cancel orders individually
      ✅ Cancelled successfully!

stdout | tests/polymarket-cancel-orders.live.test.ts > Polymarket LIVE Order Cancellation Tests > Step 3: Cancel Orders One by One (First Half) > should cancel orders individually
   ❌ Cancelling order: 0x36f3360377437d9e36...

stdout | tests/polymarket-cancel-orders.live.test.ts > Polymarket LIVE Order Cancellation Tests > Step 3: Cancel Orders One by One (First Half) > should cancel orders individually
      ✅ Cancelled successfully!

stdout | tests/polymarket-cancel-orders.live.test.ts > Polymarket LIVE Order Cancellation Tests > Step 3: Cancel Orders One by One (First Half) > should cancel orders individually
   ❌ Cancelling order: 0x9168d82387650c830b...

stdout | tests/polymarket-cancel-orders.live.test.ts > Polymarket LIVE Order Cancellation Tests > Step 3: Cancel Orders One by One (First Half) > should cancel orders individually
      ✅ Cancelled successfully!

stdout | tests/polymarket-cancel-orders.live.test.ts > Polymarket LIVE Order Cancellation Tests > Step 3: Cancel Orders One by One (First Half) > should cancel orders individually

   Cancelled 3 orders individually


stdout | tests/polymarket-cancel-orders.live.test.ts > Polymarket LIVE Order Cancellation Tests > Step 4: Verify Partial Cancellation > should show remaining orders after individual cancellations

📊 Fetching remaining orders after individual cancellations...


stdout | tests/polymarket-cancel-orders.live.test.ts > Polymarket LIVE Order Cancellation Tests > Step 4: Verify Partial Cancellation > should show remaining orders after individual cancellations
============================================================
📋 REMAINING ORDERS (After Individual Cancellations)
============================================================
   Initial Orders: 5
   Cancelled Individually: 3
   Remaining Orders: 2

   Remaining order IDs:
      - 0x91fed75e3aeeefffeffe3a000363... (buy 10@0.05)
      - 0x51a021c8968f2dbd2030e26e8dd9... (buy 5@0.25)
============================================================

stdout | tests/polymarket-cancel-orders.live.test.ts > Polymarket LIVE Order Cancellation Tests > Step 5: Cancel All Remaining Orders at Once > should cancel all remaining orders with cancelAll

🗑️  Cancelling ALL remaining orders at once...

   Orders to cancel: 2

stdout | tests/polymarket-cancel-orders.live.test.ts > Polymarket LIVE Order Cancellation Tests > Step 5: Cancel All Remaining Orders at Once > should cancel all remaining orders with cancelAll

   Result:
      Success: true
      Cancelled Count: N/A
      ✅ All remaining orders cancelled!

stdout | tests/polymarket-cancel-orders.live.test.ts > Polymarket LIVE Order Cancellation Tests > Step 6: Verify All Cancellations > should verify no orders remain

📊 Final verification - checking for remaining orders...


stdout | tests/polymarket-cancel-orders.live.test.ts > Polymarket LIVE Order Cancellation Tests > Step 6: Verify All Cancellations > should verify no orders remain
============================================================
📋 FINAL ORDER STATUS
============================================================
   Initial Orders: 5
   Remaining Orders: 0

   ✅ All orders successfully cancelled!
============================================================

stdout | tests/polymarket-cancel-orders.live.test.ts > Polymarket LIVE Order Cancellation Tests > Step 7: Test cancelAllOrders() Helper > should test the cancelAllOrders helper method

📊 Testing cancelAllOrders() helper method...


stdout | tests/polymarket-cancel-orders.live.test.ts > Polymarket LIVE Order Cancellation Tests > Step 7: Test cancelAllOrders() Helper > should test the cancelAllOrders helper method
   Result:
      Success: true
      Cancelled: 0
      ✅ cancelAllOrders() works correctly!

stdout | tests/polymarket-cancel-orders.live.test.ts > Polymarket LIVE Order Cancellation Tests > Test Summary > should print cancellation summary

======================================================================
📊 ORDER CANCELLATION TEST SUMMARY
======================================================================

📋 Results:
   Initial Orders: 5
   Cancelled Individually: 3
   Cancelled with cancelAll: 2

✅ Functions Tested:
   - getPositions()
   - getOrders()
   - cancelOrder(orderId) - Individual cancellation
   - cancelOrder("all") - Bulk cancellation
   - cancelAllOrders() - Helper method
======================================================================


 ✓ tests/polymarket-cancel-orders.live.test.ts (8 tests) 20698ms
   ✓ Polymarket LIVE Order Cancellation Tests > Step 1: Show Current Positions > should display all current positions  11335ms
   ✓ Polymarket LIVE Order Cancellation Tests > Step 2: Show Current Open Orders > should display all open orders  882ms
   ✓ Polymarket LIVE Order Cancellation Tests > Step 3: Cancel Orders One by One (First Half) > should cancel orders individually  3085ms
   ✓ Polymarket LIVE Order Cancellation Tests > Step 4: Verify Partial Cancellation > should show remaining orders after individual cancellations  2250ms
   ✓ Polymarket LIVE Order Cancellation Tests > Step 5: Cancel All Remaining Orders at Once > should cancel all remaining orders with cancelAll  545ms
   ✓ Polymarket LIVE Order Cancellation Tests > Step 6: Verify All Cancellations > should verify no orders remain  2291ms

 Test Files  1 passed (1)
      Tests  8 passed (8)
   Start at  22:36:51
   Duration  22.10s (transform 226ms, setup 0ms, collect 592ms, tests 20.70s, environment 0ms, prepare 132ms)
