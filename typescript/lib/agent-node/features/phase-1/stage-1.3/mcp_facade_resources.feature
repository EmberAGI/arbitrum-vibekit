Feature: MCP Facade and Resources (Stage 1.3)
  As the perpetuals trading agent
  In order to provide secure MCP tool interfaces and resource management
  I want a flexible MCP facade that protects side effects and exposes task artifacts as resources

  Background:
    Given the agent is running Stage 1.3 with MCP facade capabilities
    And the MCP facade protects keys and side effects from direct LLM access
    And task artifacts and logs are exposed as MCP resources
    And MCP elicitation bridge is available for user input handling

  @core
  Scenario: Flexible MCP facade for custom tool interfaces
    Given the agent has a flexible MCP facade
    When external MCP clients request operations
    Then the facade should expose custom tool interfaces
    And the internal orchestration should map to underlying MCP tools
    And wallet and side-effecting actions should go through the facade
    And the LLM should not manage side effects or keys directly

  @core
  Scenario: MCP facade protects wallet operations and keys
    Given the agent has wallet operations that involve sensitive keys
    When MCP clients request wallet-related operations
    Then all wallet operations should go through the MCP facade
    And private keys should never be accessible to external MCP clients
    And only validated operations should reach the actual wallet
    And transaction signing should require proper authorization
    And keys and side effects should remain behind the facade

  @core
  Scenario: Task artifacts exposed as MCP resources
    Given the agent has completed tasks with artifacts
    When MCP clients request resource access
    Then task artifacts should be exposed as MCP resources
    And resources should use the format: resources/tasks/{taskId}/artifacts/{artifactId}
    And log resources should be available as: resources/tasks/{taskId}/logs
    And resource metadata should include artifact kind and access information

  @core
  Scenario: MCP resource subscriptions for real-time updates
    Given task artifacts and logs are exposed as MCP resources
    When MCP clients want real-time updates
    Then resource subscriptions should be supported
    And clients should receive updates when artifacts or logs are modified
    And subscription management should handle client connections and disconnections
    And update delivery should be efficient and reliable

  @core
  Scenario: Tasks mapped to MCP resources
    Given tasks generate artifacts and logs during execution
    When tasks are created and executed
    Then task artifacts should be automatically mapped to MCP resources
    And resource URIs should follow the stable a2a:// format internally
    And MCP resource access should provide the same data available via a2a:// URIs
    And resource access should be available from Stage 1.3 onward

  @core
  Scenario: MCP elicitation bridge for input-required tasks
    Given a task requires user input and transitions to "input-required" state
    When the MCP elicitation bridge is triggered
    Then an MCP elicitation should be issued with the required JSON schema
    And the elicitation should specify exactly what input is needed
    When the user provides a response through the MCP client
    Then the response should resume the same taskId
    And task execution should continue streaming normally

  @core
  Scenario: MCP prompts, resources, and completions passthrough
    Given the agent has internal MCP prompts, resources, elicitations, and completions
    When these internal MCP operations occur
    Then they should be passthrough-by-default to human
    And allow/deny configuration should control the passthrough behavior
    And humans should have visibility into internal MCP operations
    And configuration should allow fine-grained control over what gets passed through

  @core
  Scenario: Secrets management through MCP in Stage 1.3
    Given the agent is in Stage 1.3 with MCP facade
    When secrets and configuration are needed
    Then secrets should be injected via MCP secrets/config
    And secrets should remain redacted from all outputs
    And secrets should not appear in logs, artifacts, SSE events, or MCP responses
    And MCP secrets/config should replace direct .env access for sensitive data

  @error-handling
  Scenario: Handle MCP resource access errors
    Given task artifacts are exposed as MCP resources
    When a client requests a non-existent resource
    Then the agent should return a "resource not found" error
    And the error should be properly formatted for MCP
    And no sensitive information should be leaked in error messages
    And the error should follow the normalized taxonomy from Stage 1.2

  @error-handling
  Scenario: Handle MCP facade validation errors
    Given the MCP facade validates operations before execution
    When invalid operations are submitted through the facade
    Then validation should fail with specific error details
    And the facade should reject operations that would expose sensitive data
    And the error should indicate what validation failed
    And no side effects should occur for validation failures

  @error-handling
  Scenario: Handle MCP elicitation failures
    Given a task is input-required through MCP elicitation
    When the elicitation process fails or times out
    Then the task should handle the elicitation failure gracefully
    And appropriate error messages should be returned to the client
    And the task should not remain indefinitely in input-required state
    And fallback mechanisms should be available for elicitation failures

  @edge-case
  Scenario: Handle MCP resource subscriptions with high update frequency
    Given a client has subscribed to real-time position updates
    When positions are updated frequently due to market volatility
    Then subscription updates should be delivered efficiently
    And the system should handle backpressure appropriately
    And clients should not be overwhelmed with excessive updates
    And critical updates should be prioritized over minor changes

  @edge-case
  Scenario: Handle concurrent MCP clients accessing same resources
    Given multiple MCP clients are connected
    When they access the same task artifacts simultaneously
    Then each client should receive consistent data
    And resource access should be thread-safe
    And updates should be delivered to all subscribed clients
    And no client should receive corrupted or partial data

  @integration
  Scenario: MCP facade integrates with wallet security model
    Given the agent uses a wallet for transaction signing
    When MCP clients request wallet operations through the facade
    Then all operations should go through the security facade
    And the facade should validate operations against any configured policies
    And private keys should never be exposed to MCP clients
    And only validated transaction payloads should be signed
    And the facade should enforce the same security model as direct A2A access

  @integration
  Scenario: MCP resources integrate with A2A streaming
    Given both MCP and A2A clients are consuming task updates
    When a task generates new artifacts or log entries
    Then MCP resource subscribers should receive updates
    And A2A SSE streams should receive corresponding task.delta events
    And both channels should maintain consistency
    And timestamps and event ordering should be synchronized

  @integration
  Scenario: Facade error mapping integrates with normalized taxonomy
    Given the MCP facade encounters errors from underlying systems
    When errors need to be returned to MCP clients
    Then errors should be normalized to the standard taxonomy from Stage 1.2
    And upstream error details should be preserved in diagnostics
    And retry hints should be mapped appropriately (retryAfterMs, transient)
    And error provenance should be maintained for debugging

  Scenario Outline: Test MCP resource access patterns
    Given task artifacts are exposed as MCP resources
    When a client requests access to "<resource_type>"
    Then the resource should be available at "<expected_path>"
    And the resource should include "<metadata_fields>"
    And access should be "<access_result>"

    Examples:
      | resource_type    | expected_path                           | metadata_fields           | access_result |
      | task_artifact    | resources/tasks/{taskId}/artifacts/{id} | kind, size, timestamp     | granted       |
      | task_logs        | resources/tasks/{taskId}/logs           | entries, timestamps       | granted       |
      | non_existent     | resources/tasks/invalid/artifacts/none  | none                      | not_found     |

  Scenario Outline: Test MCP elicitation bridge scenarios
    Given a task is in "input-required" state
    When elicitation is triggered with "<input_schema>"
    Then the elicitation should "<elicitation_result>"
    And task resumption should be "<resumption_result>"

    Examples:
      | input_schema           | elicitation_result | resumption_result |
      | position_size_schema   | succeed           | continue_normally |
      | invalid_schema         | fail              | remain_awaiting   |
      | timeout_scenario       | timeout           | handle_gracefully |