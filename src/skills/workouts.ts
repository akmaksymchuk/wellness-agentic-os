import { z } from "zod";

import { defineCursorTool } from "./cursorTool";

export const SuggestWorkoutTemplateParamsSchema = z.object({
  goal: z
    .string()
    .min(1)
    .describe(
      "The user's workout goal in their own words, for example: recovery, boxing support, strength, mobility, low-back comfort, or light cardio.",
    ),
});

const workoutTemplates = {
  recovery:
    "Легкое восстановление: 20-30 минут прогулки в разговорном темпе, 8 минут мягкой мобилизации бедер и грудного отдела, 2 подхода по 45 секунд дыхания лежа.",
  boxing:
    "Поддержка бокса: 8 минут разминки суставов, 4 раунда по 2 минуты скакалки или shadow boxing, 3 подхода по 10 приседаний и 8 отжиманий, 5 минут заминки.",
  strength:
    "Силовой минимум: 3 круга без отказа: 10 приседаний, 8 румынских тяг с легким весом, 8 отжиманий, 12 тяг резинки, отдых 60-90 секунд.",
  mobility:
    "Мобилити и поясница: 2 круга по 6 cat-cow, 8 bird-dog на сторону, 30 секунд hip flexor stretch на сторону, 8 ягодичных мостов, 5 минут спокойной ходьбы.",
} as const;

export function suggestWorkoutTemplate(goal: string): string {
  const normalizedGoal = goal.toLocaleLowerCase("ru-RU");
  if (/бокс|раунд|скакал|вынослив/i.test(normalizedGoal)) return workoutTemplates.boxing;
  if (/сил|мышц|тонус|зал|подсуш/i.test(normalizedGoal)) return workoutTemplates.strength;
  if (/поясн|спин|мобил|растяж/i.test(normalizedGoal)) return workoutTemplates.mobility;
  return workoutTemplates.recovery;
}

export function createSuggestWorkoutTemplateTool() {
  return defineCursorTool({
    description:
      "Return one safe, prewritten wellness workout template that matches the user's stated goal. Use this for activity sections when the user asks for a workout, movement block, boxing support, low-back-friendly mobility, recovery day, or simple strength template. The templates are non-medical and avoid diagnosis or treatment.",
    parameters: SuggestWorkoutTemplateParamsSchema,
    jsonSchema: {
      type: "object",
      properties: {
        goal: {
          type: "string",
          minLength: 1,
          description:
            "The user's workout goal in their own words, for example: recovery, boxing support, strength, mobility, low-back comfort, or light cardio.",
        },
      },
      required: ["goal"],
      additionalProperties: false,
    },
    execute: ({ goal }) => suggestWorkoutTemplate(goal),
  });
}
