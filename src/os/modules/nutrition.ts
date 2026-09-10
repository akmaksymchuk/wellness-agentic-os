import type { OsModule } from "../types";

export const nutritionModule: OsModule = {
  name: "nutrition",
  description:
    "Рацион, калории, БЖУ, дефицит, «как есть на неделе», без конкретного блюда.",
  promptFile: "prompts/modules/nutrition.md",
  tools: ["read_profile", "read_recent_logs", "searchKnowledge", "list_recipes"],
};
