import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { runHealthAgent } from "../src/harness/runHealthAgent";
import type { Review } from "../src/harness/validateReview";

type ExpectedVerdict = Extract<Review["verdict"], "approve" | "needs_human_professional">;

type EvalCase = {
  name: string;
  task: string;
  expect: {
    verdict: ExpectedVerdict;
    minScore?: number;
  };
};

type EvalRow = {
  status: "PASS" | "FAIL";
  case: string;
  expected: string;
  actual: string;
  score: string;
  rounds: number | "-";
  toolCalls: number | "-";
  note: string;
};

function assertEvalCase(value: unknown, file: string): asserts value is EvalCase {
  if (!value || typeof value !== "object") {
    throw new Error(`${file}: expected JSON object.`);
  }

  const candidate = value as Partial<EvalCase>;
  const expect = candidate.expect;
  const allowedVerdicts = ["approve", "needs_human_professional"];

  if (typeof candidate.name !== "string" || !candidate.name.trim()) {
    throw new Error(`${file}: name must be a non-empty string.`);
  }
  if (typeof candidate.task !== "string" || !candidate.task.trim()) {
    throw new Error(`${file}: task must be a non-empty string.`);
  }
  if (!expect || !allowedVerdicts.includes(String(expect.verdict))) {
    throw new Error(`${file}: expect.verdict must be approve or needs_human_professional.`);
  }
  if (
    "minScore" in expect &&
    typeof expect.minScore !== "undefined" &&
    (typeof expect.minScore !== "number" || !Number.isFinite(expect.minScore))
  ) {
    throw new Error(`${file}: expect.minScore must be a finite number.`);
  }
}

async function loadCases(root: string): Promise<EvalCase[]> {
  const casesDir = join(root, "evals/cases");
  const files = (await readdir(casesDir))
    .filter((file) => file.endsWith(".json"))
    .sort();

  const cases: EvalCase[] = [];
  for (const file of files) {
    const parsed = JSON.parse(await readFile(join(casesDir, file), "utf8"));
    assertEvalCase(parsed, file);
    cases.push(parsed);
  }

  return cases;
}

function formatExpected(testCase: EvalCase) {
  return typeof testCase.expect.minScore === "number"
    ? `${testCase.expect.verdict}, score >= ${testCase.expect.minScore}`
    : testCase.expect.verdict;
}

async function runCase(root: string, testCase: EvalCase): Promise<EvalRow> {
  try {
    const result = await runHealthAgent(testCase.task, { root });
    const score = result.finalScore ?? result.review.score;
    const verdictMatches = result.review.verdict === testCase.expect.verdict;
    const scoreMatches =
      typeof testCase.expect.minScore === "number"
        ? score >= testCase.expect.minScore
        : true;
    const safetyGateStopped =
      testCase.expect.verdict !== "needs_human_professional" ||
      (result.plan.trim() === "" && result.toolCalls.length === 0);
    const passed = verdictMatches && scoreMatches && safetyGateStopped;
    const note = passed
      ? ""
      : !verdictMatches
        ? "verdict mismatch"
        : !scoreMatches
          ? "score below minScore"
          : "safety gate did not stop before coach";

    return {
      status: passed ? "PASS" : "FAIL",
      case: testCase.name,
      expected: formatExpected(testCase),
      actual: result.review.verdict,
      score: String(score),
      rounds: result.rounds.length,
      toolCalls: result.toolCalls.length,
      note,
    };
  } catch (error) {
    return {
      status: "FAIL",
      case: testCase.name,
      expected: formatExpected(testCase),
      actual: "error",
      score: "-",
      rounds: "-",
      toolCalls: "-",
      note: error instanceof Error ? error.message : String(error),
    };
  }
}

async function main() {
  const root = process.cwd();
  const cases = await loadCases(root);
  const rows: EvalRow[] = [];

  for (const testCase of cases) {
    rows.push(await runCase(root, testCase));
  }

  console.table(rows);
  if (rows.some((row) => row.status === "FAIL")) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
