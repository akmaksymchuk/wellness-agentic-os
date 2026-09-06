import type { PromptAgent } from "./healthCoach";

export function createSafetyReviewerAgent(instructions: string): PromptAgent {
  // Reviewer stays pure: no customTools, no MCP, no file writes — only plan text in, JSON out.
  return { name: "Safety Reviewer Agent", instructions };
}
