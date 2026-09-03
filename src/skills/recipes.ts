import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

import { defineCursorTool } from "./cursorTool";

export const ListFavoriteRecipesParamsSchema = z.object({});

export async function listFavoriteRecipes(root = process.cwd()): Promise<string> {
  return (await readFile(join(root, "data/recipes.md"), "utf8")).trim();
}

export function createListFavoriteRecipesTool(root: string) {
  return defineCursorTool({
    description:
      "Read data/recipes.md with the user's favorite simple meals. Use this when the user asks for recipe ideas, meal variety, tasty breakfasts, familiar foods, or a meal plan that should reuse preferred recipes instead of inventing everything from scratch.",
    parameters: ListFavoriteRecipesParamsSchema,
    jsonSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    execute: async () => listFavoriteRecipes(root),
  });
}
