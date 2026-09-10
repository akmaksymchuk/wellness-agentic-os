import type { OsModule } from "../types";

export const trainingModule: OsModule = {
  name: "training",
  description: "Тренировка, зал, шаги, разминка, программа. Не боль и не реабилитация.",
  promptFile: "prompts/modules/training.md",
  tools: [
    "read_profile",
    "read_recent_logs",
    "searchKnowledge",
    "suggestWorkoutTemplate",
    "weather",
  ],
};
