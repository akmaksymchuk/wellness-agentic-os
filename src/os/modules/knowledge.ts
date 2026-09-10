import type { OsModule } from "../types";

export const knowledgeModule: OsModule = {
  name: "knowledge",
  description: "«Найди в базе», правило из knowledge, общий вопрос без плана на день.",
  promptFile: "prompts/modules/knowledge.md",
  tools: ["read_profile", "searchKnowledge"],
};
