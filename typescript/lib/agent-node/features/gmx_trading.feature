Feature: GMX Trading Operations (Stage 1.1)
  As a trader
  In order to execute basic perpetuals trading strategies
  I want to open and close long/short positions on GMX perpetuals with market and limit orders

  Background:
    Given a funded embedded EOA wallet is connected to the agent
    And the GMX markets are available on Arbitrum One (Chain ID 42161)
    And the Onchain Actions MCP server is accessible at https://api.emberai.xyz/mcp
    And the agent operates with at least 3 test markets available

  @core
  Scenario: Open a long position on ETH-USD test market
    Given I have sufficient balance for margin requirements
    And the ETH-USD market is available and liquid (primary test market)
    When I request to open a long position for 3 USDC with 2x leverage
    Then the position should be opened successfully via Onchain Actions MCP
    And I should receive a position confirmation with details
    And my wallet balance should reflect the margin deduction
    And the position should appear in my active positions

  @core
  Scenario: Open a short position with market order
    Given I have sufficient balance for margin requirements
    And a GMX test market is available and liquid
    When I place a market order to go short 3 USDC with 3x leverage
    Then the order should execute immediately at market price
    And my effective exposure should be 9 USDC worth
    And my margin requirement should be 3 USDC
    And the position should be reflected in my portfolio

  @core
  Scenario: Place a limit order with leverage
    Given I have 10 USDC available balance
    And the current ETH price is 2500 USDC
    When I place a limit order to go long 3 USDC with 3x leverage at 2450 USDC per ETH
    Then the order should be placed in the GMX order book
    And my available balance should remain 10 USDC until execution
    And the order should show as pending in my orders
    When the ETH price drops to 2450 USDC
    Then the order should execute automatically
    And I should have a long position with 9 USDC exposure

  @core
  Scenario: Close an existing position
    Given I have an open long position of 3 USDC with 2x leverage on ETH-USD
    And the position is profitable by 2.50 USDC
    When I request to close the entire position
    Then the position should be closed successfully via Onchain Actions MCP
    And I should receive approximately 5.50 USDC back to my wallet
    And the position should be removed from my active positions
    And I should receive a closure confirmation

  @core
  Scenario: View current balances and positions
    Given I have active positions on test markets
    And I have USDC balance in my embedded EOA wallet
    When I request to view my balances and positions
    Then I should see my current USDC balance
    And I should see all active positions with their details
    And each position should show current PnL
    And each position should show leverage and size
    And the data should be current within blockchain confirmation limits

  @error-handling
  Scenario: Attempt to open position with insufficient balance
    Given I have only 3 USDC in my wallet
    And the minimum position size is 2.50 USDC
    When I request to open a position for 8 USDC with 2x leverage
    Then the transaction should fail with "Insufficient balance" error
    And the error should indicate required balance of 4 USDC
    And no position should be created
    And my wallet balance should remain unchanged

  @error-handling
  Scenario: Attempt to use leverage beyond GMX market limits
    Given I have 10 USDC available balance
    And the GMX market has maximum leverage constraints
    When I request to open a position with excessive leverage
    Then the transaction should fail with leverage limit error
    And the error should indicate the maximum allowed leverage per GMX constraints
    And no position should be created

  @core
  Scenario: Validate leverage bounds per GMX constraints (PRD lines 25, 292-294)
    Given I have sufficient balance for trading
    And the GMX market has specific leverage constraints
    When I request positions with various leverage levels:
      | Leverage | Size    | Expected Result                           |
      | 0.5x     | 5 USDC  | Position opens with reduced risk         |
      | 1x       | 5 USDC  | Position opens successfully              |
      | 2x       | 5 USDC  | Position opens successfully              |
      | 10x      | 5 USDC  | Position opens if within GMX limits      |
      | 50x      | 5 USDC  | Position opens if within GMX limits      |
      | 100x     | 5 USDC  | Fails if exceeds GMX maximum leverage    |
    Then each position should respect GMX market-specific leverage limits
    And I should receive clear feedback about allowed leverage ranges
    And successful positions should have the requested leverage applied

  @core
  Scenario: Support fractional leverage for risk reduction
    Given I have sufficient balance for conservative trading
    And I want to reduce risk below standard 1x leverage
    When I request to open a position with 0.5x leverage
    Then the position should be created with fractional leverage
    And the position size should be 50% of the collateral amount
    And the liquidation risk should be significantly reduced
    And the system should treat this as a valid risk management strategy

  @core
  Scenario: Compare market order vs limit order behavior (PRD lines 25, 292-294)
    Given I have 20 USDC available balance
    And the current ETH price is 2500 USDC
    When I place a market order to go long 5 USDC with 2x leverage
    Then the order should execute immediately at current market price
    And I should pay market price without control over entry price
    When I place a limit order to go long 5 USDC with 2x leverage at 2450 USDC
    Then the order should be placed in the order book
    And the order should only execute when price reaches my limit
    And I should have price control but no immediate execution guarantee
    And both order types should support the same leverage options

  @integration
  Scenario: Position opening integrates with onchain transaction services
    Given the onchain transaction service is available
    And I have a valid embedded EOA wallet connected
    When I request to open a position
    Then the agent should request transaction construction from the onchain service
    And the agent should receive a properly formatted transaction payload
    And the agent should sign the transaction using the embedded EOA wallet
    And the transaction should be broadcast to Arbitrum One network
    And the position should be confirmed on-chain

  Scenario Outline: Test GMX market operations on test markets
    Given the GMX market "<market>" is available for testing
    And I have sufficient balance for the operation
    When I perform "<operation>" with size "<size>" USDC and leverage "<leverage>"x
    Then the operation should "<result>"
    And GMX constraints should be respected

    Examples:
      | market  | operation    | size | leverage | result           |
      | ETH-USD | open_long    | 3    | 2        | succeed          |
      | BTC-USD | open_short   | 6    | 3        | succeed          |
      | ETH-USD | place_limit  | 4.5  | 5        | place_in_book    |