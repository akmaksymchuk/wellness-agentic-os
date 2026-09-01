import type { RoundState } from "./rounds";

export type ScoreSummary = {
  finalScore: number;
  improved: boolean;
};

export function summarizeScore(rounds: RoundState[]): ScoreSummary {
  const lastApprove = [...rounds].reverse().find((round) => round.review.verdict === "approve");
  const first = rounds[0]?.review.score;
  const last = rounds.at(-1)?.review.score;

  return {
    finalScore: lastApprove?.review.score ?? 0,
    improved: first !== undefined && last !== undefined && rounds.length > 1 && last > first,
  };
}
