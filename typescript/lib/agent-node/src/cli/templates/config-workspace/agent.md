---
version: 1
card:
  protocolVersion: '0.3.0'
  name: '__AGENT_NAME__'
  description: '__AGENT_DESCRIPTION__'
  url: '__AGENT_BASE_URL__/a2a'
  version: '__AGENT_VERSION__'
  capabilities:
    streaming: true
    pushNotifications: false
  # PROVIDER:START
  provider:
    name: '__PROVIDER_NAME__'
    url: '__PROVIDER_URL__'
  # PROVIDER:END
  defaultInputModes: ['text/plain', 'application/json']
  defaultOutputModes: ['application/json', 'text/plain']

# Agent-level AI configuration (default for all skills)
ai:
  modelProvider: __AI_PROVIDER__
  model: __AI_MODEL__
  params:
    temperature: 0.7
    maxTokens: 4096
    topP: 1.0
    reasoning: low

# Agent Card hosting configuration
routing:
  agentCardPath: '/.well-known/agent-card.json'
  # agentCardOrigin: 'https://example.com' # optional origin override
# ERC8004:START
# # ERC-8004 configuration
# erc8004:
#   enabled: true
#   canonical:
#     chainId: __ERC8004_CANONICAL_CHAIN__
#     __OPERATOR_ADDRESS_LINE__
#   mirrors:
#     __ERC8004_MIRRORS__
#   identityRegistries:
#     '1': '0x0000000000000000000000000000000000000000'
#     '8453': '0x0000000000000000000000000000000000000000'
#     '11155111': '0x8004a6090Cd10A7288092483047B097295Fb8847'
#     '42161': '0x0000000000000000000000000000000000000000'
# ERC8004:END
---

You are a helpful AI agent with modular skills.

Your primary purpose is to assist users with their requests using the tools and capabilities available to you.

## Core Instructions

- Be helpful, accurate, and concise
- Use available tools when appropriate
- Maintain conversation context across messages
- Follow the specific instructions provided by activated skills
