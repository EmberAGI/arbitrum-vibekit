#!/bin/bash

# Log task completion info
{
    # Extract result summary from stdin payload
    if [ ! -t 0 ]; then
        PAYLOAD=$(cat)
        TASK_SESSION_ID=$(echo "$PAYLOAD" | jq -r '.session_id // "unknown"' 2>/dev/null)
        
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] TASK END - ${TASK_SESSION_ID:0:8}"
        
        # Extract token usage if available
        INPUT_TOKENS=$(echo "$PAYLOAD" | jq -r '.tool_response.usage.input_tokens // "?"' 2>/dev/null)
        OUTPUT_TOKENS=$(echo "$PAYLOAD" | jq -r '.tool_response.usage.output_tokens // "?"' 2>/dev/null)
        echo "  Tokens: ${INPUT_TOKENS} in / ${OUTPUT_TOKENS} out"
        
        # Extract the task response content
        RESPONSE=$(echo "$PAYLOAD" | jq -r '.tool_response.content // empty' 2>/dev/null)
        
        # Check if task had an error
        ERROR=$(echo "$PAYLOAD" | jq -r '.tool_response.error // empty' 2>/dev/null)
        if [ -n "$ERROR" ]; then
            echo "  Status: ERROR - ${ERROR:0:50}..."
        else
            echo "  Status: SUCCESS"
            # Show the response content if available
            if [ -n "$RESPONSE" ]; then
                echo "  Response:"
                # Indent the response for readability
                echo "$RESPONSE" | sed 's/^/    /'
            fi
        fi
    else
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] TASK END - unknown"
    fi
    echo "  ----------------------------------------"
    echo ""
} >> .vibecode/logs/task.log 2>&1