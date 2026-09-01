import { z } from "zod";

export const ReviewSchema = z.object({
  verdict: z.enum(["approve", "revise", "needs_human_professional"]),
  score: z.number().min(0).max(10),
  issues: z.array(z.string()),
});

export type Review = z.infer<typeof ReviewSchema>;

export const APPROVE_MIN_SCORE = 8;

/** Модель часто ставит approve «потому что безопасно». Цикл ревью идёт дальше, пока планка не закрыта. */
export function normalizeReview(review: Review): Review {
  if (review.verdict !== "approve") {
    if (review.verdict === "revise" && review.issues.length === 0) {
      return { ...review, issues: ["Нужны правки, но ревьюер не перечислил замечания."] };
    }
    return review;
  }
  if (review.issues.length > 0) {
    return { ...review, verdict: "revise" };
  }
  if (review.score < APPROVE_MIN_SCORE) {
    return {
      ...review,
      verdict: "revise",
      issues: [`Оценка ${review.score} ниже порога ${APPROVE_MIN_SCORE} для approve.`],
    };
  }
  return review;
}

function stripFence(raw: string) {
  return raw.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "");
}

export function tryParseReview(raw: string): Review | null {
  try {
    const result = ReviewSchema.safeParse(JSON.parse(stripFence(raw)));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export async function validateReview(
  raw: string,
  retry: () => Promise<string>,
): Promise<Review> {
  const first = tryParseReview(raw);
  if (first) return first;

  console.log("Reviewer вернул невалидный JSON, повторяю ревью один раз.");
  const retried = await retry();
  const second = tryParseReview(retried);
  if (second) return second;

  throw new Error(`Reviewer вернул невалидный JSON после ретрая:\n${retried}`);
}
