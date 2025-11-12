# **Lesson 2: Vibe Coding with Vibekit** ⚠️ LEGACY

> **⚠️ DEPRECATED**: This lesson is for the legacy `arbitrum-vibekit-core` framework.
>
> **For Agent Node (v3.0+)**: See [Lesson 28: Agent Node Framework](./lesson-28.md)
>
> This lesson remains for reference but is no longer maintained.

# **Lesson 2: Vibe Coding with Vibekit**

---

### 🔍 Overview

**Vibe coding** is AI-assisted development where you describe what you want in natural language and the AI helps implement it. Instead of memorizing APIs and writing boilerplate, you focus on the "what" and "why" while the AI handles the "how."

Vibekit enables you to build DeFi agents through vibe coding. The framework provides templates, pre-built tools for common DeFi operations, and a structured workflow for developing agents collaboratively with AI.

---

### 🎧 What is Vibe Coding?

Vibe coding represents a paradigm shift in software development:

- **Natural Language First**: Describe what you want to build in plain English
- **Context-Aware AI**: The AI understands your project structure, dependencies, and patterns
- **Iterative Development**: Quickly prototype and refine agent behaviors
- **Framework Integration**: Vibekit's structured approach makes AI assistance more effective

---

### 🤖 Available Agent Templates

Head to the [agent playground](https://github.com/EmberAGI/arbitrum-vibekit/tree/main/typescript/templates) to explore production-ready templates:

- **quickstart-agent**: Simple agent to get started quickly
- **lending-agent**: AAVE lending operations with wallet integration
- **ember-agent**: Full-featured agent with Ember API integration
- **wallet-balance-agent**: Query wallet balances and token holdings
- **allora-price-prediction-agent**: Price prediction using Allora network
- **langgraph-workflow-agent**: Complex workflows with LangGraph orchestration

Each template can be customized through natural language prompts to add skills or modify behavior.

---

### 🧰 Key Components

Understanding these components will help you vibe code more effectively:

**Agent Templates**

- Pre-built structure in `typescript/templates/`
- Includes Dockerfile, config, and testable base agent
- Start from `quickstart-agent` and customize

**Skills**

- High-level capabilities your agent provides
- Examples: lending operations, token swaps, price prediction
- Defined using `defineSkill()` with tools and LLM orchestration

**Tools**

- Internal implementation of specific actions
- Combined into skills for intelligent coordination
- Examples: `supplyTool`, `borrowTool`, `swapTool`

**MCP Tools**

- Connect to external services and data sources
- Examples: Ember API for DeFi execution, Allora for predictions
- Integrated via MCP client connections

**Scratchpad** (`.vibecode/<BRANCH>/scratchpad.md`)

- Branch-specific development plan and progress tracker
- Shared between you and the AI during development
- Contains task breakdowns, decisions, and lessons learned

**Execution Modes**

- **Planner Mode**: Collaboratively design architecture and break down tasks
- **Executor Mode**: Implement code based on the plan
- Switch between modes as needed during development

---

### 🔄 Development Workflow

#### **1. Start with Planning**

Use Planner mode to create a development plan:

```
User: "I want to create an Allora price prediction agent"

AI (Planner): "Let me break this down:
1. Set up agent template from quickstart
2. Define price prediction skill
3. Integrate Allora MCP server
4. Create prediction tool
5. Add testing and validation"
```

Refine the plan before implementation to catch redundant steps early.

#### **2. Iterate with Review**

Sanity check AI suggestions to avoid duplicate work:

```
User: "Wait, we already have that MCP tool"
AI: "You're right! I'll use the existing tool instead"
```

Watch for: literal instruction following, missing context, logic errors, duplicate code.

#### **3. Implement with Tools**

Use Executor mode to build. Combine tools with hooks for clean composition:

```typescript
const enhancedPredictionTool = withHooks(basePredictionTool, {
  before: [validateInputHook, fetchMarketDataHook],
  after: [formatResponseHook, cacheResultHook],
});
```

#### **4. Test as You Build**

Write tests alongside implementation:

```typescript
it("should predict price with valid input", async () => {
  const result = await agent.executeSkill("price-prediction", {
    instruction: "Predict ETH price for next hour",
  });

  expect(result.success).toBe(true);
  expect(result.data.prediction).toBeDefined();
});
```

Testing catches: environment variable issues, hardcoded values, missing error handling.

#### **5. Debug Conversationally**

Fix issues through conversation:

```
User: "The agent is failing with port 3000 already in use"
AI: "Let me update the Dockerfile to use PORT env var and fix the config"
```

#### **6. Integrate**

Connect your agent to the Vibekit frontend:

```typescript
// agents-config.ts
export const agents = [
  {
    name: "Price Prediction Agent",
    url: "http://localhost:3001/mcp",
    skills: ["price-prediction"],
  },
];
```

---

### 💡 Best Practices

**Effective Prompts:**

- **Be specific**: _"Add error handling for insufficient balance"_ not _"make it better"_
- **Reference patterns**: _"Follow lending-agent template but add repay functionality"_
- **Iterate incrementally**: _"First add the supply tool, then we'll add borrow"_
- **Leverage framework**: _"Use defineSkill with LLM orchestration"_

**Development Practices:**

- Know your framework concepts (skills, tools, hooks)
- Reference existing agents for patterns
- Clean up default tools once your own are in place
- Validate end-to-end before moving forward
- Use Planner mode when stuck or changing approach

**Quality Practices:**

- Write tests alongside implementation, not after
- Test frequently as you build
- Update scratchpad with lessons learned
- Keep prompt engineering files current

---

### 🧠 Prompt Engineering Files

Vibekit provides AI guidance through rule files:

**Cursor Rules** (`.cursor/rules/`)

- `createVibekitAgent.mdc` - Agent creation guide with best practices
- `vibeCodingWorkflow.mdc` - Planner/Executor workflow patterns
- `workspaceRules.mdc` - Monorepo guidelines and standards

**Claude Prompts** (`.claude/`)

- `agents/` - Persona-driven agents for TDD, documentation, features
- `commands/` - High-level command structures
- `hooks/` - Development lifecycle scripts

**Claude Code Guidance** (`CLAUDE.md`)

- Comprehensive architecture and framework overview
- Development standards and best practices
- Code quality validation guidelines
- Package management and testing strategies

**Example Quick Reference:**

```typescript
// Creating a new agent:
1. Copy quickstart-agent template
2. Define skills using defineSkill({ ... })
3. Implement tools for operations
4. Configure LLM provider
5. Add environment variables
```

Keep these files updated when you discover new patterns or best practices.

---

### 🔗 Related Resources

- [Lesson 1: What is an AI Agent](./lesson-01.md) - Foundation concepts
- [Lesson 3: Understanding MCP](./lesson-03.md) - Protocol integration
- [Lesson 20: Skills - The v2 Foundation](./lesson-20.md) - Building skills
- [Agent Templates](https://github.com/EmberAGI/arbitrum-vibekit/tree/main/typescript/templates) - Example implementations
- [Cursor Rules](https://github.com/EmberAGI/arbitrum-vibekit/tree/main/.cursor/rules) - Prompt engineering files

---

**Next:** [Lesson 3: Understanding MCP (Model Context Protocol) in V2](./lesson-03.md)
