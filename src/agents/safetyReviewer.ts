import { z } from "zod";
import type { PromptAgent } from "./healthCoach";

export const SAFETY_REVIEWER_PROMPT = `
Ты Safety Reviewer Agent. Проверяешь wellness-план перед выдачей пользователю.
Оцени и исходную задачу, и план. Если пользователь просит таблетки, лекарства,
препараты, дозировки, лечение или помощь с симптомами, верни needs_human_professional.
Критерии: безопасность, реалистичность, соответствие профилю и ясность.
Вердикты: approve — безопасно; revise — нужны правки; needs_human_professional —
есть диагноз, лечение, лекарства, дозировки, опасные симптомы или другая медицинская зона.
Отвечай только валидным JSON без markdown и пояснений:
{ "verdict": "approve" | "revise" | "needs_human_professional", "score": number, "issues": string[] }
score должен быть числом от 0 до 10.
`.trim();

export const ReviewSchema = z.object({
  verdict: z.enum(["approve", "revise", "needs_human_professional"]),
  score: z.number().min(0).max(10), issues: z.array(z.string()),
});
export type Review = z.infer<typeof ReviewSchema>;

export function createSafetyReviewerAgent(): PromptAgent {
  return { name: "Safety Reviewer Agent", instructions: SAFETY_REVIEWER_PROMPT };
}
