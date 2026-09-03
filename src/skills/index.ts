import type { SDKCustomTool } from "@cursor/sdk";

import { traceTools, type ToolCallRecord } from "./cursorTool";

export type { ToolCallRecord };
import { createGetRecentLogTool } from "./logs";
import { createSavePlanTool, savePlan } from "./plans";
import { createGetProfileTool } from "./profile";
import { createListFavoriteRecipesTool } from "./recipes";
import { createGenerateShoppingListTool } from "./shopping";
import { createSuggestWorkoutTemplateTool } from "./workouts";

export function createHealthCoachTools(
  root: string,
  onCall: (call: ToolCallRecord) => void,
): Record<string, SDKCustomTool> {
  return traceTools(
    {
      getProfile: createGetProfileTool(root),
      getRecentLog: createGetRecentLogTool(root),
      generateShoppingList: createGenerateShoppingListTool(root),
      suggestWorkoutTemplate: createSuggestWorkoutTemplateTool(),
      listFavoriteRecipes: createListFavoriteRecipesTool(root),
    },
    onCall,
  );
}

export { createSavePlanTool, savePlan };
