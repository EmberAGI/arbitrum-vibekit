Feature: MMDT Wallet Migration (Stage 1.4)
  As the perpetuals trading agent
  In order to provide advanced wallet capabilities with delegation
  I want to replace the embedded EOA with MetaMask Delegation Toolkit smart wallet

  Background:
    Given the agent is upgrading to Stage 1.4 with MMDT wallet migration
    And the embedded EOA wallet is being replaced with MetaMask Delegation Toolkit
    And EIP-7702 account abstraction support is required
    And the legacy EOA path must be completely removed

  @core
  Scenario: Replace embedded EOA with MMDT smart wallet
    Given the agent is upgrading from Stage 1.3 to Stage 1.4
    When the wallet system is migrated
    Then the embedded EOA should be completely replaced
    And MetaMask Delegation Toolkit smart wallet should be implemented
    And the new wallet should support smart contract account functionality
    And the legacy EOA path should be removed entirely

  @core
  Scenario: EIP-7702 account abstraction support
    Given the MMDT smart wallet is implemented
    When EIP-7702 functionality is required
    Then the wallet should support EIP-7702 account abstraction
    And account abstraction should enable advanced transaction patterns
    And EIP-7702 should integrate properly with MMDT capabilities
    And backward compatibility should not be required for EOA patterns

  @core
  Scenario: Delegation and caveat authorization support
    Given the MMDT smart wallet is operational
    When delegation functionality is needed
    Then delegation authorization should be supported
    And caveat-based restrictions should be enforceable
    And delegation permissions should be granularly controllable
    And caveats should provide safety controls for automated operations

  @core
  Scenario: EIP-7715 delegated execution support
    Given the agent supports MMDT with delegation capabilities
    When delegated execution is required for transactions
    Then EIP-7715 delegated execution should be supported
    And the delegation should be executed through MMDT where available
    And proper authorization should be verified before execution
    And the delegation should respect all configured caveats

  @core
  Scenario: Legacy EOA path removal
    Given the agent is running Stage 1.4
    When wallet operations are performed
    Then no legacy EOA functionality should be available
    And all wallet operations should use MMDT smart wallet exclusively
    And EOA-specific code paths should be completely removed
    And no fallback to EOA should be possible

  @core
  Scenario: MMDT integration with transaction signing
    Given the MMDT smart wallet is configured
    When transaction signing is required
    Then transactions should be signed using MMDT capabilities
    And smart contract wallet patterns should be used
    And delegation should be applied where appropriate
    And caveat validation should occur before signing

  @error-handling
  Scenario: Handle MMDT wallet initialization failures
    Given the agent is starting with MMDT wallet configuration
    When MMDT wallet initialization fails
    Then the agent should fail to start gracefully
    And appropriate error messages should indicate the MMDT issue
    And no fallback to EOA should be attempted
    And guidance should be provided for resolving MMDT setup issues

  @error-handling
  Scenario: Handle delegation caveat violations
    Given the wallet has delegation configured with spending limits
    When a transaction is requested that exceeds delegation limits
    Then the caveat system should reject the transaction
    And the rejection should be reported with specific caveat violations
    And the transaction should not be signed or broadcast
    And the violation should be logged for audit purposes

  @error-handling
  Scenario: Handle EIP-7702 compatibility issues
    Given the wallet uses EIP-7702 account abstraction
    When EIP-7702 features encounter compatibility issues
    Then appropriate error handling should occur
    And fallback mechanisms should be available where possible
    And compatibility issues should be clearly reported
    And system stability should be maintained

  @edge-case
  Scenario: Handle delegation with complex caveat combinations
    Given the wallet has multiple overlapping caveats configured
    When transactions are evaluated against complex caveat rules
    Then all applicable caveats should be evaluated correctly
    And the most restrictive caveats should take precedence
    And caveat evaluation should be efficient and deterministic
    And complex rule interactions should be handled correctly

  @edge-case
  Scenario: Handle MMDT wallet under network stress
    Given the MMDT smart wallet relies on network connectivity
    When network conditions are poor or intermittent
    Then wallet operations should handle network stress gracefully
    And appropriate timeouts should be configured
    And retry mechanisms should be intelligent
    And user experience should degrade gracefully

  @integration
  Scenario: MMDT wallet integrates with Onchain Actions workflow
    Given the agent uses MMDT wallet for transaction signing
    When Onchain Actions provides transaction payloads
    Then MMDT should sign transactions following the same security model
    And transaction construction should work with smart contract wallets
    And delegation should be applied to Onchain Actions transactions
    And the integration should maintain the established security patterns

  @integration
  Scenario: MMDT wallet integrates with MCP facade security
    Given the MCP facade protects wallet operations
    When MMDT wallet operations are requested through MCP
    Then the facade should continue to protect sensitive operations
    And delegation and caveats should be enforced through the facade
    And MMDT-specific operations should be properly abstracted
    And the security model should be enhanced, not weakened

  @integration
  Scenario: Delegation caveats integrate with existing error taxonomy
    Given the normalized error taxonomy from Stage 1.2 is established
    When delegation caveat violations occur
    Then errors should follow the established taxonomy format
    And caveat-specific error codes should be included
    And retryable vs non-retryable should be properly categorized
    And diagnostic information should include caveat details

  Scenario Outline: Test delegation caveat enforcement
    Given the wallet has delegation configured with "<caveat_type>"
    When a transaction is requested that "<transaction_characteristic>"
    Then the delegation system should "<delegation_action>"
    And the result should be "<expected_result>"

    Examples:
      | caveat_type        | transaction_characteristic | delegation_action | expected_result        |
      | spending_limit     | exceeds spending limit     | reject           | caveat violation error  |
      | time_restriction   | outside allowed hours      | reject           | time restriction error  |
      | contract_whitelist | targets allowed contract   | approve          | transaction signed      |
      | gas_limit         | within gas allowance       | approve          | transaction signed      |

  Scenario Outline: Test MMDT wallet operations
    Given the MMDT smart wallet is configured for "<wallet_feature>"
    When wallet operations require "<operation_type>"
    Then the operation should use "<mmdt_mechanism>"
    And the result should be "<expected_outcome>"

    Examples:
      | wallet_feature    | operation_type      | mmdt_mechanism    | expected_outcome |
      | EIP-7702         | account_abstraction | smart_contract    | success          |
      | delegation       | restricted_signing  | caveat_validation | conditional      |
      | EIP-7715         | delegated_execution | mmdt_delegation   | success          |