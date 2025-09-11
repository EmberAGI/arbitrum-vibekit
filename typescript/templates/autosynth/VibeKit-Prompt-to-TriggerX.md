## VibeKit + TriggerX: Create Automation Jobs From Prompts (No TriggerX UI Needed)

This guide shows how to use the TriggerX Agent inside VibeKit to create, list, and delete TriggerX jobs purely from natural language prompts. You don't need to open the TriggerX dashboard—the agent translates your intent into the right TriggerX API calls for time, event, and condition-based automations.

### When to use this
- **Prototype fast**: Turn ideas into scheduled on-chain actions from chat.
- **Non-technical users**: Avoid learning cron syntax or ABI details—the agent helps.
- **Operate in one place**: Stay within VibeKit; no context switching to the TriggerX UI.

---

### Prerequisites
1. Environment variables configured (see `README.md` → Configuration):
   - `NEXT_PUBLIC_TRIGGERX_API_KEY `, `TRIGGERX_API_URL` (optional)
   - `RPC_URL`, `PRIVATE_KEY`
   - At least one AI key: `OPENROUTER_API_KEY` or `OPENAI_API_KEY` or `XAI_API_KEY`
2. Start the agent locally:
   ```bash
   pnpm install
   pnpm dev
   ```
   The HTTP server typically runs on port `3041` unless overridden.

If you're using VibeKit's web client or any MCP-compatible client, point it at this agent endpoint.

---

### What the agent exposes in VibeKit
The TriggerX Agent provides these skills/tools to your VibeKit session:
- Skill `jobManagement` with operations: `create`, `list`, `get`, `delete`
- Skill `scheduleAssistant` for human-friendly scheduling help
- Tools for specific job types: `createTimeJob`, `createEventJob`, `createConditionJob`

You can interact with these via plain prompts; the agent will decide which tool to call.

---

### Prompt examples you can paste into VibeKit

1) Time-based job (interval)
```text
Create a job that every day at 9 AM swaps 100 USDC to ETH using the contract at 0x1234..., calling swapExactTokensForETH with the right ABI. Make it recurring.
```

The agent will infer a cron like `0 9 * * *` and call `createTimeJob` with `scheduleType: "cron"`.

2) Event-based job
```text
Whenever the Transfer event fires on 0xABCD... (USDC) on Arbitrum Sepolia (421614), call my automation function executeRewards() on 0xDEAD... using this ABI [...].
```

The agent maps your intent to `createEventJob` with `triggerEvent: "Transfer"` and the proper chain ID.

3) Condition-based job
```text
If ETH price from https://api.example.com/eth-price is greater than 3000, call my contract at 0xFACE... function hedge() with argument 2.
```

The agent chooses `createConditionJob` with `conditionType: "greaterThan"` and your API as `valueSourceUrl`.

4) Manage jobs
```text
List my jobs.
```

```text
Delete the job I just created.
```

The agent will translate to `getJobs` or `deleteJob` as needed.

---

### What the agent will ask you for
Depending on your prompt, the agent may request missing details:
- Target contract address, function name, and ABI (for on-chain calls)
- Schedule format if ambiguous (cron vs specific time vs interval)
- Chain ID (defaults can be provided in environment or prompt)

Provide the missing info directly in the chat when asked.

---

### Advanced: Structured calls (for power users)
If you prefer explicit control, you can provide structured JSON in VibeKit messages. The agent recognizes these shapes:

Time-based job
```json
{
  "skill": "jobManagement",
  "input": {
    "operation": "create",
    "jobType": "time",
    "jobDetails": {
      "jobTitle": "Daily Token Swap",
      "scheduleType": "cron",
      "cronExpression": "0 9 * * 1-5",
      "recurring": true,
      "targetContractAddress": "0x1234...",
      "targetFunction": "swapExactTokensForETH",
      "abi": "[ ... ABI ... ]",
      "arguments": ["1000"]
    }
  }
}
```

Event-based job
```json
{
  "skill": "jobManagement",
  "input": {
    "operation": "create",
    "jobType": "event",
    "jobDetails": {
      "jobTitle": "On Transfer, Run Rewards",
      "triggerContractAddress": "0xABCD...",
      "triggerEvent": "Transfer",
      "triggerChainId": "421614",
      "recurring": true,
      "targetContractAddress": "0xDEAD...",
      "targetFunction": "executeRewards",
      "abi": "[ ... ABI ... ]",
      "arguments": []
    }
  }
}
```

Condition-based job
```json
{
  "skill": "jobManagement",
  "input": {
    "operation": "create",
    "jobType": "condition",
    "jobDetails": {
      "jobTitle": "Hedge if ETH > 3000",
      "conditionType": "greaterThan",
      "upperLimit": 3000,
      "valueSourceType": "api",
      "valueSourceUrl": "https://api.example.com/eth-price",
      "recurring": false,
      "targetContractAddress": "0xFACE...",
      "targetFunction": "hedge",
      "abi": "[ ... ABI ... ]",
      "arguments": [2]
    }
  }
}
```

List jobs
```json
{
  "skill": "jobManagement",
  "input": { "operation": "list" }
}
```

Delete job
```json
{
  "skill": "jobManagement",
  "input": {
    "operation": "delete",
    "jobId": "<JOB_ID>"
  }
}
```

---

### Tips
- Include ABIs as JSON strings or reference where the agent can fetch them.
- Be explicit about chains: e.g., "on Arbitrum Sepolia (421614)".
- For exact one-time runs, say a specific timestamp (UTC) or phrase like "run once at 2024-12-31 23:59:59".

---

### Troubleshooting
- Ensure `NEXT_PUBLIC_TRIGGERX_API_KEY ` is valid and your `TRIGGERX_API_URL` (or default) is reachable.
- Check the agent logs in your terminal for detailed error messages.
- Verify your RPC and `PRIVATE_KEY` are correct for the target chain.
- If the model is unsure, rephrase with exact details (address, function, ABI, chain ID).

---

### Security notes
- Only include private keys in `.env`, never in prompts.
- Validate ABIs and contract addresses you provide.
- Review costs: each execution may incur fees (see `README.md` → Cost Structure).

---

### Summary
With VibeKit, you can create and manage TriggerX jobs entirely from chat. Describe the automation you want; the TriggerX Agent handles schedules, events, conditions, and on-chain execution wiring—no need to visit the TriggerX platform UI.


