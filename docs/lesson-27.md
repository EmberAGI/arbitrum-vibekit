---
title: "Agent Performance Tuning"
category: "advanced"
difficulty: "hard"
duration: "23 minutes"
prerequisites: ["lesson-26"]
next_lesson: "lesson-28"
framework_version: "3.0+ (Agent Node)"
last_updated: "2025-10-15"
tags: ["performance","tuning","optimization"]
---

# **Lesson 27: Frontend Integration and User Context Patterns**

---

### 🔍 Overview

Integrating v2 agents with frontend applications requires careful consideration of user context passing, tool orchestration, and state management. Unlike backend-to-backend communication, frontend integration must handle user authentication, wallet connections, and multi-tool workflows through the UI layer.

Understanding these patterns is crucial for building seamless user experiences where agents can access user-specific data (wallet addresses, chain selections) and coordinate complex multi-step operations initiated from the frontend.

---

### 🎯 Core Frontend Integration Challenge

When integrating agents with frontends, the key challenge is that user context (wallet address, selected chain, authentication state) must be explicitly passed to agent tools, and multi-tool orchestration that happens automatically in agent-to-agent communication must be handled at the frontend level.

#### **The Context Challenge**

```ts
// ❌ Backend agent context - automatically available
const result = await supplyTool(args, context); // context includes everything

// ✅ Frontend integration - context must be passed explicitly
const result = await agentClient.callSkill('lending-operations', {
  instruction: 'Supply 100 USDC',
  walletAddress: user.wallet.address, // Must be passed explicitly
  chainId: user.selectedChain, // Must be passed explicitly
});
```

---

### 🔧 Frontend System Prompt Patterns

The frontend's LLM system prompt should include instructions for proper user context passing:

```ts
// frontend/lib/ai/prompts.ts
export const AGENT_INTEGRATION_PROMPT = `
You are a DeFi assistant with access to specialized agent tools. When calling agent tools:

1. ALWAYS pass userAddress and chainId parameters when available
2. For multi-step operations, call tools in sequence and pass results between them
3. Handle user confirmations for transactions before executing

Available context:
- User wallet address: {{userAddress}}
- Selected chain: {{chainId}}
- Connected wallet: {{walletConnected}}

When users request multi-step operations like "analyze my portfolio then rebalance":
1. First call portfolio-analysis tool with userAddress
2. Based on results, call rebalancing tools with specific parameters
3. Present transaction details before execution
`;
```

---

### 🌐 Frontend Integration Architecture

#### **Agent Client Setup**

Set up MCP clients for agent communication:

```ts
// frontend/lib/agents/client.ts
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/transports/streamableHTTP.js';

export class FrontendAgentClient {
  private clients: Map<string, Client> = new Map();

  async initializeAgents(agentConfigs: AgentConfig[]): Promise<void> {
    for (const config of agentConfigs) {
      const transport = new StreamableHTTPClientTransport(new URL(config.url + '/mcp'));

      const client = new Client(
        { name: 'vibekit-frontend', version: '1.0.0' },
        { capabilities: {} }
      );

      await client.connect(transport);
      this.clients.set(config.name, client);
    }
  }

  async callAgentSkill(agentName: string, skillName: string, args: any): Promise<any> {
    const client = this.clients.get(agentName);
    if (!client) {
      throw new Error(`Agent ${agentName} not initialized`);
    }

    return await client.callTool(skillName, args);
  }

  getAvailableAgents(): string[] {
    return Array.from(this.clients.keys());
  }
}
```

#### **User Context Provider**

Manage user context and pass it to agent calls:

```ts
// frontend/lib/context/UserContext.tsx
export interface UserContext {
  wallet: {
    address: string | null;
    connected: boolean;
    chainId: number;
  };
  preferences: {
    defaultSlippage: number;
    autoApprove: boolean;
  };
}

export const UserContextProvider: React.FC<{ children: React.ReactNode }> = ({
  children
}) => {
  const [userContext, setUserContext] = useState<UserContext>({
    wallet: { address: null, connected: false, chainId: 42161 },
    preferences: { defaultSlippage: 0.5, autoApprove: false }
  });

  // Wallet connection logic
  const connectWallet = async () => {
    try {
      const accounts = await window.ethereum.request({
        method: 'eth_requestAccounts'
      });
      const chainId = await window.ethereum.request({
        method: 'eth_chainId'
      });

      setUserContext(prev => ({
        ...prev,
        wallet: {
          address: accounts[0],
          connected: true,
          chainId: parseInt(chainId, 16)
        }
      }));
    } catch (error) {
      console.error('Wallet connection failed:', error);
    }
  };

  return (
    <UserContext.Provider value={{ userContext, connectWallet, setUserContext }}>
      {children}
    </UserContext.Provider>
  );
};
```

---

### 🎭 Multi-Tool Orchestration Patterns

Since frontend LLMs call each agent skill separately (unlike internal agent orchestration), the system prompt must guide proper tool chaining:

#### **Sequential Tool Calls**

```ts
// frontend/lib/agents/orchestration.ts
export class FrontendOrchestrator {
  constructor(
    private agentClient: FrontendAgentClient,
    private userContext: UserContext
  ) {}

  async executePortfolioOptimization(instruction: string): Promise<any> {
    if (!this.userContext.wallet.connected) {
      throw new Error('Wallet must be connected for portfolio operations');
    }

    // Step 1: Analyze current portfolio
    const analysis = await this.agentClient.callAgentSkill(
      'portfolio-agent',
      'portfolio-analysis',
      {
        instruction: 'Analyze my current portfolio',
        userAddress: this.userContext.wallet.address,
        chainId: this.userContext.wallet.chainId,
      }
    );

    // Step 2: Get rebalancing recommendations
    const recommendations = await this.agentClient.callAgentSkill(
      'portfolio-agent',
      'rebalancing-recommendations',
      {
        instruction: 'Provide rebalancing recommendations',
        userAddress: this.userContext.wallet.address,
        currentPortfolio: analysis.portfolio,
        riskTolerance: 'moderate',
      }
    );

    // Step 3: Execute rebalancing trades
    const trades = await this.agentClient.callAgentSkill('trading-agent', 'execute-trades', {
      instruction: 'Execute recommended trades',
      userAddress: this.userContext.wallet.address,
      trades: recommendations.recommendedTrades,
      slippage: this.userContext.preferences.defaultSlippage,
    });

    return {
      analysis,
      recommendations,
      trades,
      summary: `Portfolio optimization complete: ${trades.executedTrades.length} trades executed`,
    };
  }
}
```

#### **Conditional Tool Chaining**

```ts
// frontend/lib/agents/conditionalOrchestration.ts
export class ConditionalOrchestrator {
  async executeDeFiStrategy(strategy: string, userContext: UserContext): Promise<any> {
    const baseArgs = {
      userAddress: userContext.wallet.address,
      chainId: userContext.wallet.chainId,
    };

    switch (strategy) {
      case 'yield-farming':
        return await this.executeYieldFarming(baseArgs);

      case 'liquidity-provision':
        return await this.executeLiquidityProvision(baseArgs);

      case 'lending-optimization':
        return await this.executeLendingOptimization(baseArgs);

      default:
        throw new Error(`Unknown strategy: ${strategy}`);
    }
  }

  private async executeYieldFarming(baseArgs: any): Promise<any> {
    // Check current positions
    const positions = await this.agentClient.callAgentSkill('portfolio-agent', 'get-positions', {
      ...baseArgs,
      instruction: 'Get my current DeFi positions',
    });

    // Find yield opportunities
    const opportunities = await this.agentClient.callAgentSkill(
      'yield-agent',
      'find-opportunities',
      { ...baseArgs, currentPositions: positions.positions }
    );

    // Execute if profitable
    if (opportunities.bestOpportunity.apy > 5.0) {
      return await this.agentClient.callAgentSkill('yield-agent', 'execute-yield-strategy', {
        ...baseArgs,
        opportunity: opportunities.bestOpportunity,
        instruction: 'Execute the highest yield opportunity',
      });
    }

    return { message: 'No profitable yield opportunities found' };
  }
}
```

---

### 🔐 Authentication and Security Patterns

#### **Wallet-Based Authentication**

```ts
// frontend/lib/auth/walletAuth.ts
export class WalletAuthProvider {
  async authenticateUser(walletAddress: string): Promise<AuthToken> {
    // Sign authentication message
    const message = `Authenticate for Vibekit at ${Date.now()}`;
    const signature = await window.ethereum.request({
      method: 'personal_sign',
      params: [message, walletAddress],
    });

    // Verify with backend and get token
    const response = await fetch('/api/auth/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, signature, walletAddress }),
    });

    return response.json();
  }

  async callAuthenticatedAgent(
    agentName: string,
    skillName: string,
    args: any,
    authToken: AuthToken
  ): Promise<any> {
    // Add authentication to agent calls
    return await this.agentClient.callAgentSkill(agentName, skillName, {
      ...args,
      _auth: {
        token: authToken.token,
        signature: authToken.signature,
      },
    });
  }
}
```

#### **Permission-Based Access**

```ts
// frontend/lib/permissions/agentPermissions.ts
export class AgentPermissionManager {
  private permissions: Map<string, Permission[]> = new Map();

  async checkPermission(agentName: string, action: string, userAddress: string): Promise<boolean> {
    const userPermissions = this.permissions.get(userAddress) || [];

    return userPermissions.some(
      permission =>
        permission.agent === agentName && permission.actions.includes(action) && !permission.expired
    );
  }

  async requestPermission(
    agentName: string,
    actions: string[],
    userAddress: string
  ): Promise<Permission> {
    // Show permission dialog to user
    const approved = await this.showPermissionDialog(agentName, actions);

    if (!approved) {
      throw new Error('Permission denied by user');
    }

    const permission: Permission = {
      agent: agentName,
      actions,
      userAddress,
      granted: new Date(),
      expires: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      expired: false,
    };

    const userPermissions = this.permissions.get(userAddress) || [];
    userPermissions.push(permission);
    this.permissions.set(userAddress, userPermissions);

    return permission;
  }
}
```

---

### 🎨 UI Integration Patterns

#### **Agent Skill Components**

Create reusable components for agent interactions:

```tsx
// frontend/components/AgentSkillButton.tsx
interface AgentSkillButtonProps {
  agentName: string;
  skillName: string;
  skillDescription: string;
  requiredParams: string[];
  onResult: (result: any) => void;
}

export const AgentSkillButton: React.FC<AgentSkillButtonProps> = ({
  agentName,
  skillName,
  skillDescription,
  requiredParams,
  onResult,
}) => {
  const { userContext } = useUserContext();
  const [loading, setLoading] = useState(false);
  const [args, setArgs] = useState<Record<string, any>>({});

  const canExecute = useMemo(() => {
    return requiredParams.every(param =>
      param === 'userAddress' ? userContext.wallet.connected : !!args[param]
    );
  }, [args, userContext, requiredParams]);

  const handleExecute = async () => {
    if (!canExecute) return;

    setLoading(true);
    try {
      const result = await agentClient.callAgentSkill(agentName, skillName, {
        ...args,
        userAddress: userContext.wallet.address,
        chainId: userContext.wallet.chainId,
      });

      onResult(result);
    } catch (error) {
      console.error('Agent skill execution failed:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="agent-skill-card">
      <h3>{skillName}</h3>
      <p>{skillDescription}</p>

      {requiredParams
        .filter(param => param !== 'userAddress' && param !== 'chainId')
        .map(param => (
          <input
            key={param}
            placeholder={param}
            value={args[param] || ''}
            onChange={e => setArgs(prev => ({ ...prev, [param]: e.target.value }))}
          />
        ))}

      <button onClick={handleExecute} disabled={!canExecute || loading}>
        {loading ? 'Executing...' : 'Execute'}
      </button>
    </div>
  );
};
```

#### **Transaction Confirmation UI**

```tsx
// frontend/components/TransactionConfirmation.tsx
interface TransactionConfirmationProps {
  transaction: TransactionData;
  onConfirm: () => void;
  onCancel: () => void;
}

export const TransactionConfirmation: React.FC<TransactionConfirmationProps> = ({
  transaction,
  onConfirm,
  onCancel,
}) => {
  return (
    <div className="transaction-confirmation">
      <h3>Confirm Transaction</h3>

      <div className="transaction-details">
        <div>
          <label>Action:</label>
          <span>{transaction.description}</span>
        </div>

        <div>
          <label>To:</label>
          <span>{transaction.to}</span>
        </div>

        <div>
          <label>Value:</label>
          <span>{transaction.value} ETH</span>
        </div>

        <div>
          <label>Gas Estimate:</label>
          <span>{transaction.gasEstimate} gwei</span>
        </div>
      </div>

      <div className="actions">
        <button onClick={onCancel}>Cancel</button>
        <button onClick={onConfirm} className="primary">
          Confirm & Sign
        </button>
      </div>
    </div>
  );
};
```

---

### 📊 State Management Integration

#### **Redux Integration**

```ts
// frontend/store/agentSlice.ts
interface AgentState {
  connectedAgents: AgentCard[];
  activeOperations: OperationStatus[];
  results: Record<string, any>;
  loading: Record<string, boolean>;
}

export const agentSlice = createSlice({
  name: 'agents',
  initialState,
  reducers: {
    setConnectedAgents: (state, action) => {
      state.connectedAgents = action.payload;
    },

    startOperation: (state, action) => {
      const { operationId, agentName, skillName } = action.payload;
      state.loading[operationId] = true;
      state.activeOperations.push({
        id: operationId,
        agent: agentName,
        skill: skillName,
        status: 'running',
        startTime: Date.now(),
      });
    },

    completeOperation: (state, action) => {
      const { operationId, result } = action.payload;
      state.loading[operationId] = false;
      state.results[operationId] = result;

      const operation = state.activeOperations.find(op => op.id === operationId);
      if (operation) {
        operation.status = 'completed';
        operation.endTime = Date.now();
      }
    },
  },
});
```

---

### ✅ Summary

Frontend integration with v2 agents requires:

- **Explicit Context Passing**: User wallet address and chain ID must be passed to every agent call
- **Multi-Tool Orchestration**: Frontend must chain agent skills since internal orchestration isn't available
- **Authentication Patterns**: Wallet-based auth and permission management for secure agent access
- **UI Integration**: Reusable components for agent interactions and transaction confirmations
- **State Management**: Proper handling of async agent operations and results

The key insight is that frontend integration requires more explicit orchestration compared to agent-to-agent communication, but provides better user experience and control.

> "Frontend integration makes agents accessible. User context makes them personal."

| Pattern                   | Purpose                    | Implementation                     |
| ------------------------- | -------------------------- | ---------------------------------- |
| **Context Passing**       | Provide user-specific data | Explicit parameters in every call  |
| **Tool Chaining**         | Multi-step operations      | Sequential agent skill calls       |
| **Permission Management** | Secure access control      | Wallet-based authentication        |
| **UI Components**         | Reusable interactions      | React components for agent skills  |
| **State Management**      | Track operations           | Redux/Zustand for async operations |
