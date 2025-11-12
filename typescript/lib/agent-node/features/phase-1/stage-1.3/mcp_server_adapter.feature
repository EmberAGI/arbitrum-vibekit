Feature: MCP Server and Adapter (Stage 1.3)
  As the perpetuals trading agent
  In order to provide MCP server capabilities with A2A method adapters
  I want to expose MCP tools that adapt A2A JSON-RPC methods

  Background:
    Given the agent is upgraded to Stage 1.3 with MCP server capabilities
    And the agent did not expose MCP server functionality in previous stages
    And MCP adapter provides one tool per A2A method within a single MCP server
    And MCP tools are limited to A2A methods only (not per-skill tools)

  @core
  Scenario: MCP server exposure begins in Stage 1.3
    Given the agent is running Stage 1.3
    When MCP clients attempt to connect to the agent
    Then the agent should expose an MCP server interface
    And the MCP server should be available for client connections
    And the agent should support both STDIO and HTTP transports for MCP
    And the agent should not have exposed MCP server in Stage 1.1 or 1.2

  @core
  Scenario: MCP adapter exposes one tool per A2A method
    Given the MCP server is running in Stage 1.3
    When an MCP client discovers available tools
    Then the agent should expose exactly one MCP tool per A2A method
    And the available tools should include:
      | MCP Tool Name | A2A Method Mapped | Purpose |
      | message_send  | message/send      | Send messages and create tasks |
      | message_stream| message/stream    | Stream task progress |
      | tasks_get     | tasks/get         | Retrieve task information |
      | tasks_cancel  | tasks/cancel      | Cancel running tasks |
      | health        | health            | Check agent health |
    And no per-skill MCP tools should be exposed

  @core
  Scenario: MCP tools adapt A2A JSON-RPC methods
    Given an MCP client is connected to the agent
    When the client calls an MCP tool like "message_send"
    Then the tool should internally invoke the corresponding A2A method "message/send"
    And parameter translation should occur between MCP and A2A formats
    And response formatting should adapt A2A responses to MCP tool response format
    And error handling should use the normalized taxonomy established in Stage 1.2

  @core
  Scenario: STDIO transport for MCP server
    Given the agent supports STDIO transport for MCP
    When an MCP client connects via STDIO
    Then the agent should emit NDJSON events mirroring SSE semantics
    And heartbeat events should be formatted as: {"type": "heartbeat", "data": {}}
    And task events should include proper type, data, and ID fields
    And streaming semantics should be identical to A2A SSE but in NDJSON format

  @core
  Scenario: HTTP streaming transport for MCP server
    Given the agent supports HTTP transport with SSE for MCP
    When an MCP client connects via HTTP
    Then streaming should mirror A2A SSE semantics exactly
    And event types and payload shapes should be identical to A2A SSE
    And resume hints should be communicated via event IDs
    And the connection should support proper reconnection

  @core
  Scenario: MCP transport parity with A2A streaming
    Given both STDIO and HTTP transports are available for MCP
    When streaming events occur
    Then STDIO should emit NDJSON events mirroring A2A SSE semantics
    And HTTP should use SSE events identical to A2A SSE
    And both transports should support the same event types: task.delta, task.completed, task.failed, task.canceled, heartbeat
    And error and cancellation events should follow unified taxonomy across transports

  @core
  Scenario: MCP cancellation semantics support
    Given MCP clients can send cancellation requests
    When an MCP client cancels an in-flight request
    Then the agent should support MCP cancellation semantics
    And the cancellation should propagate to the underlying A2A task
    And the corresponding A2A task should transition to "canceled" state
    And proper cleanup should occur for any allocated resources

  @error-handling
  Scenario: Handle MCP tool calls with invalid parameters
    Given an external MCP client is connected
    When the client attempts to call a tool with invalid parameters
    Then the MCP adapter should validate the request
    And return a proper MCP error response
    And the error should follow the normalized taxonomy from Stage 1.2
    And no side effects should occur with invalid requests

  @error-handling
  Scenario: Handle MCP transport failures
    Given MCP clients are connected via various transports
    When transport-level failures occur (connection drops, protocol errors)
    Then the agent should handle transport failures gracefully
    And reconnection should be supported where applicable
    And streaming resume should work correctly after reconnection
    And error reporting should be consistent across transports

  @edge-case
  Scenario: Handle concurrent MCP and A2A clients
    Given both MCP and A2A clients are accessing the agent simultaneously
    When operations are performed through both interfaces
    Then both interfaces should operate correctly without interference
    And resource sharing should be managed appropriately
    And performance should not be significantly degraded by multiple interface types
    And session isolation should be maintained between interface types

  @edge-case
  Scenario: Handle MCP transport switching
    Given the agent supports both STDIO and HTTP transports for MCP
    When a client needs to switch from one transport to another
    Then session continuity should be maintained via proper identification
    And streaming semantics should remain consistent across transports
    And event formatting should adapt to the transport without data loss

  @integration
  Scenario: MCP adapter integrates with existing A2A functionality
    Given the agent has established A2A functionality from Stages 1.1-1.2
    When MCP tools are invoked
    Then they should leverage all existing A2A capabilities
    And no functionality should be duplicated between MCP and A2A interfaces
    And MCP should be a true adapter layer over A2A methods
    And all A2A features should remain available through the MCP interface

  @integration
  Scenario: MCP server integrates with normalized error taxonomy
    Given Stage 1.2 established normalized error taxonomy
    When MCP operations encounter errors
    Then MCP responses should use the same normalized error structure
    And error codes, retryable flags, and diagnostics should be consistent
    And MCP error responses should follow the established taxonomy
    And error correlation should work across MCP and A2A interfaces

  Scenario Outline: Test MCP tool adapter for each A2A method
    Given the MCP server is running in Stage 1.3
    When an MCP client calls the "<mcp_tool>" tool
    Then it should map to the A2A "<a2a_method>" method
    And the parameters should be properly translated
    And the response should follow MCP tool response format
    And error handling should use normalized taxonomy

    Examples:
      | mcp_tool      | a2a_method     |
      | message_send  | message/send   |
      | message_stream| message/stream |
      | tasks_get     | tasks/get      |
      | tasks_cancel  | tasks/cancel   |
      | health        | health         |

  Scenario Outline: Test MCP transport event formatting
    Given the agent supports "<transport>" transport
    When streaming events of type "<event_type>" occur
    Then the format should match the expected transport format
    And all required fields should be present
    And the semantics should be identical to A2A SSE

    Examples:
      | transport | event_type      |
      | STDIO     | task.delta      |
      | STDIO     | task.completed  |
      | STDIO     | heartbeat       |
      | HTTP      | task.delta      |
      | HTTP      | task.completed  |
      | HTTP      | heartbeat       |