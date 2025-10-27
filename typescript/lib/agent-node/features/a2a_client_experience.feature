Feature: A2A Client Experience Testing (Phase 1, Stage 1.1)
  As an A2A client (LLM or external agent)
  In order to successfully interact with the perpetuals trading agent foundation
  I want to use core A2A JSON-RPC methods with SSE streaming capabilities

  Background:
    Given I am an A2A client connecting to the trading agent
    And the agent is running in Stage 1.1 configuration with embedded EOA wallet and in-memory persistence
    And I have access to the A2A JSON-RPC interface
    And the well-known agent card is served at /.well-known/agent.json
    And the agent has at least 3 test markets available
    And the agent's wallet has sufficient funds for test operations

  # === Basic Protocol Compliance Scenarios ===

  @core
  Scenario: Check agent health via health method
    When I send a JSON-RPC request to "health"
    Then I should receive a successful response
    And the response should indicate the agent is operational
    And the response should include basic system status information

  @core
  Scenario: Retrieve agent card from well-known endpoint (A2A spec compliant)
    When I make an HTTP GET request to "/.well-known/agent.json"
    Then I should receive a valid agent card with status 200
    And content-type should be "application/json"
    And the card should contain protocolVersion "0.3.0"
    And the card should contain id "perpetuals-agent"
    And the card should contain name "Perpetuals Agent"
    And the card should contain capabilities.streaming = true
    And the card should include skills array containing:
      | id           | name         |
      | gmx-trading  | GMX Trading  |
    And required fields per PRD lines 162-195 should be present

  @core
  Scenario: Server creates with custom configuration
    Given custom configuration:
      | field | value       |
      | port  | 0           |
      | host  | 127.0.0.1   |
    When creating A2A server with custom config
    Then server should be created successfully
    And server should have listen and close methods

  @core
  Scenario: Server integrates workflow runtime
    Given workflow configuration with plugins "gmx-trading" and executor "mcp"
    When creating server with workflow runtime
    Then server should be created with workflow capabilities
    And agent metadata should reflect skill "gmx-trading"

  @core
  Scenario: A2A JSON-RPC endpoint availability
    Given the A2A server is running
    When sending valid request to "/a2a" endpoint
    Then response status should be 200
    And response should have "jsonrpc": "2.0"

  @core
  Scenario: CORS headers handling
    Given the A2A server with CORS enabled
    When sending preflight OPTIONS request with Origin "http://localhost:3000"
    Then response status should be 204
    And response should include access-control headers

  @core
  Scenario: Valid JSON-RPC request handling
    Given a valid JSON-RPC request structure
    When sending message/send request with:
      | field      | value      |
      | jsonrpc    | 2.0        |
      | method     | message/send |
      | id         | 1          |
    Then response should return with same id
    And response should include result field

  @error-handling
  Scenario: Invalid JSON-RPC request rejection
    Given an invalid request missing jsonrpc field
    When sending the malformed request
    Then response status should be 200 (JSON-RPC errors return 200)
    And response should contain error with code

  @core
  Scenario: Server graceful shutdown
    Given a running A2A server
    When shutdown is requested via close()
    Then server should close gracefully
    And cleanup should complete without errors

  # === Session Management and Context ===

  @core
  Scenario: Obtain server-generated contextId for a new session
    When I send an initial JSON-RPC request to "message/send" without a contextId with:
      """
      {
        "message": "Start a new session"
      }
      """
    Then I should receive a successful JSON-RPC response
    And the response should include a server-generated contextId
    And contextId should match format "ctx-[a-zA-Z0-9]+"
    And I should use this contextId for subsequent requests in the same session

  @core
  Scenario: Session continuity with contextId across connections
    Given I have an active session with server-generated contextId "ctx-persistent"
    And I have created multiple tasks in this session
    When I disconnect and reconnect with the same contextId
    Then I should be able to retrieve all tasks from this session during agent uptime
    And the session state should be preserved
    And I should be able to continue streaming from existing tasks

  @integration
  Scenario: Session management from client perspective
    Given I establish an A2A session
    When I track session lifecycle and task management:
      | Client Action                    | Expected Behavior                        |
      | Create new session               | Receive unique contextId                 |
      | Execute multiple tasks in session| Tasks properly scoped to contextId      |
      | Query task status                | Accurate status for my contextId tasks  |
      | Query task list                  | Only see my contextId tasks             |
      | Session idle timeout             | Receive notification before cleanup     |
    Then I should have full visibility into my session state
    And my tasks should remain isolated from other client sessions
    And session cleanup should be predictable and communicated

  # === Basic Message Handling ===

  @core
  Scenario: Send a message via message/send method with immediate text response
    Given I have a valid server-generated contextId "ctx-123"
    When I send a JSON-RPC request to "message/send" with:
      """
      {
        "contextId": "ctx-123",
        "message": "What is 2+2?"
      }
      """
    Then I should receive a successful JSON-RPC response
    And the response should contain a message result without a taskId
    And the result kind should be "message" with a text part

  @core
  Scenario: Send a message via message/send method that returns a task for long-running work
    Given I have a valid server-generated contextId "ctx-123"
    When I send a JSON-RPC request to "message/send" with:
      """
      {
        "contextId": "ctx-123",
        "message": "Open a long position on ETH-USD for 3 USDC"
      }
      """
    Then I should receive a successful JSON-RPC response
    And the response should contain a taskId
    And the task should be in "submitted" state initially
    And the task should progress to "working" state

  @core
  Scenario: Send a message via message/send that returns a completed task with artifacts
    Given I have a valid server-generated contextId "ctx-456"
    When I send a JSON-RPC request to "message/send" with:
      """
      {
        "contextId": "ctx-456",
        "message": "Generate and return a JSON trade summary report"
      }
      """
    Then I should receive a successful JSON-RPC response
    And the response should contain a taskId
    And the task should be in a terminal state "completed"
    And the response should include an artifacts list
    And each artifact should include artifactId, kind (text|json|binary), and an a2a:// URI

  # === Task Management ===

  @core
  Scenario: Retrieve task status via tasks/get method
    Given I have a completed task with taskId "task-789"
    When I send a JSON-RPC request to "tasks/get" with taskId "task-789"
    Then I should receive the complete task information
    And the task should show status "completed"
    And the response should include any artifacts with stable a2a:// URIs
    And the response should include log URIs for debugging

  @core
  Scenario: Cancel a working task via tasks/cancel method
    Given I have a working task with taskId "task-999"
    When I send a JSON-RPC request to "tasks/cancel" with taskId "task-999"
    Then I should receive a successful cancellation response
    And the task status should change to "canceled"
    And any SSE streams should receive a "status-update" event with state "canceled" and "final: true"
    And no further events should be sent for this task

  Scenario Outline: Test task state transitions (Stage 1.1)
    Given I have a task in "<initial_state>" state
    When the task transitions to "<final_state>"
    Then the SSE stream should emit the appropriate event
    And the event should be a "status-update" with appropriate state
    And subsequent tasks/get should reflect the new state

    Examples:
      | initial_state  | final_state    | event_type      |
      | submitted      | working        | status-update   |
      | working        | completed      | status-update   |
      | working        | failed         | status-update   |
      | working        | canceled       | status-update   |

  # === SSE Streaming and Event Delivery ===

  @core
  Scenario: SSE streaming requirements compliance (PRD lines 144-158)
    Given I establish an SSE connection for message/stream
    When the stream is active
    Then the response headers should be exactly:
      | Header           | Value                  |
      | Content-Type     | text/event-stream     |
      | Cache-Control    | no-cache              |
      | Connection       | keep-alive            |
    And a "retry: 5000" directive should be sent once at stream start
    And heartbeat events should be emitted every 25s ±5s jitter:
      """
      event: heartbeat
      data: {}
      """
    And all events should include these fields:
      | Field         | Description                              |
      | contextId     | Session identifier                       |
      | ts            | ISO-8601 timestamp                      |
      | id            | Monotonic identifier for resumption     |
    And message-scoped events should NOT include taskId
    And task-scoped events should ALWAYS include taskId

  @core
  Scenario: Stream immediate text response via message/stream without creating a task
    Given I have a valid server-generated contextId "ctx-quick"
    When I send a JSON-RPC request to "message/stream" with:
      """
      {
        "contextId": "ctx-quick",
        "message": "Explain what a basis point is, briefly"
      }
      """
    Then I should receive an HTTP 200 response with SSE headers
    And I should receive one or more "status-update" events with text
    And I should receive a terminal "status-update" event with "final: true" and kind "message"
    And no event in this stream should include a taskId

  @core
  Scenario: Stream a continuous response via message/stream method
    Given I have a valid server-generated contextId "ctx-123"
    When I send a JSON-RPC request to "message/stream" with:
      """
      {
        "contextId": "ctx-123",
        "message": "Write a detailed report on ETH-USD market conditions"
      }
      """
    Then I should receive an HTTP 200 response with SSE headers
    And I should receive a "retry: 5000" directive at stream start
    And I should receive periodic "heartbeat" events roughly every 25 seconds
    And I should receive either "status-update" or "artifact-update" events with incremental updates
    And each event should contain contextId, delta, timestamp and monotonic ID
    And if the stream is task-scoped, events should include taskId
    And if the stream is task-scoped, artifact updates may be included in delta or referenced via a2a:// URIs
    And I should receive a terminal "status-update" event with "final: true"

  @integration
  Scenario: SSE stream resumption with Last-Event-ID (PRD lines 158)
    Given I have an active SSE stream receiving events with monotonic IDs
    When my connection is interrupted after receiving event ID "12345"
    And I reconnect with Last-Event-ID header set to "12345"
    Then the server should honor the Last-Event-ID when feasible
    And I should resume receiving events from after ID "12345"
    And if server cannot honor Last-Event-ID, I should fallback to tasks/get
    And no events should be lost or duplicated during resumption

  @core
  Scenario: STDIO/NDJSON mapping for streaming events (PRD lines 159)
    Given the agent supports STDIO transport
    When streaming events are emitted
    Then each event should be emitted as one NDJSON object per line:
      """
      { "type": "<eventType>", "data": <payload>, "id": "<monotonic-id>", "retry": 5000 }
      """
    And event types should use A2A kinds:
      | SSE Event Type      | NDJSON Type        |
      | task                | task               |
      | status-update       | status-update      |
      | artifact-update     | artifact-update    |
      | heartbeat           | heartbeat          |
    And heartbeat lines should use: { "type": "heartbeat", "data": {} }
    And resumption hints should be via "id" and optional "retry" fields
    And errors should use "status-update" with state "failed" and normalized taxonomy

  # === Artifact and Resource Management ===

  @integration
  Scenario: Stream task artifacts over SSE and validate via tasks/get
    Given I have a valid server-generated contextId "ctx-artifacts"
    When I send a JSON-RPC request to "message/stream" with:
      """
      {
        "contextId": "ctx-artifacts",
        "message": "Generate a trade summary report as a JSON artifact"
      }
      """
    Then I should receive an HTTP 200 response with SSE headers
    And I should receive "artifact-update" events that include artifact updates or references
    And I should eventually receive a terminal "status-update" event with state "completed" and "final: true"
    When I send a JSON-RPC request to "tasks/get" with the taskId from the stream
    Then the response should include an artifacts list
    And each artifact should include artifactId, kind (text|json|binary), and an a2a:// URI
    And log URIs should be available under a2a://tasks/{taskId}/log

  @integration
  Scenario: A2A URIs work correctly with task artifacts
    Given I have a completed task that generated artifacts
    When I retrieve the task via tasks/get
    Then the artifacts should have stable a2a:// URIs
    And the URIs should follow the format "a2a://tasks/{taskId}/artifact/{artifactId}"
    And log URIs should follow the format "a2a://tasks/{taskId}/log"
    And artifact metadata should include kind (text/json/binary)
    And no HTTP retrieval endpoints should be available (artifacts accessed via SSE artifact-update events only)

  @core
  Scenario: Complete Resource URI scheme compliance (PRD lines 196-201)
    Given I have a task with multiple artifacts and logs
    When I retrieve task information via tasks/get
    Then the response should include properly formatted resource URIs:
      | Resource Type    | URI Format                                        |
      | Task Artifact    | a2a://tasks/{taskId}/artifact/{artifactId}      |
      | Task Log         | a2a://tasks/{taskId}/log                         |
    And the artifact listing should have this shape:
      """
      "artifacts": [
        {
          "artifactId": "<string>",
          "kind": "text|json|binary",
          "uri": "a2a://tasks/{taskId}/artifact/{artifactId}"
        }
      ]
      """
    And artifacts may be delivered via multiple mechanisms:
      | Delivery Method              | When Used                                |
      | Inline in task completion    | For tasks that complete in same call     |
      | SSE artifact-update events   | During streaming                         |
      | Resource URIs                | For later retrieval (Stage 1.3+)        |
    And TaskArtifactUpdateEvent should be used for streaming artifact chunks

  # === Complete Trading Workflows ===

  @integration @core
  Scenario: Complete trading workflow as experienced by the client
    Given I want to open a long ETH-USD position
    When I send a JSON-RPC request to execute "Open long ETH-USD 3 USDC 2x leverage"
    Then I should receive an immediate response with taskId and contextId
    And I should receive SSE events in this sequence:
      | Event Type        | Content                                    | Expected Timing  |
      | task_created      | taskId, contextId, initial status         | Immediate        |
      | task_running      | workflow execution begins                  | < 2 seconds      |
      | artifact_ready    | transaction details and parameters         | < 10 seconds     |
      | task_running      | transaction signed and submitted           | < 15 seconds     |
      | task_running      | awaiting blockchain confirmation           | < 20 seconds     |
      | task_completed    | final position details and confirmation    | < 30 seconds     |
    And the final SSE event should have "final": true
    And I should receive artifacts containing:
      | Artifact Type         | Required Content                           |
      | Transaction Hash      | Arbitrum transaction hash                  |
      | Position Details      | Market, size, leverage, entry price        |
      | Gas Information       | Gas used and cost                          |
      | Confirmation Status   | Block number and confirmation count        |
    And no sensitive information should be exposed in any artifact or event

  @integration @core
  Scenario: Workflow pause and resume from client perspective (PRD lines 32-35, 204-212)
    Given I initiate a workflow that requires additional input
    When I send a request that triggers a workflow pause
    Then I should receive SSE events indicating the pause:
      | Event Type        | Content                                    |
      | task_running      | workflow executing normally                |
      | artifact_ready    | any pre-pause artifacts                    |
      | task_paused       | schema for required input, reason for pause|
    And the pause status should include JSON Schema hints in message.parts[*].metadata
    And the schema should specify exactly what input format I need to provide
    When I send the required structured input via JSON-RPC with DataPart:
      """
      {
        "method": "message/send",
        "params": {
          "message": {
            "role": "user",
            "parts": [{
              "kind": "data",
              "data": { "firstName": "John", "lastName": "Doe" },
              "metadata": { "mimeType": "application/json" }
            }],
            "taskId": "TASK_ID",
            "contextId": "CTX"
          }
        }
      }
      """
    Then the DataPart must have mimeType: "application/json"
    And the data field must contain the structured JSON input
    And I should receive confirmation of input receipt or validation error
    And if validation fails, I should receive error code -32602 (Invalid params)
    And the workflow should resume with additional SSE events:
      | Event Type        | Content                                    |
      | task_running      | workflow resumed with my input             |
      | task_completed    | final workflow result                      |
    And the final result should incorporate my provided input

  @integration @core
  Scenario: Multi-session concurrent operations from client perspective
    Given I create multiple concurrent A2A sessions
    When I execute different operations in parallel across sessions:
      | Session | Operation                              | Expected Result     |
      | A       | Open long ETH-USD 3 USDC 2x leverage | Independent success |
      | B       | Query balance and positions           | Independent success |
      | C       | Open short BTC-USD 5 USDC 3x leverage| Independent success |
    Then each session should execute independently
    And I should receive separate SSE streams for each session
    And task artifacts should be scoped to their respective contextIds
    And no cross-session data contamination should occur
    And all sessions should complete successfully

  @integration
  Scenario: Testing across all available markets from client perspective
    Given the agent supports at least 3 test markets
    When I query available markets through the A2A interface
    Then I should receive a list of at least 3 supported markets
    When I execute trading operations on each available market:
      | Market Operation                        | Expected Client Experience              |
      | Open position on first available market | Same workflow pattern and artifacts     |
      | Open position on second available market| Consistent interface and event timing   |
      | Open position on third available market | Identical artifact structure            |
    Then all markets should provide consistent client experience
    And artifact formats should be identical across markets
    And SSE event patterns should be consistent regardless of market

  # === Error Handling and Edge Cases ===

  @error-handling
  Scenario: Handle invalid JSON-RPC requests
    When I send an invalid JSON-RPC request with malformed JSON
    Then I should receive a JSON-RPC error response
    And the error code should be -32700 for parse error
    And the response should follow JSON-RPC error format
    And the error object should contain code, message, and optional data fields

  @error-handling
  Scenario: Handle requests to non-existent methods
    When I send a JSON-RPC request to "non/existent/method"
    Then I should receive a JSON-RPC error response
    And the error code should be -32601 for method not found
    And the error message should indicate the method does not exist
    And the response may list available methods for guidance

  @error-handling
  Scenario: Handle invalid parameters with proper JSON-RPC error codes (PRD line 91)
    Given I send a JSON-RPC request with invalid parameters
    When the server validates the parameters
    Then I should receive a JSON-RPC error response with code -32602
    And the error message should indicate "Invalid params"
    And the error data field may contain details about which parameters were invalid
    And this should apply to validation errors in workflow resume operations

  @error-handling
  Scenario: Handle SSE connection failures during streaming
    Given I have an active SSE stream for task updates
    When the network connection is temporarily interrupted
    Then I should be able to reconnect using the Last-Event-ID header
    And I should resume receiving events from where I left off
    And no events should be lost during the reconnection

  @error-handling
  Scenario: Comprehensive error taxonomy implementation (PRD lines 160-162)
    Given the agent encounters various types of errors
    When errors occur across different components and transports
    Then all errors should follow the normalized taxonomy:
      """
      {
        "code": "<string|int>",
        "message": "<string>",
        "details": { ... },
        "retryable": <boolean>,
        "diagnostics": { ... } (optional)
      }
      """
    And error propagation should be consistent across:
      | Transport     | Error Event Format                           |
      | SSE           | status-update with state "failed" and error object |
      | STDIO/NDJSON  | status-update with state "failed" and error object |
      | HTTP          | JSON-RPC error response with taxonomy        |
    And retry hints should be provided when applicable
    And diagnostics should include relevant debugging information

  @error-handling
  Scenario: Error propagation across transport boundaries
    Given I have an operation that fails during execution
    When the error occurs in different transport contexts
    Then the error should be normalized consistently:
      | Context           | Error Delivery Method                        |
      | HTTP JSON-RPC     | Standard JSON-RPC error response            |
      | SSE Streaming     | status-update with state "failed" and taxonomy |
      | STDIO Streaming   | status-update NDJSON with state "failed"      |
    And retry hints should be preserved across transport boundaries
    And diagnostic information should be consistent regardless of transport
    And sensitive information should be redacted from all error outputs

  @error-handling
  Scenario: Client-side error handling and recovery
    Given I send requests that will trigger various error conditions
    When I encounter different types of errors:
      | Error Scenario           | My Request                          | Expected Response                |
      | Invalid JSON-RPC format  | Malformed JSON request              | Proper JSON-RPC error response   |
      | Invalid parameters       | Invalid market or size              | Clear validation error message   |
      | Insufficient funds       | Position larger than balance        | Actionable error with guidance   |
      | Network issues           | During transaction submission       | Retryable error with retry info  |
      | Market unavailable       | Request for unsupported market      | Clear market availability info   |
    Then I should receive standardized error responses
    And error messages should clearly explain what went wrong
    And retryable errors should be clearly marked as such
    And I should receive guidance on how to resolve each error type

  @error-handling
  Scenario: Client perspective on system degradation
    Given the agent encounters internal system issues
    When various system components become unavailable:
      | Component Issue                | Expected Client Experience               |
      | Blockchain network problems    | Clear error with retry guidance          |
      | Wallet signing issues          | Specific error about signing failure     |
      | Market data unavailable        | Clear notification about market status   |
      | Agent overloaded              | Rate limiting with clear retry timing    |
    Then I should receive clear communication about service status
    And I should understand which operations are still available
    And I should get guidance on when to retry failed operations
    And the agent should maintain session state during partial outages

  @edge-case
  Scenario: Client handling of extreme conditions
    Given I test edge cases as an A2A client
    When I send extreme or boundary condition requests:
      | Edge Case Scenario              | My Request                           | Expected Response                |
      | Maximum position size           | Largest allowed position             | Success or clear limit message   |
      | Minimum position size           | Smallest allowed position            | Success or clear minimum message |
      | Rapid sequential requests       | Many requests in quick succession    | Proper queuing or rate limiting  |
      | Very large transaction data     | Complex transaction with many params | Handled efficiently              |
      | Extended network delays         | Operations during network problems   | Timeout handling with clear info |
    Then I should receive appropriate responses for all edge cases
    And the agent should maintain stability from my perspective
    And I should never receive crashes or unexpected disconnections

  @edge-case
  Scenario: Agent restart impact on client experience
    Given I have active sessions and ongoing workflows
    When the agent restarts (deployment or crash recovery)
    Then I should experience predictable behavior:
      | Client Impact                   | Expected Experience                      |
      | Active SSE connections          | Disconnection with clear connection loss |
      | In-progress workflows           | Tasks marked as lost/interrupted         |
      | Session data                    | Sessions cleared, need to reconnect      |
      | New connection attempts         | Should succeed immediately after restart |
    And I should be able to detect agent restart through connection behavior
    And I should be able to establish new sessions immediately
    And the agent should clearly communicate its fresh state

  # === A2A Specification Compliance ===

  @integration
  Scenario: A2A specification compliance from client perspective
    Given I interact with the agent as a standards-compliant A2A client
    When I test full A2A specification compliance:
      | A2A Feature                     | Client Test                               | Expected Behavior              |
      | JSON-RPC 2.0 methods           | Call all supported methods               | Proper responses per spec      |
      | SSE event formatting            | Monitor all event types                  | Compliant event structures     |
      | Task state transitions          | Track task lifecycle                     | Follow A2A state machine       |
      | Resource URI handling           | Use a2a:// URIs where applicable         | Proper URI resolution          |
      | Error response format           | Trigger various error conditions         | Standardized error responses   |
      | Agent capability discovery      | Query agent card and capabilities        | Complete capability info       |
    Then all A2A specification requirements should be met from client perspective
    And I should be able to interact using any compliant A2A client library
    And the agent should pass automated A2A compliance tests

  # === Performance and Transport Testing ===

  @integration
  Scenario: Performance validation from client perspective
    Given I measure performance as an A2A client
    When I execute standard operations and measure response times:
      | Operation                       | Performance Expectation                  |
      | Initial JSON-RPC call response  | < 2 seconds                             |
      | First SSE event delivery        | < 500ms after request                   |
      | Transaction preparation         | Artifacts ready within 10 seconds      |
      | Blockchain confirmation         | Final result within 30 seconds         |
      | Session management operations   | Task queries respond within 100ms      |
    Then all performance requirements should be met from my perspective
    And I should experience consistent response times
    And SSE events should arrive in a timely manner
    And the client experience should feel responsive throughout

  Scenario Outline: Client workflow testing across operation types
    Given I want to test "<operation_type>" as an A2A client
    When I execute the complete operation through the A2A interface
    Then I should experience consistent client interaction patterns:
      | Client Experience Aspect       | Requirement                              |
      | Request format                  | Standard JSON-RPC request structure      |
      | Response timing                 | Initial response within 2 seconds       |
      | SSE event sequence              | Predictable event flow                   |
      | Artifact delivery               | Operation-appropriate artifacts          |
      | Error handling                  | Clear client-actionable error messages  |
      | Completion indication           | Final SSE event with final: true         |

    Examples:
      | operation_type        |
      | position_opening      |
      | position_closing      |
      | balance_querying      |
      | market_data_fetching  |
      | limit_order_placement |

  Scenario Outline: Transport-agnostic client experience
    Given I connect using "<transport_type>" transport
    When I execute the same operations across different transport types
    Then my client experience should be equivalent regardless of transport:
      | Experience Factor               | Requirement                              |
      | Method call semantics           | Identical results across transports     |
      | Event delivery format           | Consistent event structure              |
      | Error response format           | Standardized across transports         |
      | Performance characteristics     | Similar timing expectations            |
      | Session management behavior     | Transport-independent session handling  |

    Examples:
      | transport_type |
      | HTTP_SSE       |
      | STDIO_NDJSON   |