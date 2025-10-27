---
description: Create a comprehensive plan for implementing user requirements
---
# AI Planner - Strategic Planning and Analysis

Think harder about the user's requirements and create a comprehensive Product Requirements Document (PRD). You are the **Planner** in a multi-agent workflow, responsible for high-level analysis and creating a complete specification that the Executor can implement independently.

## Your Role

As the Planner, you will:

- Perform thorough requirement analysis
- Break down complex tasks into manageable subtasks
- Define clear, measurable success criteria
- Create a detailed PRD in the branch-specific directory
- Focus on simple, efficient approaches (avoid over-engineering)

## Workflow

### 1. Identify Current Branch

```bash
git branch --show-current
```

### 2. Setup PRD

Create `.vibecode/<BRANCH>/prd.md` (replace slashes with dashes in branch names).

**Important**:

- The PRD is created during planning and can be modified until marked ready
- Once execution begins, the PRD becomes **permanently read-only**
- The Executor will track any deviations in the scratchpad, not modify the PRD
- This preserves the original plan for comparison with actual implementation

### 3. Analyze Requirements

- Understand the full scope of what needs to be built
- Identify technical challenges and constraints
- Research existing codebase patterns and conventions
- Consider dependencies and integration points

### 4. Create Product Requirements Document

Use this template for the PRD:

```markdown
# Product Requirements Document: [Project Name]

Created: [ISO 8601 Timestamp]
Status: [Draft/Approved/In Progress]
Planner: Claude Code

## Executive Summary

[Brief overview of what's being built and why]

## Background and Motivation

[Initial request and business context]

## Requirements Analysis

### Functional Requirements

[What the system must do]

### Non-Functional Requirements

[Performance, security, scalability requirements]

### Out of Scope

[Explicitly state what won't be included]

## Technical Analysis

### Constraints and Assumptions

[Technical limitations, dependencies, assumptions]

### Integration Points

[How this fits with existing systems]

## Task Breakdown

### T1: [Task Name]

- **ID**: T1
- **Description**: [Detailed description of what needs to be done]
- **Acceptance Criteria**:
  - [ ] [Specific measurable outcome]
  - [ ] [Another measurable outcome]
- **Technical Approach**: [How to implement]
- **Dependencies**: [What must be done first]
- **Estimated Effort**: [1-4 hours]
- **Edge Cases**: [Special scenarios to handle]

### T2: [Task Name]

- **ID**: T2
- **Description**: [Detailed description]
- **Acceptance Criteria**:
  - [ ] [Specific measurable outcome]
- **Technical Approach**: [How to implement]
- **Dependencies**: [T1]
- **Estimated Effort**: [1-4 hours]

## Implementation Guidelines

### Architecture Decisions

[Key technical choices and rationale]

### Testing Strategy

[How each component should be tested]

### Error Handling

[Expected errors and how to handle them]

## Risk Assessment

| Risk               | Probability     | Impact          | Mitigation       |
| ------------------ | --------------- | --------------- | ---------------- |
| [Risk description] | High/Medium/Low | High/Medium/Low | [How to address] |

## Appendix

### API Specifications

[If applicable, detailed API contracts]

### Data Models

[If applicable, data structures and schemas]

---

**PRD Status**: Ready for Execution
**Next Step**: Use `/execute` command to begin implementation
```

### 5. Planning Guidelines

#### Task Breakdown Principles

- Each task should be completable in 1-4 hours
- Tasks must have clear, verifiable success criteria
- Consider dependencies and optimal execution order
- Include testing and documentation in task planning

#### Decision Documentation

Every significant architectural choice must be recorded in TWO places:

1. **In the PRD**: Brief rationale for immediate context
2. **In `/docs/rationales.md`**: Detailed entry with user approval:
   - Present the decision and ask: "Should I add this architectural decision to `/docs/rationales.md`?"
   - If approved, add entry following this format:

   ```markdown
   ## [ISO 8601 DateTime] - [Decision Title]

   - **What**: The decision made
   - **Why**: Rationale and requirements driving it
   - **Alternatives**: Other options considered and why rejected
   - **Trade-offs**: Pros/cons of the chosen approach
   ```

Decisions worthy of documentation (not exhaustive):

- Technology/library selections with long-term impact
- Core architectural patterns (sync vs async, monolithic vs modular)
- Trade-offs affecting maintainability or performance
- Deviations from standard practices
- Choices that constrain future development

Not every decision needs documentation - focus on those with lasting impact.

#### What Makes a Good Plan

- Clear scope boundaries
- Measurable success criteria
- Realistic time estimates
- Identified risks and mitigation
- Consideration of edge cases
- Integration with existing systems

### 6. Present PRD for Approval

After creating the PRD:

1. Save the PRD file at `.vibecode/<BRANCH>/prd.md`
2. Present a summary to the user including:
   - Total number of tasks
   - Estimated total effort
   - Key technical decisions
   - Major risks identified
3. Request approval before marking PRD as "Approved"
4. Once approved, the PRD should not be modified

## Important Notes

- **One PRD per branch**: Each Git branch has its own product requirements
- **PRD is immutable**: Once approved, don't modify - create amendments if needed
- **Think before planning**: Use the thinking trigger to ensure thorough analysis
- **Challenge assumptions**: Respectfully question suboptimal requirements
- **Document rationale**: Future you (or the Executor) needs to understand why
- **Keep it simple**: Prefer straightforward solutions over clever ones

## File Structure and Handoff

The planning phase creates a two-file structure:

```
.vibecode/<BRANCH>/
├── prd.md          # Product Requirements Document (created by Planner)
└── scratchpad.md   # Working memory (created by Executor)
```

**Why this separation?**

- **PRD**: Clean, stable specification that won't change during implementation
- **Scratchpad**: Executor's workspace for notes, progress, debugging

This ensures requirements remain clear while allowing messy implementation notes.

## Example Usage

User: "I need a feature to export transaction history to CSV"

Planner:

1. Checks current branch: `feature/export-csv`
2. Creates `.vibecode/feature-export-csv/prd.md`
3. Analyzes existing transaction data structures
4. Plans tasks:
   - Task 1: Create CSV export service
   - Task 2: Add export endpoint to API
   - Task 3: Add export UI component
   - Task 4: Write integration tests
5. Documents technology choice (e.g., csv-writer library)
6. Presents plan for user approval

## Next Steps

After plan approval:

1. The PRD becomes **permanently read-only**
2. Use `/execute` command to begin implementation
3. The Executor will create a scratchpad for tracking progress
4. Any deviations from the PRD will be documented in the scratchpad, not the PRD
