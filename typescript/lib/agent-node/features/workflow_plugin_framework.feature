Feature: Workflow Plugin Framework (Stage 1.1)
  As a workflow plugin developer
  In order to create reusable, pausable workflows for autonomous agents
  I want my workflows to provide observable, controllable behaviors through the framework

  Background:
    # Technical details: framework supports async generator workflows with pause/resume capabilities and validation
    Given I have developed a workflow plugin
    And the framework supports pausable workflow execution
    And the framework provides structured input validation
    And the framework manages workflow state transitions

  @core
  Scenario: Basic workflow execution with continuous updates (PRD lines 28-29)
    Given I have created a workflow "vault_deposit"
    When the framework executes my workflow
    Then I should observe the workflow start running
    And I should receive status updates as the workflow progresses
    And I should receive progress information during execution
    And the workflow should continue running between updates

  @core
  Scenario: Workflow status updates and progress reporting (PRD lines 28-29)
    Given I have created a workflow that reports status during execution
    When the workflow runs and provides status updates
    Then I should receive current workflow state information
    And I should receive incremental progress information
    And the status updates should contain all necessary information for monitoring
    And the workflow should continue executing after providing updates

  @core
  Scenario: Workflow artifact generation (PRD lines 29, 35)
    Given I have created a workflow that generates supplemental outputs
    When the workflow produces artifacts during execution
    Then I should receive the artifacts as supplemental outputs
    And the workflow should continue executing after producing artifacts
    And I should receive artifacts before any final status updates
    And artifacts should never be required for workflow pause/resume operations

  @core
  Scenario: Workflow pause on input-required state (PRD lines 30, 32-34)
    Given I have created a workflow that requires user input at some point
    When the workflow reaches a point where it needs user input
    Then I should observe the workflow pause execution
    And the workflow should remain suspended
    And I should receive a clear specification of what input is needed
    And the workflow should remain paused until valid input is provided

  @core
  Scenario: Workflow pause on auth-required state (PRD lines 30, 92)
    Given I have created a workflow that requires privileged action authorization
    When the workflow reaches a point requiring authorization
    Then I should observe the workflow pause execution
    And the workflow should remain suspended
    And the pause should apply to any privileged action, not just signatures
    And the workflow should wait for proper authorization before continuing

  @core
  Scenario: Workflow resume with validated input (PRD lines 34, 90)
    Given my workflow is paused waiting for structured input
    When valid input is provided that matches the required specification
    Then the workflow generator itself performs validation
    And validation occurs WITHIN the generator, not the framework
    And the generator updates the task state after validation
    And successful validation allows the workflow to continue execution
    And the workflow generator receives the raw input data directly

  @core
  Scenario: Critical artifact delivery ordering (PRD lines 35)
    Given I have created a workflow that generates artifacts before pausing
    When the workflow produces artifacts and then pauses
    Then I should receive all artifacts FIRST
    And I should receive the pause status AFTER all artifacts
    And artifacts must be delivered before any pause state to ensure I receive them

  @error-handling
  Scenario: Workflow execution exception handling
    Given I have created a workflow that encounters an internal error during execution
    When the workflow produces an unexpected exception
    Then I should observe the error being handled appropriately
    And I should receive error information with diagnostic details
    And the workflow should stop executing
    And I should observe the workflow transition to an error state

  @error-handling
  Scenario: Invalid input during workflow resume (PRD lines 34, 91)
    Given my workflow is paused waiting for structured input
    When invalid data is provided to the workflow generator
    Then the generator itself rejects the invalid input
    And the generator returns error with message "Invalid input: missing required field"
    And the generator keeps the task in "input-required" state
    And the workflow remains paused and does not resume with invalid data
    And the generator controls state transitions based on validation

  @edge-case
  Scenario: Multiple simultaneous workflow executions
    Given I have created multiple workflows running simultaneously
    When each workflow operates independently
    Then the workflows should not interfere with each other's execution
    And each workflow should maintain its own execution context
    And I should observe proper concurrent workflow state management

  @edge-case
  Scenario: Workflow producing empty or malformed data
    Given I have created a workflow that produces unexpected data structures
    When the workflow produces malformed status updates or artifacts
    Then I should observe the malformed data being handled gracefully
    And the error handling should prevent system crashes
    And the workflow should transition to failed state if unrecoverable
    And I should receive error diagnostics for debugging

  @integration
  Scenario: Workflow integration with framework lifecycle
    Given I have created a workflow plugin executing within the framework
    When the workflow progresses through its lifecycle
    Then I should observe the workflow follow expected state transitions
    And I should see proper state transition management for the workflow
    And the workflow should integrate seamlessly with the framework infrastructure

  @core
  Scenario: Task-based routing for paused workflows (PRD lines 32-33, 88, 107-111)
    Given I have a task in "input-required" state (which means its workflow is paused)
    When a message arrives referencing that task ID
    Then I should observe the message being intercepted before normal processing
    And the intercepted message should bypass normal message handling
    And the message should be routed directly to resume the paused workflow
    And no additional processing should occur for this direct routing

  @core
  Scenario: Router bypasses non-paused tasks (PRD lines 107-111)
    Given I have tasks in various states
    When messages arrive referencing different task IDs
    Then I should observe messages for tasks in "input-required" or "auth-required" states being intercepted
    And I should observe messages for tasks in "working" state proceeding normally
    And I should observe messages for tasks in terminal states proceeding normally
    And only messages with task IDs in pause states should trigger special routing

  @core
  Scenario: Workflow auto-resume via task ID without additional processing (PRD lines 32-33, 110)
    Given I have a task in "input-required" state waiting for structured input
    When valid input arrives with that task ID
    Then the input is forwarded directly to the workflow generator
    And the generator validates and continues execution
    And status update shows "Input validated" from generator
    And the workflow continues from where it paused

  Scenario Outline: Test workflow output types and behaviors
    Given I have created a workflow that produces "<output_type>"
    When the workflow execution reaches the output point
    Then I should observe the workflow "<execution_behavior>"
    And I should see the framework handle "<framework_action>"

    Examples:
      | output_type     | execution_behavior    | framework_action        |
      | status_update   | continue_executing    | process_status_update   |
      | progress        | continue_executing    | process_progress_update |
      | artifact        | continue_executing    | process_artifact        |
      | input-required  | suspend_execution     | pause_and_wait_input    |
      | auth-required   | suspend_execution     | pause_and_wait_auth     |

  @core
  Scenario: AgentExecutor routes paused workflow messages
    Given a task "task-paused-123" in "input-required" state
    When message arrives with taskId "task-paused-123"
    And message contains data part with firstName "John" and lastName "Doe"
    Then AgentExecutor routes message to paused workflow
    And workflow resumes with state "working"
    And status update is published

  @core
  Scenario: AgentExecutor creates task for new workflow messages
    Given no paused workflows exist
    When message "Open a long position on ETH-USD" arrives without taskId
    And LLM returns action "dispatch_workflow" with workflow "gmx_position"
    Then new task is created with state "working"
    And workflow is dispatched through runtime

  @core
  Scenario: AgentExecutor handles authorization responses
    Given task "task-auth-456" in "auth-required" state
    When message arrives with authorization data
    Then workflow receives authorization response
    And workflow continues based on authorization result

  @core
  Scenario: Workflow generator validates input directly
    Given paused workflow with generator validation logic
    When data "{ someField: 'invalid' }" is sent to generator
    Then generator.next() is called with the raw data
    And generator validates internally and returns status "Input validated"
    And generator updates task state to "working" after successful validation
    And status update published with validation message from generator

  @core
  Scenario: Generator rejects invalid input and keeps task paused
    Given paused workflow with generator validation
    When invalid data missing email field is sent
    Then generator.next() returns error "Invalid input: missing required field 'email'"
    And task remains in "input-required" state
    And error message is sent to user

  @core
  Scenario: Task cancellation via AbortController
    Given a running task "task-cancel-789"
    When cancellation is requested
    Then task is cancelled via AbortController signal
    And workflow execution is stopped
    And resources are cleaned up

  @core
  Scenario: LLM tool availability for workflows
    Given AgentExecutor with LLM integration
    When getting available tools
    Then dispatch tools are available for workflows
    And MCP tools are accessible
    And resume tools are NOT available to LLM