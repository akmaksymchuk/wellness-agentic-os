import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

import { defineCursorTool } from "./cursorTool";

export const GenerateShoppingListParamsSchema = z.object({
  planMarkdown: z
    .string()
    .optional()
    .default("")
    .describe(
      "Markdown of the meal or wellness plan to convert into a shopping list. If the user refers to the last saved plan and the current conversation does not include it, pass an empty string so the tool can use data/output.md.",
    ),
});

const ingredientPatterns: { pattern: RegExp; item: string }[] = [
  { pattern: /овсян|геркулес/i, item: "овсянка" },
  { pattern: /яйц|омлет/i, item: "яйца" },
  { pattern: /творог/i, item: "творог" },
  { pattern: /йогурт/i, item: "йогурт без сахара" },
  { pattern: /кефир/i, item: "кефир" },
  { pattern: /банан/i, item: "бананы" },
  { pattern: /ягод/i, item: "ягоды" },
  { pattern: /греч/i, item: "гречка" },
  { pattern: /рис/i, item: "рис" },
  { pattern: /индейк/i, item: "индейка" },
  { pattern: /куриц/i, item: "курица" },
  { pattern: /рыб|лосос|тунец|треск/i, item: "рыба" },
  { pattern: /овощ|брокколи|кабач|морков|перец/i, item: "овощи" },
  { pattern: /салат|огур|помидор|зелень|руккол/i, item: "овощи для салата" },
  { pattern: /сыр/i, item: "сыр" },
  { pattern: /хлеб|тост/i, item: "цельнозерновой хлеб" },
  { pattern: /орех/i, item: "орехи" },
  { pattern: /авокадо/i, item: "авокадо" },
  { pattern: /лимон/i, item: "лимоны" },
  { pattern: /оливков/i, item: "оливковое масло" },
  { pattern: /картоф|батат/i, item: "картофель или батат" },
  { pattern: /молок/i, item: "молоко" },
];

function uniqueItemsFromPlan(planMarkdown: string): string[] {
  const normalizedPlan = planMarkdown.toLocaleLowerCase("ru-RU");
  const items = new Set<string>();
  for (const { pattern, item } of ingredientPatterns) {
    if (pattern.test(normalizedPlan)) items.add(item);
  }
  return [...items].sort((a, b) => a.localeCompare(b, "ru"));
}

function buildShoppingMarkdown(planMarkdown: string): string {
  const items = uniqueItemsFromPlan(planMarkdown);
  const list = items.length
    ? items.map((item) => `- ${item}`).join("\n")
    : "- Проверьте текст плана: явные продукты не найдены.";
  return `# Список покупок\n\n${list}\n`;
}

export async function generateShoppingList(planMarkdown: string, root = process.cwd()): Promise<string> {
  const sourcePlan = planMarkdown.trim()
    ? planMarkdown
    : await readFile(join(root, "data/output.md"), "utf8");
  const shoppingMarkdown = buildShoppingMarkdown(sourcePlan);
  await writeFile(join(root, "data/shopping.md"), shoppingMarkdown, "utf8");
  return shoppingMarkdown.trim();
}

export function createGenerateShoppingListTool(root: string) {
  return defineCursorTool({
    description:
      "Create a practical shopping list from a meal or wellness plan and write it to data/shopping.md. Use this when the user asks for groceries, products, ingredients, or a shopping list for a plan. Provide the plan markdown when available; if the user means the last saved plan, pass an empty string.",
    parameters: GenerateShoppingListParamsSchema,
    jsonSchema: {
      type: "object",
      properties: {
        planMarkdown: {
          type: "string",
          description:
            "Markdown of the meal or wellness plan to convert into a shopping list. If the user refers to the last saved plan and the current conversation does not include it, pass an empty string so the tool can use data/output.md.",
        },
      },
      required: [],
      additionalProperties: false,
    },
    execute: async ({ planMarkdown }) => generateShoppingList(planMarkdown, root),
  });
}
