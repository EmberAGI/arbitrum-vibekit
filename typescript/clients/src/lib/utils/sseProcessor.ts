/**
 * SSE (Server-Sent Events) Processing Utilities
 * 
 * Handles parsing and processing SSE streams from A2A agents
 */

export interface SSEProcessorCallbacks {
  onEvent: (event: any) => Promise<void>;
  onError: (error: any) => void;
}

/**
 * Processes an SSE stream and calls callbacks for each event
 */
export async function processSSEStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  callbacks: SSEProcessorCallbacks
): Promise<void> {
  const decoder = new TextDecoder();
  let buffer = "";
  let eventDataBuffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      
      if (done) {
        // Process any remaining event data
        if (eventDataBuffer.trim()) {
          try {
            const result = JSON.parse(eventDataBuffer.replace(/\n$/, ""));
            if (result.error) {
              callbacks.onError(result.error);
            } else {
              const event = result.result;
              if (event) {
                await callbacks.onEvent(event);
              }
            }
          } catch (error) {
            console.error("[SSEProcessor] Failed to parse final SSE data:", error);
          }
        }
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      // Process line by line
      let lineEndIndex;
      while ((lineEndIndex = buffer.indexOf("\n")) >= 0) {
        const line = buffer.substring(0, lineEndIndex).trim();
        buffer = buffer.substring(lineEndIndex + 1);

        if (line === "") {
          // Empty line means end of SSE event
          if (eventDataBuffer) {
            try {
              const result = JSON.parse(eventDataBuffer.replace(/\n$/, ""));

              if (result.error) {
                callbacks.onError(result.error);
              } else {
                const event = result.result;
                if (event) {
                  await callbacks.onEvent(event);
                }
              }
            } catch (error) {
              console.error("[SSEProcessor] Failed to parse SSE data:", error);
            }
            eventDataBuffer = "";
          }
        } else if (line.startsWith("data:")) {
          // Accumulate data lines
          eventDataBuffer += line.substring(5).trimStart() + "\n";
        }
      }
    }
  } catch (error) {
    console.error("[SSEProcessor] Stream processing error:", error);
    throw error;
  }
}






