Feature: Session and Task Management (Stage 1.1)
  As an A2A client
  In order to have reliable stateful interactions with the trading agent
  I want to manage my sessions and track task lifecycles deterministically

  Background:
    # Technical details: Stage 1.1 uses in-memory persistence, task state machine follows A2A best practices
    Given I am connecting to an agent running Stage 1.1 with session management capabilities
    And the system follows A2A best practices for task lifecycle management
    And the system provides session persistence appropriate for stage requirements

  @core
  Scenario: Create new session with server-generated contextId
    When I initiate a new session without providing a contextId
    Then a new session should be created with unique identifier
    And the server should ALWAYS generate its own contextId (never use client-provided)
    And the contextId should match format "ctx-[a-zA-Z0-9]+"
    And my session should be scoped by the contextId
    And my session should be ready to accept tasks and messages
    And the created session state should have empty tasks array

  @core
  Scenario: Task creation with deterministic lifecycle
    Given I have an active session with server-generated contextId "ctx-active"
    When I create a new task with message "Open long position on ETH-USD"
    Then the task should be assigned a unique taskId
    And the task should start in "submitted" state
    And the task should be associated with my contextId
    And the task should have a creation timestamp
    And the task should follow the canonical A2A state machine

  @core
  Scenario: Task initial submitted state (PRD line 20)
    Given I have an active session with contextId "ctx-test"
    When I create a new task via message/send
    Then the task should immediately be in "submitted" state
    And the "submitted" state should be the initial state before any processing
    And the task should remain in "submitted" state until processing begins
    When the system begins processing the task
    Then the task should transition from "submitted" to "working" state

  @core
  Scenario: Deterministic task state transitions
    Given I have a task in "submitted" state
    When the task begins processing
    Then I should observe the task transition to "working" state
    And the state change should be atomic
    And the transition should be logged with timestamp
    And I should be notified of the state change through SSE
    And only valid transitions should be allowed per A2A specification

  @core
  Scenario: Task completion with terminal state
    Given I have a working task for opening a position
    When the position is successfully opened onchain
    Then I should observe the task transition to "completed" state (terminal)
    And the task should include the result data for me
    And the completion should include transaction details
    And no further state transitions should be possible
    And the task should remain accessible to me for the session duration

  @core
  Scenario: Task failure with terminal state
    Given I have a working task that encounters an error
    When the error cannot be recovered automatically
    Then I should observe the task transition to "failed" state (terminal)
    And the failure should include error information for me
    And the error should indicate if I could retry the operation
    And diagnostic information should be provided when available
    And no further state transitions should be possible

  @core
  Scenario: Task cancellation with terminal state
    Given I have a working task with taskId "task-to-cancel"
    When I send a cancellation request for this task
    Then I should observe the task transition to "canceled" state (terminal)
    And any ongoing operations should be stopped gracefully
    And resources should be cleaned up appropriately
    And the cancellation should be confirmed to me
    And no further state transitions should be possible

  @core
  Scenario: Session continuity across connections
    Given I have an active session with contextId from server
    And I have added tasks "task-1" to the session
    And session has metadata with user "test-user"
    When I reattach to the session using the same contextId
    Then the same session should be returned (reattachment)
    And my previous tasks "task-1" should still be accessible
    And session metadata user should still be "test-user"
    And last activity timestamp should be updated

  @core
  Scenario: Session and task performance
    Given the agent provides session management for Stage 1.1
    When I create and access sessions and tasks
    Then performance should be adequate for my expected load
    And resource usage should be reasonable for typical session counts
    And my data should persist for the entire agent lifecycle
    And the system should meet Stage 1.1 persistence requirements

  @error-handling
  Scenario: Handle invalid task state transitions
    Given I have a task in "completed" state (terminal)
    When I attempt to transition it back to "working" state
    Then the transition should be rejected
    And I should receive an error indicating invalid state transition
    And the task should remain in its current state
    And the invalid transition attempt should be logged

  @core
  Scenario: Terminal states are immutable (PRD line 143)
    Given I have tasks in each terminal state:
      | Task ID     | Terminal State |
      | task-comp   | completed      |
      | task-fail   | failed         |
      | task-canc   | canceled       |
    When I attempt any state transition on these tasks:
      | Attempted Transition      | Expected Result                         |
      | completed -> working      | Transition rejected, remains completed |
      | failed -> working         | Transition rejected, remains failed    |
      | canceled -> working       | Transition rejected, remains canceled  |
      | completed -> failed       | Transition rejected, remains completed |
      | failed -> completed       | Transition rejected, remains failed    |
      | canceled -> completed     | Transition rejected, remains canceled  |
    Then no terminal state should allow any further transitions
    And each task should remain in its terminal state permanently
    And I should receive clear error messages about state immutability

  @core
  Scenario: Router behavior with terminal state tasks (PRD lines 107-111, 143)
    Given I have a task in "completed" state (terminal)
    When I send a message referencing this completed task ID
    Then the message should not trigger any special routing
    And the message should be processed as a normal new message
    And the completed task should remain unaffected
    And no workflow resumption should occur for terminal tasks

  @error-handling
  Scenario: Handle concurrent task operations
    Given I have a task that multiple operations are attempting to modify
    When concurrent state changes are attempted
    Then the operations should be handled properly
    And only valid state transitions should be allowed
    And my data integrity should be maintained
    And I should receive appropriate success/failure response for each operation

  @edge-case
  Scenario: Handle session limits and resource constraints
    Given the agent manages sessions and tasks
    When my session and task counts approach system limits
    Then appropriate limits should be enforced
    And older sessions should be cleaned up based on TTL
    And the system should remain stable under normal load
    And resource usage should be properly managed

  @integration
  Scenario: Task lifecycle integration with A2A streaming
    Given I have a task progressing through its lifecycle
    When the task transitions between states
    Then I should receive appropriate SSE events for each transition
    And event ordering should be maintained correctly
    And all state transitions should follow A2A canonical states
    And terminal states should be clearly indicated to me

  @core
  Scenario: Server returns error for non-existent contextId
    Given a client provides contextId "ctx-client-provided-123"
    When the contextId does not exist on server
    Then server should return JSON-RPC error with code -32602
    And error message should be "Session not found"
    And error data should include the invalid contextId
    And error data should include hint "Omit contextId to create new session, or provide valid existing contextId to reattach"

  @core
  Scenario: Session isolation between different users
    Given two separate user sessions exist
    When user 1 adds tasks "user1-task-1" and "user1-task-2"
    And user 2 adds task "user2-task-1"
    Then user 1 should only see their own tasks
    And user 2 should only see their task
    And tasks should be completely isolated between sessions

  @core
  Scenario: Session state isolation
    Given two sessions with different contextIds
    When session 1 updates metadata with value "session1"
    And session 2 updates metadata with value "session2"
    Then session 1 metadata should remain "session1"
    And session 2 metadata should remain "session2"
    And states should be completely isolated

  @core
  Scenario: Session persistence and retrieval
    Given a created session with contextId
    When retrieving the session by contextId
    Then the session should be retrieved successfully
    And session contextId should match the requested one

  @core
  Scenario: Non-existent session returns null
    When retrieving a non-existent session "ctx-nonexistent"
    Then null should be returned
    And no error should be thrown

  @core
  Scenario: List available sessions
    Given multiple active sessions created
    When listing all sessions
    Then all created sessions should be in the list
    And each session should have unique contextId

  @core
  Scenario: Update session metadata
    Given a session with contextId
    When updating session metadata with user "test-user"
    Then metadata should be accessible
    And metadata user field should be "test-user"

  @core
  Scenario: Track conversation history
    Given a session with contextId
    When adding conversation messages:
      | role      | content     |
      | user      | Hello       |
      | assistant | Hi there!   |
    Then conversation history should be preserved
    And history should maintain order and content

  @core
  Scenario: Associate tasks with session
    Given a session with contextId
    When adding tasks "task-1" and "task-2" to session
    Then tasks should be accessible for the session
    And getTasks should return both "task-1" and "task-2"

  @core
  Scenario: Update last activity timestamp
    Given a session with initial activity timestamp
    When updating activity after a delay
    Then session should be marked as active
    And activity timestamp should be updated

  @core
  Scenario: GetOrCreate for new sessions
    When calling getOrCreateSession without contextId
    Then a new session should be created
    And session should have server-generated contextId
    And session tasks should be empty array

  @core
  Scenario: GetOrCreate for existing sessions
    Given an existing session with task "existing-task"
    When calling getOrCreateSession with existing contextId
    Then the existing session should be returned
    And session should contain task "existing-task"

  @core
  Scenario: GetOrCreate with non-existent contextId returns error
    Given a non-existent contextId "ctx-nonexistent-999"
    When calling getOrCreateSession with this contextId
    Then server should return JSON-RPC error with code -32602
    And error should indicate session not found
    And error should include helpful hint for proper usage

