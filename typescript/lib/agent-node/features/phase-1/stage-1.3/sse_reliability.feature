Feature: SSE Reliability and Streaming (Stage 1.3)
  As a client of the perpetuals trading agent
  In order to receive reliable real-time updates
  I want SSE streaming with heartbeats, resume capabilities, and reliable delivery

  Background:
    Given the agent is running Stage 1.3 with enhanced SSE reliability
    And SSE streaming includes heartbeats and resume capabilities
    And clients can resume streams after transient network glitches

  @core
  Scenario: SSE streaming with reliable heartbeats
    Given I have an active SSE stream for task updates
    When the stream is maintained over time
    Then I should receive heartbeat events every 25 seconds (±5s jitter allowed)
    And heartbeats should be formatted as `event: heartbeat` with `data: {}`
    And heartbeats should help detect connection health
    And heartbeats should guide client reconnect behavior

  @core
  Scenario: SSE stream resumption after network interruption
    Given I have an active SSE stream receiving task updates
    And I have received events with monotonic IDs
    When the network connection is temporarily interrupted
    Then I should be able to reconnect using the Last-Event-ID header
    And I should resume receiving events from where I left off
    And no events should be lost during the reconnection
    And the server should honor the Last-Event-ID when feasible

  @core
  Scenario: SSE stream resumption via tasks/get fallback
    Given I had an SSE stream that was interrupted
    And the server cannot resume from Last-Event-ID
    When I attempt to resume the stream
    Then the client should fall back to using tasks/get method
    And the client should be able to catch up on missed events
    And the resumption should be seamless from the client perspective
    And the fallback should work even if event ID resumption fails

  @core
  Scenario: SSE event format with resumption support
    Given I have an active SSE stream
    When events are sent
    Then every event should include an `id:` field with monotonic ID
    And the `retry: 5000` directive should be sent once at stream start
    And event format should support client reconnect delay guidance
    And monotonic IDs should enable proper event ordering and resumption

  @core
  Scenario: SSE response headers for reliable streaming
    Given I initiate an SSE connection
    When the connection is established
    Then response headers should include:
      | Header | Value |
      | Content-Type | text/event-stream |
      | Cache-Control | no-cache |
      | Connection | keep-alive |
    And headers should be appropriate for long-lived streaming connections
    And headers should support proper client caching behavior

  @core
  Scenario: Heartbeat jitter for connection distribution
    Given multiple clients are connected with SSE streams
    When heartbeats are sent
    Then heartbeat timing should include ±5s jitter
    And jitter should distribute connection maintenance across time
    And heartbeat distribution should prevent connection storms
    And base interval should remain 25 seconds

  @error-handling
  Scenario: Handle SSE connection failures with graceful recovery
    Given I have an SSE stream that encounters connection issues
    When various connection failures occur
    Then the client should be guided to reconnect with appropriate delay
    And the `retry: 5000` directive should inform reconnection timing
    And connection failures should not crash or corrupt the stream state
    And graceful recovery should be possible for transient failures

  @error-handling
  Scenario: Handle SSE stream timeout scenarios
    Given I have an SSE stream active for an extended period
    When no events occur for a long time
    Then heartbeats should maintain the connection
    And connection health should be verifiable through heartbeats
    And timeouts should not occur due to lack of data events
    And the stream should remain stable during quiet periods

  @error-handling
  Scenario: Handle SSE resumption with invalid Last-Event-ID
    Given a client attempts to resume an SSE stream
    When the provided Last-Event-ID is invalid or expired
    Then the server should handle the invalid ID gracefully
    And the server should either start from a valid point or reject resumption
    And appropriate error guidance should be provided
    And the client should fall back to tasks/get for state recovery

  @edge-case
  Scenario: Handle SSE stream with very high event frequency
    Given a task generates events at high frequency
    When the SSE stream delivers these events
    Then the stream should handle high throughput efficiently
    And heartbeats should continue even during high event rates
    And stream performance should not degrade significantly
    And clients should not be overwhelmed by event volume

  @edge-case
  Scenario: Handle SSE stream reconnection loops
    Given a client is experiencing persistent connection issues
    When the client repeatedly attempts to reconnect
    Then the server should handle reconnection attempts gracefully
    And backoff behavior should be guided by retry directives
    And the server should not be overwhelmed by reconnection storms
    And connection limits should be enforced appropriately

  @integration
  Scenario: SSE reliability integrates with MCP streaming parity
    Given both SSE (A2A) and MCP streaming are available
    When network interruptions affect streaming connections
    Then both SSE and MCP streaming should provide similar reliability
    And resumption capabilities should work consistently across interfaces
    And heartbeat and health check mechanisms should be comparable
    And clients should have similar recovery experiences

  @integration
  Scenario: SSE streaming integrates with task lifecycle management
    Given SSE streams are delivering task lifecycle events
    When tasks transition through states and generate artifacts
    Then streaming reliability should ensure all lifecycle events are delivered
    And task state transitions should not be lost due to connection issues
    And event ordering should be maintained even after reconnection
    And task completion events should be reliably delivered

  Scenario Outline: Test SSE stream reliability under different conditions
    Given I have an SSE stream under "<condition>" conditions
    When the stream operates for "<duration>" minutes
    Then heartbeats should be received every "<heartbeat_interval>" seconds
    And connection reliability should be "<reliability_level>"
    And resumption should work correctly

    Examples:
      | condition          | duration | heartbeat_interval | reliability_level |
      | normal_network     | 10       | 25±5               | high              |
      | intermittent_drops | 15       | 25±5               | medium            |
      | high_latency       | 5        | 25±5               | medium            |
      | stable_long_term   | 60       | 25±5               | high              |

  Scenario Outline: Test SSE resumption scenarios
    Given I have an SSE stream with "<last_event_id>" as the last received event
    When the connection is interrupted and I reconnect
    Then resumption should "<resumption_result>"
    And if resumption fails, fallback should be "<fallback_method>"

    Examples:
      | last_event_id | resumption_result | fallback_method |
      | valid_recent  | succeed          | not_needed      |
      | valid_old     | succeed          | not_needed      |
      | invalid       | fail             | tasks_get       |
      | expired       | fail             | tasks_get       |
      | none          | fail             | tasks_get       |