import type { OsModule } from "../types";

export const shoppingListModule: OsModule = {
  name: "shoppingList",
  description: "Список покупок, что купить, закупка.",
  promptFile: "prompts/modules/shoppingList.md",
  tools: ["read_profile", "list_recipes", "generateShoppingList", "searchKnowledge"],
};
