import type { OsModule } from "../types";

/** Fallback when router confidence is below the threshold. Not offered as a router choice. */
export const generalModule: OsModule = {
  name: "general",
  description: "Текущее поведение Health Coach без специализации.",
  promptFile: "",
  tools: [
    "read_profile",
    "read_recent_logs",
    "list_recipes",
    "generateShoppingList",
    "suggestWorkoutTemplate",
    "searchKnowledge",
    "weather",
    "filesystem",
    "notion",
  ],
};
