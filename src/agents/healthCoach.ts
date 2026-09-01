export type PromptAgent = {
  name: string;
  instructions: string;
};

export function createHealthCoachAgent(instructions: string): PromptAgent {
  return { name: "Health Coach Agent", instructions };
}
