import type { OsModule } from "../types";

export const habitsModule: OsModule = {
  name: "habits",
  description: "Трекер привычек: отметить, список, streak. Tools: read_habits / check_habit.",
  promptFile: "prompts/modules/habits.md",
  tools: ["read_profile", "read_recent_logs", "read_habits", "check_habit"],
};
