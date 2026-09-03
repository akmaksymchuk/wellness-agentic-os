import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

import { defineCursorTool } from "./cursorTool";

export const GetRecentLogParamsSchema = z.object({
  days: z
    .number()
    .int()
    .min(1)
    .max(30)
    .describe(
      "How many of the most recent dated diary entries to return. Use 3-7 for normal planning unless the user asks for a different range.",
    ),
});

type LogSection = {
  date: string;
  content: string;
};

function splitDatedSections(markdown: string): LogSection[] {
  const headingPattern = /^##\s+(\d{4}-\d{2}-\d{2})\s*$/gm;
  const headings = Array.from(markdown.matchAll(headingPattern));

  return headings
    .map((heading, index) => {
      const start = heading.index ?? 0;
      const end = headings[index + 1]?.index ?? markdown.length;
      return {
        date: heading[1],
        content: markdown.slice(start, end).trim(),
      };
    })
    .filter((section) => section.content.length > 0);
}

export async function getRecentLog(days: number, root = process.cwd()): Promise<string> {
  const rawLog = await readFile(join(root, "data/log.md"), "utf8");
  const sections = splitDatedSections(rawLog);
  if (sections.length === 0) return rawLog.trim();

  return sections
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-days)
    .map((section) => section.content)
    .join("\n\n");
}

export function createGetRecentLogTool(root: string) {
  return defineCursorTool({
    description:
      "Read the last N dated entries from the user's local wellness diary in data/log.md. Use this when the user mentions their log, recent days, yesterday/today patterns, tomorrow planning based on history, energy, sleep, meals, hydration, cravings, steps, or workouts. Return only the recent entries needed for the task, not the full diary.",
    parameters: GetRecentLogParamsSchema,
    jsonSchema: {
      type: "object",
      properties: {
        days: {
          type: "integer",
          minimum: 1,
          maximum: 30,
          description:
            "How many of the most recent dated diary entries to return. Use 3-7 for normal planning unless the user asks for a different range.",
        },
      },
      required: ["days"],
      additionalProperties: false,
    },
    execute: async ({ days }) => getRecentLog(days, root),
  });
}
