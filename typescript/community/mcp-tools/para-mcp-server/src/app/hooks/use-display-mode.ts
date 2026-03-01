/**
 * Source: https://github.com/openai/openai-apps-sdk-examples/tree/main/src
 */

import type { DisplayMode } from "./types";
import { useOpenAIGlobal } from "./use-openai-global";

/**
 * Hook to get the current display mode of the widget.
 *
 * @returns The current display mode ("pip" | "inline" | "fullscreen") or null if not available
 *
 * @example
 * ```tsx
 * const displayMode = useDisplayMode();
 * if (displayMode === "fullscreen") {
 *   // Render full UI
 * }
 * ```
 */
export function useDisplayMode(): DisplayMode | null {
  return useOpenAIGlobal("displayMode");
}
