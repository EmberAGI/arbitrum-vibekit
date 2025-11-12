Feature: Blockchain Transaction Lifecycle (Stage 1.1)
  As a trading system operator
  In order to ensure transparent, auditable, and secure transaction execution
  I want the system to maintain comprehensive transaction artifacts and proper lifecycle management

  Background:
    # Technical details: system implements four-artifact pattern, multi-turn workflows, and proper event ordering
    Given the trading system supports blockchain transaction workflows
    And the system provides comprehensive transaction tracking and reporting
    And the system uses multi-turn patterns for secure transaction signing
    And the system delivers transaction information in the proper order

  @core
  Scenario: Complete transaction lifecycle - happy path (PRD lines 296-384)
    Given the system receives a request to execute a blockchain transaction "send 1 USDC to 0x123..."
    When the transaction lifecycle is initiated
    Then the system should execute the complete lifecycle as follows:
      | Turn | Step | Actor  | Action                                        | Expected Result                     |
      | A    | 1    | Agent  | Begin working on transaction                  | Status: "working"                   |
      | A    | 2    | Agent  | Generate tx-summary.json artifact           | Human+machine readable preview      |
      | A    | 3    | Agent  | Prepare unsigned transaction payload          | Continue working state              |
      | B    | 4    | Agent  | Generate unsigned-tx artifact               | Payload ready for signing           |
      | B    | 5    | Agent  | Pause for signature (input-required)        | Task paused, final:true ends stream |
      | C    | 6    | Client | Provide signature via structured DataPart    | Resume workflow execution           |
      | D    | 7    | Agent  | Broadcast transaction and begin monitoring    | Status: "working"                   |
      | D    | 8    | Agent  | Generate tx-status.jsonl with progress      | Append-only timeline logging        |
      | E    | 9    | Agent  | Generate tx-receipt.json on completion      | Final immutable receipt             |
      | E    | 10   | Agent  | Complete transaction workflow                | Status: "completed", final:true     |

  @core
  Scenario: Turn A - Transaction initiation and preview generation (PRD lines 302-316)
    Given the system receives a request to send 1 USDC to address 0x742d35Cc6634C0532925a3b8D63065A2e2F8B8B
    When the system processes the transaction request
    Then I should observe the system start working on the transaction
    And I may receive an optional status update indicating work has begun
    And I should receive a transaction summary with:
      | Information Type        | Content                                     |
      | Transaction Intent      | Human-readable transaction description      |
      | Decoded Operations      | Method name and parameters                  |
      | Fee Estimates          | Gas price and limit estimates              |
      | Warnings               | Any relevant warnings or notices           |
    And I should be able to review the transaction details before signing
    And the system should continue preparing the transaction for signing

  @core
  Scenario: Turn B - Signature request with proper information delivery (PRD lines 317-328)
    Given the system has prepared a transaction for signing
    When the system is ready to request my signature
    Then I should receive the following information in this exact order:
      | Order | Information Type         | Content                                    |
      | 1     | Transaction to Sign      | Complete transaction data for signing      |
      | 2     | Signature Request        | Request for my signature with clear status |
    And the transaction signing information should include:
      | Information              | Content                                      |
      | Transaction Data         | The complete transaction payload to sign     |
      | Signing Instructions     | Clear instructions on what I need to do     |
      | Context Information      | Chain ID, expected hash, and other details  |
    And the signature request should clearly indicate:
      | Request Element             | Content                              |
      | Current State              | Waiting for my signature             |
      | Required Action            | What signature I need to provide     |
      | Additional Context         | Any helpful signing context         |
    And I should receive all transaction data before the signature request

  @core
  Scenario: Turn C - User signature provision (PRD lines 329-336)
    Given the system has paused a transaction waiting for my signature
    And I have received the complete transaction information
    When I sign the transaction and provide the signature
    Then I should send the signature information including:
      | Signature Information   | Content                                    |
      | Task Reference         | Reference to the paused transaction       |
      | Signed Transaction     | Complete signed transaction data          |
      | Transaction Hash       | Hash of the signed transaction            |
    And the system should resume the transaction processing once I provide the signature
    And the system should validate my signature before proceeding

  @core
  Scenario: Turn D - Transaction submission and monitoring (PRD lines 337-352)
    Given I have provided a valid signature
    When the system resumes transaction execution
    Then I should observe the system begin monitoring the transaction
    And I should receive status updates indicating the system is working
    And I should observe the system broadcast the signed transaction
    And I should receive ongoing transaction progress updates including:
      | Progress Information    | Content                                      |
      | Submission Status      | Confirmation that transaction was submitted   |
      | Blockchain Status      | Current status on the blockchain            |
      | Confirmation Progress  | Number of confirmations received            |
    And the initial progress should show:
      - Transaction submitted with hash
      - Transaction pending in mempool
    And I should receive additional progress updates as confirmations accumulate
    And I should be able to track the transaction status visually

  @core
  Scenario: Turn E - Transaction completion with final receipt (PRD lines 353-363)
    Given the transaction has been confirmed on-chain
    When the system detects sufficient confirmations
    Then I should receive final transaction details including:
      | Final Information        | Content                                    |
      | Transaction Receipt      | Complete receipt from blockchain           |
      | Event Logs              | All events generated by the transaction   |
      | Actual Gas Cost         | Final gas price and amount used           |
      | Block Information       | Block hash and number containing transaction |
    And I may receive a final progress update
    And I should observe the transaction marked as completed
    And I may receive a human-readable summary of the transaction outcome
    And I should be able to retrieve all transaction information for my records

  @core
  Scenario: Complete transaction information and tracking (PRD lines 370-377)
    Given the system has executed a complete transaction lifecycle
    When I examine the information the system provided
    Then I should have received exactly these four types of information:
      | Information Type     | Purpose                              |
      | Transaction Summary  | Early preview for review            |
      | Signing Information  | Complete data for signature        |
      | Progress Timeline    | Ongoing status updates              |
      | Final Receipt        | Complete final transaction result   |
    And information should be consistently categorized
    And information should be versioned when updated
    And progress information should build chronologically

  @core
  Scenario: Transaction integrity verification (PRD lines 378-383)
    Given the system is preparing transaction information
    When the system provides transaction summary information
    Then I should receive a verification hash for the transaction
    And the hash should represent the exact transaction to be signed
    And I should be able to verify the signing data matches the preview
    And I should receive clear instructions and requirements
    And detailed binary data should be provided separately from instructions

  @error-handling
  Scenario: Transaction failure during broadcast (PRD lines 364-369)
    Given the system attempts to broadcast a signed transaction
    When the broadcast fails due to network or validation error
    Then I should receive progress updates indicating the failure
    And I should receive detailed error information
    And I should observe the transaction marked as failed for terminal failures
    Or I should be asked to provide adjustments if the error is recoverable (e.g., higher fees)

  @error-handling
  Scenario: Transaction revert on-chain
    Given the system has broadcast a transaction successfully
    When the transaction is included in a block but reverts
    Then I should receive progress updates showing:
      - Initial confirmation in a block
      - Subsequent revert notification with reason
    And I should receive final receipt information including the revert status and reason
    And I should observe the transaction marked as failed
    And I should receive diagnostic information about why the transaction reverted

  @error-handling
  Scenario: Invalid signature validation
    Given the system has a transaction paused for signature
    When the client provides an invalid or malformed signature
    Then the workflow generator performs validation internally
    And the generator updates task state based on validation result
    And if validation fails, the task remains in "input-required" state
    And the generator provides an error message to the client
    And the client should be able to retry with a corrected signature
    And the system should not attempt broadcast with invalid signatures

  @error-handling
  Scenario: Gas estimation failures
    Given the system is preparing a transaction
    When gas estimation fails due to network issues or contract errors
    Then the system should handle the failure gracefully
    And the system should transition the task to "failed" state if unrecoverable
    And the system should provide appropriate error information
    And the system should indicate if retry would be beneficial

  @edge-case
  Scenario: Network congestion and delayed confirmations
    Given the system has broadcast a transaction during network congestion
    When confirmations are delayed beyond normal timeframes
    Then I should continue to receive status updates indicating:
      - Transaction still pending
      - Reason for delay when known (network congestion)
    And the system should continue waiting for confirmations without timing out prematurely
    And I should be informed about the cause of delays when the system can determine it

  @edge-case
  Scenario: Chain reorganization handling
    Given a transaction the system broadcast has received confirmations
    When a chain reorganization occurs affecting the transaction
    Then I should receive status updates indicating:
      - Initial confirmations in original block
      - Chain reorganization detected
      - Re-confirmation in the new canonical block
    And the system should wait for re-confirmation after reorganization
    And I should receive final transaction information reflecting the final confirmed block

  @edge-case
  Scenario: Transaction replacement scenarios
    Given the system has a transaction with low gas price that is stuck
    When the system detects the transaction is likely to be replaced
    Then the system should provide guidance on transaction replacement options
    And if replacement is chosen, the system should begin a new transaction lifecycle
    And the system should mark the original transaction as replaced in tx-status.jsonl
    And the system should maintain proper linkage between original and replacement transactions

  @integration
  Scenario: Transaction lifecycle integration with workflow plugin system
    Given the system has a workflow that includes blockchain transactions
    When the workflow reaches the transaction step
    Then the system should integrate the transaction lifecycle seamlessly with workflow execution
    And the system should handle workflow pause/resume correctly during signature requests
    And the system should properly associate transaction artifacts with the workflow task
    And the system should wait for transaction confirmation before completing the workflow

  @integration
  Scenario: Transaction lifecycle integration with A2A streaming
    Given the system has a transaction executing through the complete lifecycle
    When transaction events occur
    Then the system should properly deliver all events via A2A SSE streaming
    And the system should maintain event ordering throughout the lifecycle
    And clients should be able to resume streams after network interruptions
    And the system should make all artifacts available via a2a:// URIs

  @integration
  Scenario: Multi-transaction workflow coordination
    Given the system has a workflow that requires multiple sequential transactions
    When each transaction goes through its lifecycle
    Then the system should properly sequence and coordinate transactions
    And the system should ensure each transaction has its own complete artifact set
    And the system should maintain workflow state across transaction boundaries
    And the system should properly handle the overall workflow state if one transaction fails

  Scenario Outline: Transaction lifecycle for different operation types
    Given the system receives a request to execute a "<operation_type>" transaction
    When the system executes the complete transaction lifecycle
    Then I should receive transaction summary information appropriate for "<operation_type>"
    And I should receive properly formatted signing information for the operation
    And I should receive progress tracking covering all stages relevant to "<operation_type>"
    And I should receive final results specific to the "<operation_type>" operation

    Examples:
      | operation_type           |
      | USDC_transfer           |
      | GMX_position_open       |
      | GMX_position_close      |
      | vault_deposit           |
      | vault_withdrawal        |

  Scenario Outline: Transaction status progression tracking
    Given the system has a transaction in "<current_stage>" stage
    When the transaction progresses to the next stage
    Then I should receive progress updates indicating "<next_stage>" status
    And I should receive relevant information for this stage in the progression
    And I should observe accurate timing information for each stage transition

    Examples:
      | current_stage | next_stage  |
      | submitted     | pending     |
      | pending       | confirmed   |
      | confirmed     | finalized   |