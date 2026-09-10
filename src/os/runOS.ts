import { readFile } from "node:fs/promises";
import { join } from "node:path";

import {
  runHealthAgent,
  type RunHealthAgentOptions,
  type RunHealthAgentResult,
} from "../harness/runHealthAgent";
import { ACTIVE_PROMPTS, loadPrompt } from "../harness/promptVersions";
import { classifyIntent, resolveRoutedModule } from "./router";
import type { OsModule } from "./types";

export type RunOSOptions = RunHealthAgentOptions;

async function loadOverlay(root: string, promptFile: string): Promise<string> {
  const relative = promptFile.trim();
  if (!relative) return "";
  return (await readFile(join(root, relative), "utf8")).trim();
}

export async function composeCoachPrompt(root: string, module: OsModule): Promise<string> {
  const base = await loadPrompt(root, "healthCoach", ACTIVE_PROMPTS.coach);
  const overlay = await loadOverlay(root, module.promptFile);
  if (!overlay) return base;
  return `${base}\n\n## Специализация модуля ${module.name}\n${overlay}`;
}

export async function runOS(task: string, options: RunOSOptions = {}): Promise<RunHealthAgentResult> {
  const root = options.root ?? process.cwd();
  const intent = await classifyIntent(task, { root });
  const module = resolveRoutedModule(intent);

  options.onEvent?.({
    type: "module",
    module: module.name,
    confidence: intent.confidence,
  });

  const coachPrompt = await composeCoachPrompt(root, module);

  return runHealthAgent(task, {
    ...options,
    root,
    coachPrompt,
    allowedTools: module.tools,
    module: module.name,
    intentConfidence: intent.confidence,
  });
}
