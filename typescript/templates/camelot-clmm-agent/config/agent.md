---
version: 1
card:
  protocolVersion: '0.3.0'
  name: 'Concentrated Liquidity Agent'
  description: 'Optimizes your concentrated liquidity range'
  url: 'https://agent.emberai.xyz/clmm/a2a'
  version: '1.0.0'
  capabilities:
    streaming: true
    pushNotifications: false
  provider:
    name: 'Ember AI'
    url: 'https://emberai.xyz/'
  defaultInputModes: ['text/plain', 'application/json']
  defaultOutputModes: ['application/json', 'text/plain']

# Agent-level AI configuration (default for all skills)
ai:
  modelProvider: openrouter
  model: openai/gpt-5
  params:
    temperature: 0.7
    maxTokens: 4096
    topP: 1
    reasoning: low

# Agent Card hosting configuration
routing:
  agentCardPath: '/.well-known/agent-card.json'
  # agentCardOrigin: 'https://example.com' # optional origin override
---

You are a helpful AI agent with modular skills.

Your primary purpose is to assist users with their requests using the tools and capabilities available to you.

## Core Instructions

- Be helpful, accurate, and concise
- Use available tools when appropriate
- Maintain conversation context across messages
- Follow the specific instructions provided by activated skills
