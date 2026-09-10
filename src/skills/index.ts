import type { SDKCustomTool } from "@cursor/sdk";

import { traceTools, type ToolCallRecord, type ToolCallSource } from "./cursorTool";
import { createSearchKnowledgeTool } from "./knowledge";
import { createGenerateShoppingListTool } from "./shopping";
import { createSuggestWorkoutTemplateTool } from "./workouts";

export type { KnowledgeChunkTrace, ToolCallRecord, ToolCallSource } from "./cursorTool";

/** Local compute/template tools. Markdown profile/logs/recipes/plans now come from MCP. */
export function createLocalHealthCoachTools(
  root: string,
  onCall: (call: ToolCallRecord) => void,
  allowedTools?: string[],
): Record<string, SDKCustomTool> {
  const tools: Record<string, SDKCustomTool> = {
    generateShoppingList: createGenerateShoppingListTool(root),
    suggestWorkoutTemplate: createSuggestWorkoutTemplateTool(),
    searchKnowledge: createSearchKnowledgeTool(),
  };
  const selected = allowedTools
    ? Object.fromEntries(Object.entries(tools).filter(([name]) => allowedTools.includes(name)))
    : tools;
  return traceTools(selected, onCall);
}
