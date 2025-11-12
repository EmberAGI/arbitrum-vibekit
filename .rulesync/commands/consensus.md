---
description: 'Form a consensus answer using multiple AI models (o3, claude-opus-4, gemini-2.5-pro)'
targets: ["*"]
allowed-tools: ['Task', 'mcp__openrouter__chat_completion', 'TodoWrite', 'Read', 'Glob', 'Grep']
argument-hint: '<topic/problem/question to analyze>'
---

# Consensus Command

Runs **SIX parallel Tasks** to get intuition + analysis from three AI models.

## Models Used

- **OpenAI o3**
- **Anthropic Claude 4 Opus**
- **Google Gemini 2.5 Pro**

## Usage

```
/consensus <topic/problem/question>
```

## CRITICAL: Two-Phase Execution

### 🎯 PHASE 0: Query Clarification (if needed)

**Skip if query is already specific and clear**

Check for ambiguity:

- Vague comparisons ("better", "best") without context
- Missing constraints or scope
- Multiple interpretations possible

If clarification needed:

```
Before getting consensus, let me clarify:
- [2-4 focused questions]

Based on your input, I'll ask the models:
"[REFINED QUERY]"

Proceed? (Y/n)
```

### ⚡ PHASE 1: Get Intuitions (3 parallel Tasks)

Run these THREE Tasks simultaneously. **IMPORTANT: Each Task should ONLY call the mcp**openrouter**chat_completion tool and return the raw response. DO NOT analyze or synthesize within the Task.**

**Task 1: o3 Intuition**

```
Prompt: Call mcp__openrouter__chat_completion with these exact parameters and return ONLY the model's response:

model: "openai/o3"
messages: [{"role": "user", "content": "Hey, I'm curious - [TOPIC]. What do you honestly think? I want your genuine gut reaction and personal preference here."}]
temperature: 0.9
max_tokens: 2500
```

**Task 2: Claude Intuition**

```
Prompt: Call mcp__openrouter__chat_completion with these exact parameters and return ONLY the model's response:

model: "anthropic/claude-opus-4"
messages: [{"role": "user", "content": "Hey, I'm curious - [TOPIC]. What do you honestly think? I want your genuine gut reaction and personal preference here."}]
temperature: 0.9
max_tokens: 2500
```

**Task 3: Gemini Intuition**

```
Prompt: Call mcp__openrouter__chat_completion with these exact parameters and return ONLY the model's response:

model: "google/gemini-2.5-pro"
messages: [{"role": "user", "content": "Hey, I'm curious - [TOPIC]. What do you honestly think? I want your genuine gut reaction and personal preference here."}]
temperature: 0.9
max_tokens: 5000
```

### 🧠 PHASE 2: Get Analysis (3 parallel Tasks)

**WAIT for Phase 1 to complete, then run these tasks independently (do NOT include intuitions). IMPORTANT: Each Task should ONLY call the mcp**openrouter**chat_completion tool and return the raw response. DO NOT analyze or synthesize within the Task.**

**Task 4: o3 Analysis**

```
Prompt: Call mcp__openrouter__chat_completion with these exact parameters and return ONLY the model's response:

model: "openai/o3"
messages: [
  {"role": "system", "content": "You are an expert providing thorough analysis. Approach this with fresh analytical thinking."},
  {"role": "user", "content": "Topic: [TOPIC]\n\nContext: [RELEVANT_CONTEXT]\n\nProvide:\n1. Detailed analysis\n2. Key trade-offs\n3. Risks\n4. Devil's advocate critique of your own position\n5. Final recommendation"}
]
temperature: 0.3
max_tokens: 5000
```

**Task 5: Claude Analysis**

```
Prompt: Call mcp__openrouter__chat_completion with these exact parameters and return ONLY the model's response:

model: "anthropic/claude-opus-4"
messages: [
  {"role": "system", "content": "You are an expert providing thorough analysis. Approach this with fresh analytical thinking."},
  {"role": "user", "content": "Topic: [TOPIC]\n\nContext: [RELEVANT_CONTEXT]\n\nProvide:\n1. Detailed analysis\n2. Key trade-offs\n3. Risks\n4. Devil's advocate critique of your own position\n5. Final recommendation"}
]
temperature: 0.3
max_tokens: 5000
```

**Task 6: Gemini Analysis**

```
Prompt: Call mcp__openrouter__chat_completion with these exact parameters and return ONLY the model's response:

model: "google/gemini-2.5-pro"
messages: [
  {"role": "system", "content": "You are an expert providing thorough analysis. Approach this with fresh analytical thinking."},
  {"role": "user", "content": "Topic: [TOPIC]\n\nContext: [RELEVANT_CONTEXT]\n\nProvide:\n1. Detailed analysis\n2. Key trade-offs\n3. Risks\n4. Devil's advocate critique of your own position\n5. Final recommendation"}
]
temperature: 0.3
max_tokens: 10000
```

## 📊 PHASE 3: Synthesize Results

**After both phases complete, THINK HARD and create this report:**

```markdown
## Consensus Analysis: [Topic]

**Executive Summary**: [2-3 sentences]

### 💭 Intuitive Reactions

**o3**: [gut reaction]
**Claude**: [gut reaction]  
**Gemini**: [gut reaction]

### 🔍 Analytical Consensus

**Agreement Points**: [where models converged in analysis]
**Key Disagreements**: [where analyses diverged]
**Critical Insights**: [unique valuable points from analysis]

### 🤔 Intuition vs Analysis Comparison

**Alignment**: [Where intuitions matched analytical conclusions]
**Divergence**: [Where gut feelings differed from analysis]
**Implications**: [What the alignment/divergence tells us]

### 🎯 Final Recommendation

[Synthesized conclusion]
**Confidence**: [High/Medium/Low]

### ✅ Action Items

1. [concrete next step]
2. [concrete next step]
```

## Key Requirements

1. **ALWAYS run Phase 1 first** - Get intuitions before analysis
2. **Include intuitions in Phase 2** - Each model sees their own gut reaction
3. **Keep it concise** - Focus on actionable insights
4. **Handle errors gracefully** - If a model fails, proceed with others

## Context Gathering

Only gather context if directly relevant:

- Recent files from conversation
- Project docs (CLAUDE.md, README.md) if discussing project decisions
- Business requirements and constraints mentioned
- Technical implementation details if applicable
- Skip context for general/theoretical questions

## Error Handling

- **Model timeout**: 30s limit, proceed with available results
- **Model unavailable**: Note it and continue
- **Gemini token issues**: Increase to 2000/4000 if needed
- **NEVER switch models**: If a model fails (e.g., o3 requires API key), note the failure and continue with remaining models. DO NOT substitute with alternative models (e.g., o3-mini, gemini-2.0-flash-exp)
- **Use EXACT model IDs**: Always use the precise model IDs specified: "openai/o3", "anthropic/claude-opus-4", "google/gemini-2.5-pro"

## Edge Cases

- **Unanimous agreement**: Note strong consensus but explore blind spots
- **Complete disagreement**: Focus on understanding why models diverge
- **Ethical concerns**: Ensure all models address them appropriately
