import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { runHealthAgent } from "../src/harness/runHealthAgent";
import type { RunTrace } from "../src/harness/traceRun";

type ComparableValue = string | number;

function formatPromptVersions(value: unknown): string {
  if (!value || typeof value !== "object") return "-";
  const versions = value as Record<string, unknown>;
  return Object.entries(versions)
    .map(([name, version]) => `${name}:${String(version)}`)
    .join(", ");
}

function formatToolCalls(value: unknown): string {
  if (!Array.isArray(value) || !value.length) return "-";
  return value
    .map((toolCall) => {
      if (!toolCall || typeof toolCall !== "object") return "unknown";
      const item = toolCall as Record<string, unknown>;
      const name = typeof item.name === "string" ? item.name : "unknown";
      if (item.args && typeof item.args === "object") {
        return `${name}(${JSON.stringify(item.args)})`;
      }
      return typeof item.details === "string" ? `${name}(${item.details})` : name;
    })
    .join(", ");
}

function formatScore(value: number | null): ComparableValue {
  return typeof value === "number" ? value : "null";
}

function row(
  metric: string,
  oldValue: ComparableValue,
  newValue: ComparableValue,
) {
  return {
    metric,
    old: oldValue,
    new: newValue,
    diff: oldValue === newValue ? "" : "changed",
  };
}

async function readTrace(path: string): Promise<RunTrace> {
  const raw = await readFile(path, "utf8");
  const parsed = JSON.parse(raw) as Partial<RunTrace>;

  if (typeof parsed.task !== "string" || !parsed.task.trim()) {
    throw new Error("Trace must contain a non-empty task.");
  }

  return parsed as RunTrace;
}

async function main() {
  const traceArg = process.argv[2];
  if (!traceArg) {
    throw new Error("Usage: npm run replay runs/run-XXX.json");
  }

  const tracePath = resolve(process.cwd(), traceArg);
  const oldTrace = await readTrace(tracePath);
  const newRun = await runHealthAgent(oldTrace.task);

  console.log(`Replay: ${traceArg}`);
  console.log(`Task: ${oldTrace.task}`);
  console.table([
    row("verdict", oldTrace.verdict, newRun.review.verdict),
    row("score", formatScore(oldTrace.finalScore), formatScore(newRun.finalScore)),
    row("rounds", oldTrace.rounds.length, newRun.rounds.length),
    row("toolCalls", formatToolCalls(oldTrace.toolCalls), formatToolCalls(newRun.toolCalls)),
    row(
      "promptVersions",
      formatPromptVersions(oldTrace.promptVersions),
      formatPromptVersions(newRun.promptVersions),
    ),
  ]);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
