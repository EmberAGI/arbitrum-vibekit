#!/bin/bash

# Extract task details from stdin payload
if [ ! -t 0 ]; then
    PAYLOAD=$(cat)
    TASK_SESSION_ID=$(echo "$PAYLOAD" | jq -r '.session_id // "unknown"' 2>/dev/null)
    DESCRIPTION=$(echo "$PAYLOAD" | jq -r '.tool_input.description // "No description"' 2>/dev/null)
    PROMPT=$(echo "$PAYLOAD" | jq -r '.tool_input.prompt // "No prompt"' 2>/dev/null | head -c 100)
    
    # Build the complete log entry as a single string
    LOG_ENTRY="[$(date '+%Y-%m-%d %H:%M:%S')] TASK START - ${TASK_SESSION_ID:0:8}
  Description: $DESCRIPTION
  Prompt: ${PROMPT}...
  Model: ${ANTHROPIC_SMALL_FAST_MODEL:-not set} (not the actual subagent model)
  PWD: $(pwd)
"
else
    LOG_ENTRY="[$(date '+%Y-%m-%d %H:%M:%S')] TASK START - unknown
"
fi

# Write the complete log entry atomically
echo "$LOG_ENTRY" >> .vibecode/logs/task.log 2>&1