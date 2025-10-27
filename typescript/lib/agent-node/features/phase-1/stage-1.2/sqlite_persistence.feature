Feature: SQLite Persistence Migration (Stage 1.2)
  As the perpetuals trading agent
  In order to provide durable storage for sessions and tasks
  I want to migrate from in-memory persistence to SQLite for improved durability

  Background:
    Given the agent is upgraded to Stage 1.2 with SQLite persistence
    And SQLite is introduced for durable storage replacing in-memory where trivial to integrate
    And existing in-memory functionality is preserved during migration

  @core
  Scenario: SQLite persistence introduction for durability
    Given the agent is upgraded from Stage 1.1 (in-memory) to Stage 1.2
    When sessions and tasks are created in Stage 1.2
    Then they should be stored in SQLite database instead of memory
    And durability should be improved over in-memory storage
    And data should persist across agent restarts
    And query performance should remain acceptable

  @core
  Scenario: Migration from in-memory to SQLite storage
    Given the agent has been running Stage 1.1 with in-memory persistence
    When upgrading to Stage 1.2 with SQLite
    Then existing in-memory data should be migrated if applicable
    And the migration should be seamless for active sessions
    And no data loss should occur during the migration process
    And the agent should start successfully with SQLite initialized

  @core
  Scenario: SQLite integration is lightweight and focused
    Given SQLite is introduced for durable storage needs
    When sessions and tasks require persistence
    Then SQLite should be integrated only where trivial to integrate
    And the integration should be lightweight and performant
    And complex SQLite features should not be required in Stage 1.2
    And the focus should be on basic durability improvements

  @core
  Scenario: Session persistence across agent restarts
    Given I have active sessions stored in SQLite
    And I have tasks in various states within those sessions
    When the agent is restarted
    Then all session data should be recovered from SQLite
    And task states should be accurately restored
    And session continuity should be maintained
    And contextId session scoping should work correctly

  @core
  Scenario: Task state durability with SQLite
    Given tasks are created and transition through various states
    When task states change (submitted → working → completed/failed/canceled)
    Then each state transition should be durably stored in SQLite
    And state transitions should be atomic and consistent
    And task recovery after agent restart should reflect accurate states
    And no task state should be lost due to agent interruptions

  @error-handling
  Scenario: Handle SQLite database initialization failures
    Given the agent is starting up with SQLite persistence configured
    When SQLite database cannot be initialized (permissions, disk space, etc.)
    Then the agent should fail to start gracefully
    And appropriate error messages should indicate the SQLite issue
    And fallback to in-memory should not occur (SQLite is required in Stage 1.2)
    And guidance should be provided for resolving SQLite initialization issues

  @error-handling
  Scenario: Handle SQLite write failures
    Given the agent is running with SQLite persistence
    When SQLite write operations fail (disk full, corruption, etc.)
    Then the operations should be retried with appropriate backoff
    And if retries fail, the error should be surfaced with normalized taxonomy
    And the agent should remain stable despite write failures
    And session/task operations should be handled gracefully

  @error-handling
  Scenario: Handle SQLite database corruption
    Given the SQLite database becomes corrupted
    When the agent attempts to read/write session and task data
    Then corruption should be detected and handled appropriately
    And database recovery mechanisms should be attempted if available
    And if recovery fails, appropriate error messages should be provided
    And the agent should not crash due to database corruption

  @edge-case
  Scenario: Handle large number of sessions and tasks in SQLite
    Given the agent accumulates a large number of sessions and tasks over time
    When SQLite storage contains extensive historical data
    Then query performance should remain acceptable for active operations
    And appropriate cleanup policies should manage historical data
    And database growth should not impact current session performance
    And indexing should be optimized for common query patterns

  @edge-case
  Scenario: Handle concurrent SQLite access
    Given multiple operations need to access SQLite simultaneously
    When concurrent reads and writes occur
    Then SQLite should handle concurrent access appropriately
    And data consistency should be maintained
    And proper locking mechanisms should prevent data corruption
    And performance should be reasonable under concurrent load

  @integration
  Scenario: SQLite integration with existing Stage 1.2 features
    Given Stage 1.2 includes Vibekit routing and configuration externalization
    When routing decisions create tasks and sessions
    Then all routing-related data should be stored durably in SQLite
    And routing history should be available for debugging
    And configuration changes should not require database schema updates
    And routing performance should not be significantly impacted by SQLite

  @integration
  Scenario: SQLite integration with A2A state management
    Given A2A state management follows best practices
    When sessions and tasks are managed with SQLite persistence
    Then A2A state transitions should remain deterministic
    And contextId session scoping should work correctly with SQLite
    And taskId-based operations should maintain consistency
    And no regressions should occur from in-memory Stage 1.1 behavior

  Scenario Outline: Test persistence across storage implementations
    Given the agent is using "<storage_type>" for persistence
    When I create and modify tasks
    Then tasks should be "<persistence_behavior>"
    And performance should be "<performance_expectation>"
    And durability should be "<durability_level>"

    Examples:
      | storage_type | persistence_behavior | performance_expectation | durability_level |
      | in-memory    | session_scoped      | very_fast               | process_lifetime |
      | sqlite       | durable             | fast                    | disk_persistent  |

  Scenario Outline: Test SQLite operation performance
    Given SQLite persistence is configured
    When performing "<operation_type>" operations
    Then the operation should complete within "<max_time>" milliseconds
    And the database should handle "<concurrent_ops>" concurrent operations
    And data consistency should be maintained

    Examples:
      | operation_type    | max_time | concurrent_ops |
      | session_create    | 100      | 10             |
      | task_create       | 50       | 20             |
      | task_update       | 25       | 50             |
      | session_query     | 200      | 10             |