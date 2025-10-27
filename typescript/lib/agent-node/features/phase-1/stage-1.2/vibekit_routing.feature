Feature: Vibekit Framework and Routing (Stage 1.2)
  As the perpetuals trading agent
  In order to provide intelligent skill-based routing with Vibekit framework
  I want multi-skill routing capabilities with direct A2A SDK integration

  Background:
    Given the agent is upgraded to Stage 1.2 with Vibekit framework integration
    And Vibekit supports direct A2A SDK integration
    And the router is configured to use "gpt-oss-120B (high)" model
    And internal skills are properly configured with individual LLM contexts

  @core
  Scenario: Vibekit upgraded for direct A2A SDK integration
    Given Vibekit framework is upgraded to support direct A2A SDK integration
    When A2A requests are processed through Vibekit
    Then Vibekit should integrate directly with A2A methods
    And the integration should maintain A2A performance requirements
    And A2A semantics should be preserved through Vibekit layers
    And routing should not interfere with A2A protocol compliance

  @core
  Scenario: Multi-skill routing with internal tools
    Given the agent has multiple skills configured:
      | Skill Name      | Tool Name         | Purpose                    |
      | trading_skill   | trading_tool      | GMX position management    |
      | balance_skill   | balance_tool      | Wallet and balance queries |
      | market_skill    | market_tool       | Market data and analysis   |
    When a user request is received
    Then the router should analyze the request using gpt-oss-120B (high)
    And select the appropriate skill tool
    And route the request to the correct internal LLM context
    And each skill should operate with its own tool and context

  @core
  Scenario: Router accuracy meets 98% requirement
    Given the router has been trained on a seeded test set
    And the router uses gpt-oss-120B (high) model
    When the test set is processed through the routing system
    Then the router should select the correct skill ≥98% of the time
    And misroutes should be logged for continuous tuning
    And routing performance should be monitored and reported
    And misroute logging should enable continuous improvement

  @core
  Scenario: Each skill maintains independent LLM context
    Given multiple skills are active simultaneously
    When requests are routed to different skills
    Then each skill should invoke its own LLM context
    And context should not bleed between skills
    And each skill should have appropriate prompts and knowledge
    And skill-specific optimizations should be applied
    And one internal tool per skill architecture should be maintained

  @core
  Scenario: Internal router chooses skill tools
    Given the agent has configured skill tools available
    When a request needs to be processed
    Then the internal router should choose the appropriate skill tool
    And the selected tool should invoke its dedicated LLM context
    And the routing decision should be based on request analysis
    And the router should handle skill selection transparently

  @error-handling
  Scenario: Handle routing failures gracefully
    Given the router encounters an ambiguous or unclear request
    When skill selection confidence is below 98% threshold
    Then the system should request clarification from the user
    And the clarification request should be specific about what needs disambiguation
    And the request should remain submitted pending clarification
    And the routing failure should be logged for continuous tuning analysis

  @error-handling
  Scenario: Handle skill unavailability
    Given a request is routed to a specific skill
    When the target skill or its LLM context is temporarily unavailable
    Then the router should attempt fallback routing if applicable
    And the user should be notified of any service degradation
    And the failure should be logged with appropriate error taxonomy
    And automatic recovery should be attempted when the skill becomes available

  @error-handling
  Scenario: Handle router model failures
    Given the routing model "gpt-oss-120B (high)" becomes unavailable
    When routing decisions need to be made
    Then a fallback routing mechanism should be activated
    And basic routing based on keywords or patterns should be used
    And the degraded routing capability should be logged
    And service should continue with reduced intelligence

  @integration
  Scenario: Routing integration with A2A state management
    Given routing decisions are made within A2A sessions
    When tasks are created and routed to different skills
    Then routing information should be captured in task metadata
    And session context should inform routing decisions per A2A best practices
    And task artifacts should indicate which skills were involved
    And routing history should be available for debugging

  @integration
  Scenario: Skill routing maintains session state management
    Given the agent maintains A2A state management for contextId sessions
    When skills are routed and executed
    Then state management should follow A2A best practices
    And no regressions to Stage 1.1 functionality should occur
    And contextId session scoping should be preserved
    And task state transitions should remain deterministic

  Scenario Outline: Test routing accuracy for different request types
    Given a request of type "<request_type>" with content "<request_content>"
    When the router processes the request using gpt-oss-120B (high)
    Then it should route to skill "<expected_skill>" with confidence ≥ "<min_confidence>"
    And the routing decision should be completed within "<max_latency>" ms
    And the selected skill should have its own internal tool and LLM context

    Examples:
      | request_type     | request_content                    | expected_skill  | min_confidence | max_latency |
      | position_open    | Open long position on ETH-USD     | trading_skill   | 95%           | 100         |
      | balance_query    | What is my current USDC balance    | balance_skill   | 90%           | 50          |
      | market_analysis  | Analyze ETH price trends           | market_skill    | 85%           | 150         |
      | position_close   | Close my BTC position             | trading_skill   | 95%           | 100         |