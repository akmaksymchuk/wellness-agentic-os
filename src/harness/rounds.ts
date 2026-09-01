import type { Review } from "./validateReview";

export type RoundState = {
  round: number;
  plan: string;
  review: Review;
};

export function createRoundLog() {
  const rounds: RoundState[] = [];

  return {
    record(plan: string, review: Review): RoundState {
      const state: RoundState = { round: rounds.length + 1, plan, review };
      rounds.push(state);
      return state;
    },
    snapshot(): RoundState[] {
      return rounds.slice();
    },
  };
}
