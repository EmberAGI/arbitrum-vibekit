Feature: Error Handling and Observability (Stage 1.2)
  As the perpetuals trading agent
  In order to provide reliable operation with normalized error taxonomy
  I want comprehensive error handling and basic observability features

  Background:
    Given the agent is upgraded to Stage 1.2 with enhanced error handling
    And error taxonomy normalization is implemented
    And OpenTelemetry is integrated for basic traces/metrics/logs

  @core
  Scenario: Normalized error taxonomy implementation
    Given an error occurs in any system component
    When the error is returned to clients
    Then the error should follow the normalized taxonomy format:
      """
      {
        "code": "<string|int>",
        "message": "<human readable message>",
        "retryable": <boolean>,
        "details": { <additional context> },
        "diagnostics": { <optional debugging info> }
      }
      """
    And the format should be consistent across JSON-RPC, SSE, and MCP interfaces
    And the taxonomy should be applied to both HTTP (SSE) and STDIO (NDJSON) streaming

  @core
  Scenario: Error categorization and retry hints
    Given different types of errors occur during operation
    When errors are classified by the system
    Then network errors should be marked as retryable
    And validation errors should be marked as non-retryable
    And temporary service unavailability should be marked as retryable
    And retry hints like "retryAfterMs" and "transient: true" should be included
    And facade error mapping should normalize upstream errors

  @core
  Scenario: Secrets hygiene in error messages and logs
    Given the agent handles sensitive information like private keys
    When errors occur that might contain sensitive data
    Then secrets should never appear in error messages
    And secrets should never be written to logs or artifacts
    And secrets should never be sent via SSE events
    And error diagnostics should be sanitized of sensitive information
    And secrets should remain only in top-level .env (Stage 1.2)

  @core
  Scenario: OpenTelemetry integration for basic traces/metrics/logs
    Given OpenTelemetry is integrated where simple to integrate
    When operations are performed with server-generated contextId "ctx-trace-test" and taskId "task-trace-123"
    Then traces should be generated for the operations
    And traces should include contextId and taskId as attributes
    And trace spans should represent logical operation boundaries
    And distributed tracing should work across internal service calls

  @core
  Scenario: Basic metrics collection for operational monitoring
    Given the agent is processing requests and tasks
    When various operations complete or fail
    Then minimal metrics should be collected including:
      | Metric Type     | Examples                                    |
      | Request counts  | Total requests per method                   |
      | Success rates   | Percentage of successful operations         |
      | Error rates     | Percentage of failed operations by type     |
      | Stream duration | Time SSE streams remain active              |
    And metrics should be sufficient for triage but not full telemetry

  @core
  Scenario: Error taxonomy applied to streaming events
    Given streaming is available over both SSE and STDIO transports
    When errors occur during streaming
    Then streaming errors should use "task.failed" with normalized taxonomy
    And SSE streaming should include normalized error fields
    And STDIO streaming should emit NDJSON with identical error structure
    And error fields should include retryable and optional diagnostics

  @error-handling
  Scenario: Handle Onchain Actions MCP server connection failures
    Given the Onchain Actions MCP server at https://api.emberai.xyz/mcp is unavailable
    When the agent attempts to perform onchain operations
    Then the error should be classified as "service_unavailable"
    And the error should be marked as retryable
    And appropriate diagnostic information should be included
    And retry guidance should be provided to clients

  @error-handling
  Scenario: Handle blockchain RPC endpoint failures
    Given the Arbitrum RPC endpoint becomes unresponsive
    When blockchain operations are attempted
    Then errors should be classified as "network_error"
    And the errors should be marked as retryable
    And fallback RPC endpoints should be attempted if configured
    And the failure should be traced with proper contextId/taskId context

  @error-handling
  Scenario: Handle Vibekit routing errors
    Given the router encounters errors during skill selection
    When routing failures occur
    Then errors should be normalized to the standard taxonomy
    And routing misses should be logged for continuous tuning
    And the error should indicate if clarification is needed
    And fallback routing should be attempted if configured

  @integration
  Scenario: Error taxonomy integration across all transport layers
    Given errors occur in components that serve multiple transport protocols
    When the same error needs to be communicated via HTTP, SSE, STDIO, and MCP
    Then the error structure should be consistent across all transports
    And transport-specific formatting should be applied without changing semantics
    And error correlation should be maintained across all channels

  @integration
  Scenario: Observability integration with Stage 1.2 features
    Given Stage 1.2 introduces Vibekit routing and configuration externalization
    When routing decisions are made and configurations are loaded
    Then routing performance should be tracked with basic metrics
    And configuration validation errors should be traced appropriately
    And contextId and taskId should be included in all relevant traces
    And the observability should support triage of Stage 1.2 specific issues

  Scenario Outline: Test error taxonomy for different error types
    Given an error of type "<error_category>" occurs
    When the error is "<specific_error>"
    Then the normalized error should have code "<expected_code>"
    And retryable should be "<is_retryable>"
    And the error should include appropriate diagnostic information

    Examples:
      | error_category    | specific_error              | expected_code         | is_retryable |
      | network           | connection_timeout          | network_error         | true         |
      | validation        | invalid_parameter_format    | invalid_request       | false        |
      | business_logic    | insufficient_balance        | insufficient_funds    | false        |
      | external_service  | onchain_actions_unavailable | service_unavailable   | true         |
      | routing           | skill_selection_failed      | routing_error         | true         |