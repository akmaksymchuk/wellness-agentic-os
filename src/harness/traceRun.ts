import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ToolCallRecord } from "../skills";
import type { PromptVersions } from "./promptVersions";
import type { RoundState } from "./rounds";
import type { Review } from "./validateReview";

export type TraceableRunResult = {
  promptVersions: PromptVersions;
  model: string;
  rounds: RoundState[];
  toolCalls: ToolCallRecord[];
  finalScore: number;
  review: Review;
  durationMs: number;
};

export type RunTraceRound = {
  round: number;
  planExcerpt: string;
  review: Review;
};

export type RunTrace = {
  runId: string;
  task: string;
  promptVersions: PromptVersions;
  model: string;
  rounds: RunTraceRound[];
  toolCalls: ToolCallRecord[];
  finalScore: number;
  verdict: Review["verdict"];
  durationMs: number;
  createdAt: string;
};

export type TraceRunParams = {
  root: string;
  task: string;
  result: TraceableRunResult;
};

function timestampForFile(date: Date) {
  return date.toISOString().replace(/[:.]/g, "-");
}

export function buildRunTrace(
  task: string,
  result: TraceableRunResult,
  createdAt = new Date(),
): RunTrace {
  const runId = `run-${timestampForFile(createdAt)}`;

  return {
    runId,
    task,
    promptVersions: result.promptVersions,
    model: result.model,
    rounds: result.rounds.map((round) => ({
      round: round.round,
      planExcerpt: round.plan.slice(0, 500),
      review: round.review,
    })),
    toolCalls: result.toolCalls,
    finalScore: result.finalScore,
    verdict: result.review.verdict,
    durationMs: result.durationMs,
    createdAt: createdAt.toISOString(),
  };
}

export async function traceRun({
  root,
  task,
  result,
}: TraceRunParams): Promise<string | null> {
  const trace = buildRunTrace(task, result);
  const runsDir = join(root, "runs");
  const tracePath = join(runsDir, `${trace.runId}.json`);

  try {
    await mkdir(runsDir, { recursive: true });
    await writeFile(tracePath, `${JSON.stringify(trace, null, 2)}\n`, "utf8");
    return tracePath;
  } catch (error) {
    console.warn(
      "Не удалось сохранить trace запуска:",
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}
