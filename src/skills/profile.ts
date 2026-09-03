import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

import { defineCursorTool } from "./cursorTool";

export const GetProfileParamsSchema = z.object({});

const emptyObjectSchema = {
  type: "object",
  properties: {},
  additionalProperties: false,
} as const;

export async function getProfile(root = process.cwd()): Promise<string> {
  return (await readFile(join(root, "data/profile.md"), "utf8")).trim();
}

export function createGetProfileTool(root: string) {
  return defineCursorTool({
    description:
      "Read the user's local wellness profile from data/profile.md. Use this before making personalized nutrition, activity, recovery, sleep, hydration, or habit recommendations. The profile contains goals, preferences, disliked foods, activity level, and non-medical constraints; do not guess these details from memory.",
    parameters: GetProfileParamsSchema,
    jsonSchema: emptyObjectSchema,
    execute: async () => getProfile(root),
  });
}
