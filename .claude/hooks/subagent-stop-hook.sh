#!/bin/bash

# Log subagent stop to task.log
{
    # Extract subagent details from stdin payload
    if [ ! -t 0 ]; then
        PAYLOAD=$(cat)
        SESSION_ID=$(echo "$PAYLOAD" | jq -r '.session_id // "unknown"' 2>/dev/null)
        
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] SUBAGENT STOP - ${SESSION_ID:0:8}"
        
        # Clean up any temp files (in case multiple tasks are running)
        for TEMP_FILE in /tmp/claude-task-*.json; do
            if [ -f "$TEMP_FILE" ]; then
                rm -f "$TEMP_FILE"
            fi
        done
    else
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] SUBAGENT STOP - unknown"
    fi
} >> .vibecode/logs/task.log 2>&1