import type { PromptAgent } from "./healthCoach";

export function createSafetyReviewerAgent(instructions: string): PromptAgent {
  return { name: "Safety Reviewer Agent", instructions };
}
