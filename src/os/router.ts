import { z } from "zod";
import { config as loadDotenv } from "dotenv";
import { join } from "node:path";

import { completeText } from "../harness/completeText";
import { getOsModule, routableOsModules } from "./modules";
import { generalModule } from "./modules/general";
import type { ClassifiedIntent, OsModule, OsModuleName } from "./types";

export const INTENT_CONFIDENCE_THRESHOLD = 0.6;
export const DEFAULT_ROUTER_MODEL = "composer-2.5";

const IntentSchema = z.object({
  module: z.string().min(1),
  confidence: z.number().min(0).max(1),
});

const ROUTABLE_NAMES = new Set<string>(routableOsModules.map((module) => module.name));

function routerModel(): string {
  return process.env.CURSOR_ROUTER_MODEL?.trim() || DEFAULT_ROUTER_MODEL;
}

function extractJsonObject(raw: string): unknown {
  const fenced = raw.match(/\{[\s\S]*\}/);
  return JSON.parse(fenced?.[0] ?? raw);
}

function toIntent(module: OsModuleName, confidence: number): ClassifiedIntent {
  return { module, confidence };
}

export function resolveRoutedModule(intent: ClassifiedIntent): OsModule {
  if (intent.confidence < INTENT_CONFIDENCE_THRESHOLD) return generalModule;
  return getOsModule(intent.module);
}

export async function classifyIntent(task: string, options: { root?: string } = {}): Promise<ClassifiedIntent> {
  const root = options.root ?? process.cwd();
  loadDotenv({ path: join(root, ".env"), quiet: true });

  const apiKey = process.env.CURSOR_API_KEY;
  if (!apiKey) throw new Error("Добавь CURSOR_API_KEY в .env");

  const catalog = routableOsModules
    .map((module) => `- ${module.name}: ${module.description}`)
    .join("\n");

  const instructions = [
    "Ты классификатор намерения wellness-OS.",
    "Выбери ровно один модуль из списка. Не выбирай general.",
    "Правила:",
    "1. Один модуль, самый узкий подходящий.",
    "2. Блюдо / ужин / рецепт → recipes, не nutrition и не dailyPlan.",
    "3. План на завтра или на день → dailyPlan, даже если внутри есть еда и тренировка.",
    "4. Медицинские формулировки не меняют схему: всё равно выбери ближайший модуль.",
    "Верни только JSON вида {\"module\":\"recipes\",\"confidence\":0.86}.",
  ].join("\n");

  const userMessage = `Задача:\n${task}\n\nМодули:\n${catalog}`;

  try {
    const raw = await completeText({
      root,
      apiKey,
      model: routerModel(),
      agentName: "Intent Router",
      instructions,
      userMessage,
    });
    const parsed = IntentSchema.parse(extractJsonObject(raw));
    if (!ROUTABLE_NAMES.has(parsed.module)) {
      return toIntent("general", 0);
    }
    return toIntent(parsed.module as OsModuleName, parsed.confidence);
  } catch {
    return toIntent("general", 0);
  }
}
