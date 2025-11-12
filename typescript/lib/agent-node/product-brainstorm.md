## Project Overview

### Phase I

- Ritual inference integration & diagram
- Frontend will allow user to select a single agent to connect to from list
  - Scans directory structure to detect agents
  - If there’s only one agent, you are dropped directly into the UI without seeing the selection list
  - Agent configurations move from typescript source files to config files (md, mdc, json, yaml, and/or taml)
- **NOTE:** User / Manager separation of roles
  - User is the manager (phase I)
  - Manager is not the user (phase II)
- GMX agent will provide a conversational interface to GMX directly using tools, prompts elicitations, and completions
  - Create required UI elements similar to GMX
- Agent will create and manage per-user smart contract wallets (vault)
- Application will enable monitoring of agent transactions, and general wallet balances
- App will allow direct fund management (deposits & withdrawals)

### Phase II

- Agent will enable a fund manager to perform manual strategy
- Monitoring agent performance & notifications
- User and agent defined policies
  - Some policies will be agent defined and required and others will be configuration by user

**Parallel Phases**

### Phase III

- Manager is not the user roll out
- OC specific management UI

### Phase IV

- Agent will manage a delta-neutral strategy using Allora price prediction

## Core Features

- Direct conversational and GUI-drive interface to GMX
- Smart contract wallet creation and fund deposit capabilities
- Transaction monitoring and performance tracking with visual charts
- Status reports and notifications when the agent takes actions (e.g., rebalancing)
  - Agent will continuously send activity updates and elicitations
    - Elicitations are used when human input is required
    - Activity updates represent agent activities
- Agent will have a single focused session with a slightly hidden session history menu
  - Auto compacting will occur at 20% (80k) context window (400k tokens max) consumption. Summary of previous session + previous summary will be prepended to new session context.
- UI similar to "Alloc8" with inline position rendering
- Market and Limit orders + leverage (coming soon WIP= TP/SL, Stop market, TWAP )

## Product Requirements

- Distinction between “agent dashboard” and inline artifacts (components)
  - _Artifacts are LLM controlled UI elements. We should not use this language for frontend client controlled UI elements._
  - Transaction history for the agent as dashboard component
  - Wallet balance information as dashboard component
  - Artifacts and dashboards should include interactive elements (buttons for actions)

## Technical Requirements

- MCP resources should perform live updates on frontend (confirmed as possible)
  - Resource subscriptions
- Wallet balance updates may require polling or event-based system (whatever is easiest)
- 7710 support through MetaMask Delegation Toolkit (MMDT)
- Per-user agent smart wallet deployed as MMDT wallet
- A2A over MCP. MCP is the outer connection layer.
  - Need to determine proper tool mapping. Do we need multiple tools surrounding Task management? Do we only need a task concept and no message agent concept?
- Internal agent MCP prompts, resources and elicitations are proxies based upon specific policies for each
  - Prompts are elevated n-hops to human by default. Config option to hide.
  - Resources are always elevated n-hops to frontend client
  - elicitations are always elevated to n-1 hops recursively until answered by LLM or elevated to human
