import type { OsModule } from "../types";

export const recipesModule: OsModule = {
  name: "recipes",
  description:
    "Что приготовить сейчас / на приём пищи, рецепт, ингредиенты. Пример: «что приготовить на ужин». Важнее nutrition, если просят конкретное блюдо.",
  promptFile: "prompts/modules/recipes.md",
  tools: ["read_profile", "list_recipes", "searchKnowledge"],
};
