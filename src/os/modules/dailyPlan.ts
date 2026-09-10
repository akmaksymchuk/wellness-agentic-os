import type { OsModule } from "../types";

export const dailyPlanModule: OsModule = {
  name: "dailyPlan",
  description:
    "День / завтра / расписание: еда + движение + сон в одном плане. Пример: «составь план на завтра».",
  promptFile: "prompts/modules/dailyPlan.md",
  tools: [
    "read_profile",
    "read_recent_logs",
    "searchKnowledge",
    "suggestWorkoutTemplate",
    "list_recipes",
    "weather",
  ],
};
