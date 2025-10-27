Feature: Configuration Management (Stage 1.2)
  As the perpetuals trading agent
  In order to support externalized configuration with validation
  I want configurations migrated from source code to external config files

  Background:
    Given the agent is upgraded to Stage 1.2 with configuration externalization
    And configuration schemas are defined using Zod with JSON Schema export
    And configurations are migrated from source code to config files

  @core
  Scenario: Configuration externalization from source code
    Given configurations were previously embedded in source code
    When the agent is upgraded to Stage 1.2
    Then configurations should be migrated to external config files
    And the following should be externalized to config files:
      | Configuration Type | Examples |
      | Discovery | Available skills, capabilities |
      | Routing | Decision logic, model settings, gpt-oss-120B (high) |
      | Policy | Access control, usage limits |
      | Connection | MCP endpoints, RPC URLs |
    And source code should no longer contain hardcoded configuration values

  @core
  Scenario: Configuration schema definition and validation
    Given configuration types are authored in Zod
    When configuration schemas are needed
    Then TypeScript types should be derived from Zod definitions
    And JSON schemas should be emitted using "zod-to-json-schema"
    And no schemas should be hand-written separately from Zod
    And schema validation should use Ajv in strict mode
    And configuration should be validated against schemas on load

  @core
  Scenario: Support for YAML and JSON configuration formats
    Given the agent supports configuration file formats
    When configuration files are processed
    Then YAML files (.yaml, .yml) should be supported
    And JSON files (.json) should be supported
    And the parsing pipeline should be: YAML → JSON → Ajv validation
    And TOML, JS/TS, JSON5 should not be supported
    And all configs should be treated as plain JSON objects before validation

  @core
  Scenario: Configuration search and discovery
    Given the agent needs to locate configuration files
    When the agent starts up
    Then it should search for configuration in order (nearest-first, stop at repo root):
      | Search Location | File Names |
      | Current directory | a2a.config.yaml, a2a.config.json |
      | Current directory | .a2arc.yaml, .a2arc.yml, .a2arc.json |
      | Config subdirectory | config/a2a.yaml, config/a2a.json |
      | Package.json | package.json under "a2a" key |
    And the search should stop at the first valid configuration found

  @core
  Scenario: Configuration precedence and merging
    Given configuration can come from multiple sources
    When the agent loads configuration
    Then the precedence should be (highest to lowest):
      | Precedence | Source |
      | 1 (highest) | CLI flags |
      | 2 | Environment variables |
      | 3 | Nearest config file |
      | 4 | Parent directory config |
      | 5 (lowest) | Built-in defaults |
    And merging should be deep for objects
    And arrays should be replaced, not merged

  @core
  Scenario: Routing configuration externalization
    Given routing logic was previously embedded in source
    When routing configuration is externalized
    Then router model selection (gpt-oss-120B high) should be configurable
    And skill discovery and mapping should be configured externally
    And routing confidence thresholds should be configurable
    And misroute logging settings should be externalized

  @core
  Scenario: MCP endpoint configuration externalization
    Given MCP connections were previously hardcoded
    When MCP configuration is externalized
    Then Onchain Actions MCP server URL should be configurable
    And connection timeout and retry policies should be configurable
    And transport settings should be externalized
    And capability mappings should be configured externally

  @error-handling
  Scenario: Handle invalid configuration syntax
    Given a configuration file contains syntax errors
    When the agent attempts to load the configuration
    Then parsing should fail with specific syntax error details
    And the error should indicate the exact location of the syntax problem
    And the agent should not start with invalid configuration
    And helpful error messages should guide configuration correction

  @error-handling
  Scenario: Handle configuration schema validation failures
    Given a configuration file has valid syntax but invalid schema
    When Ajv validates the configuration against Zod-derived schemas
    Then validation should fail with specific schema violations
    And the error should indicate which fields are invalid and why
    And the error should provide examples of valid configuration values
    And the agent should not start with schema-invalid configuration

  @integration
  Scenario: Configuration integration with Vibekit routing
    Given routing configuration affects skill selection and LLM contexts
    When routing configuration is loaded from external files
    Then routing model settings (gpt-oss-120B high) should be applied correctly
    And skill discovery configuration should be processed
    And policy configurations should be enforced
    And routing accuracy requirements (≥98%) should be validated against configuration

  @integration
  Scenario: Configuration supports Stage 1.2 feature requirements
    Given Stage 1.2 introduces new configuration requirements
    When configuration is loaded
    Then Vibekit framework settings should be supported
    And internal multi-skill routing configuration should be available
    And router accuracy thresholds should be configurable
    And all Stage 1.2 features should be configurable externally

  Scenario Outline: Test configuration loading from different file formats
    Given a configuration file in "<format>" format at "<location>"
    When the configuration contains "<content_type>" settings
    Then the file should be "<load_result>"
    And if successful, the settings should be applied correctly

    Examples:
      | format | location           | content_type    | load_result |
      | YAML   | a2a.config.yaml    | routing_config  | loaded      |
      | JSON   | .a2arc.json        | mcp_endpoints   | loaded      |
      | YAML   | config/a2a.yaml    | skill_settings  | loaded      |
      | JSON   | package.json       | basic_settings  | loaded      |
      | TOML   | config.toml        | any_settings    | rejected    |