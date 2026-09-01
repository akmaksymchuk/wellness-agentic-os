import { readFile } from "node:fs/promises";
import { join } from "node:path";

/** Смена версии подхватывает prompts/<name>.<version>.md без правок оркестратора. */
export const ACTIVE_PROMPTS = {
  coach: "v2",
  reviewer: "v2",
} as const;

export type PromptVersions = {
  coach: string;
  reviewer: string;
};

export async function loadPrompt(root: string, name: string, version: string): Promise<string> {
  const filePath = join(root, "prompts", `${name}.${version}.md`);
  try {
    return (await readFile(filePath, "utf8")).trim();
  } catch {
    throw new Error(`Не найден промпт ${name}.${version}.md`);
  }
}
