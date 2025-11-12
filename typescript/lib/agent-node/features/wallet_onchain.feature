Feature: Wallet and Onchain Integration (Stage 1.1)
  As a trading system operator
  In order to ensure secure and reliable blockchain operations
  I want the system to manage wallet operations through secure integration with Onchain Actions

  Background:
    # Technical details: Stage 1.1 uses embedded EOA wallet with viem, private key in .env, Onchain Actions MCP at https://api.emberai.xyz/mcp
    Given the agent is running Stage 1.1 with embedded EOA wallet
    And the system is configured for Arbitrum One (Chain ID 42161)
    And wallet private key is securely stored in environment configuration
    And Onchain Actions MCP server is accessible

  @core
  Scenario: Embedded EOA wallet initialization (Stage 1.1)
    Given the system is in Stage 1.1 with embedded EOA configuration
    When the wallet is initialized from environment configuration
    Then the wallet should have a valid Ethereum address
    And the wallet should be able to sign transactions
    And the private key should be securely stored and never logged
    And the wallet should connect to Arbitrum One network (42161)
    And no separate signing policy should exist in Stage 1.1

  @core
  Scenario: Wallet balance queries through Onchain Actions
    Given the embedded EOA wallet is connected to Arbitrum One
    When the system needs to check the current USDC balance
    Then the system should use Onchain Actions MCP to query the blockchain
    And the balance should be returned in the correct decimal format
    And the query should complete within 5 seconds
    And the result should reflect the actual onchain balance

  @core
  Scenario: Transaction signing from Onchain Actions payloads only
    Given the Onchain Actions MCP server provides a transaction payload
    When the system needs to sign the transaction
    Then the system should validate the payload format
    And the transaction should be signed using the embedded EOA wallet
    And the signature should be cryptographically valid
    And no signing should occur without a valid Onchain Actions payload
    And all signing requests must derive from Onchain Actions outputs

  @core
  Scenario: Transaction broadcasting to blockchain
    Given the system has a signed transaction from Onchain Actions workflow
    When the system broadcasts the transaction to Arbitrum One
    Then the system should use the blockchain client for the broadcast operation
    And the transaction hash should be returned upon successful broadcast
    And the system should wait for transaction confirmation
    And the confirmation status should be properly reported

  @core
  Scenario: GMX market data retrieval through Onchain Actions MCP
    Given the Onchain Actions MCP server is available
    When the system needs to list available GMX markets
    Then the system should call the appropriate MCP tool as a client
    And the response should include supported trading pairs
    And each market should include liquidity and pricing information
    And the ETH-USD market should be available for testing

  @core
  Scenario: Position management exclusively through Onchain Actions
    Given the system needs to manage GMX positions
    When position operations are requested
    Then all GMX actions must be invoked exclusively through Onchain Actions MCP server
    And the system should never construct on-chain transactions directly
    And the system should only sign/broadcast transaction payloads produced by Onchain Actions
    And keys and side effects should remain abstracted from direct manipulation

  @core
  Scenario: Secrets handling in Stage 1.1
    Given the system handles sensitive wallet information
    When operations involve private keys or sensitive data
    Then secrets should be stored only in secure environment configuration
    And secrets should never be written to logs, artifacts, or SSE events
    And all error messages should be sanitized of sensitive information
    And diagnostic information should exclude wallet private data

  @error-handling
  Scenario: Handle RPC endpoint failures
    Given the configured Arbitrum RPC endpoint becomes unavailable
    When the system attempts blockchain operations
    Then the operation should fail with "RPC unavailable" error
    And the error should be marked as retryable
    And appropriate retry logic should be implemented
    And the failure should not expose wallet information

  @error-handling
  Scenario: Handle insufficient gas for transactions
    Given the system has a transaction that requires gas
    And the embedded EOA wallet has insufficient ETH for gas fees
    When the system attempts to broadcast the transaction
    Then the transaction should fail with "Insufficient gas" error
    And the error should indicate the required gas amount
    And the error should be marked as non-retryable until funding
    And no transaction should be broadcast to the network

  @error-handling
  Scenario: Handle invalid transaction payloads from Onchain Actions
    Given the Onchain Actions server provides a malformed transaction payload
    When the system attempts to sign the transaction
    Then the payload validation should fail
    And the system should reject the signing request
    And an error should be returned indicating payload validation failure
    And no signature should be generated for invalid payloads

  @edge-case
  Scenario: Handle wallet with minimum viable balance
    Given the embedded EOA wallet has exactly the minimum required balance for a transaction
    When the system attempts to execute the transaction
    Then the system should calculate precise gas requirements
    And the transaction should succeed if funds are exactly sufficient
    And the remaining balance should be zero after successful execution
    And dust amounts should be handled appropriately

  @integration
  Scenario: End-to-end onchain position opening workflow (Stage 1.1)
    Given a position opening request is received through the complete Stage 1.1 workflow
    When the position opening process is initiated
    Then the workflow should proceed as follows:
      | Step | Component           | Action                                    |
      | 1    | System             | Receive position request                   |
      | 2    | Onchain Actions    | Request transaction construction via MCP   |
      | 3    | Onchain Actions    | Return validated transaction payload       |
      | 4    | Embedded EOA       | Sign the transaction securely             |
      | 5    | Blockchain Client  | Broadcast transaction to Arbitrum         |
      | 6    | Blockchain         | Confirm transaction inclusion             |
      | 7    | System             | Update position status and notify user    |

  @integration
  Scenario: Wallet security with embedded EOA (Stage 1.1)
    Given the embedded EOA wallet contains sensitive private key material
    When wallet operations are performed
    Then private keys should be accessed only through secure interfaces
    And no external interfaces should have direct key access
    And transaction signing should require proper authorization from Onchain Actions
    And all wallet operations should be logged without exposing sensitive data

  Scenario Outline: Test embedded EOA operations on Arbitrum One
    Given the embedded EOA wallet is connected to Arbitrum One
    When performing "<operation>"
    Then the operation should target Arbitrum One network (chain ID 42161)
    And the operation should complete within "<timeout>" seconds
    And gas estimation should be appropriate for Arbitrum One

    Examples:
      | operation          | timeout |
      | Balance query      | 5       |
      | Transaction send   | 30      |
      | Position query     | 10      |
      | Market data fetch  | 10      |