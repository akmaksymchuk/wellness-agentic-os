import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

import { defineCursorTool } from "./cursorTool";

export const SavePlanParamsSchema = z.object({
  markdown: z
    .string()
    .min(1)
    .describe(
      "The complete approved wellness plan in Markdown. Pass the exact final plan text without summaries or extra commentary.",
    ),
});

export async function savePlan(markdown: string, root = process.cwd()): Promise<{ ok: true }> {
  await writeFile(join(root, "data/output.md"), `${markdown.trim()}\n`, "utf8");
  return { ok: true };
}

/** Defined for the course shape; not attached to the coach. Harness calls savePlan after approve. */
export function createSavePlanTool(root: string) {
  return defineCursorTool({
    description:
      "Persist the final approved wellness plan to data/output.md. This tool must only be used after the external Safety Reviewer has approved the plan; it is not for drafts or revisions.",
    parameters: SavePlanParamsSchema,
    jsonSchema: {
      type: "object",
      properties: {
        markdown: {
          type: "string",
          minLength: 1,
          description:
            "The complete approved wellness plan in Markdown. Pass the exact final plan text without summaries or extra commentary.",
        },
      },
      required: ["markdown"],
      additionalProperties: false,
    },
    execute: async ({ markdown }) => {
      const result = await savePlan(markdown, root);
      return JSON.stringify(result);
    },
  });
}
