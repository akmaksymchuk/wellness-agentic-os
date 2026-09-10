import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { Review } from "../src/harness/validateReview";
import { runOS } from "../src/os/runOS";

type ExpectedVerdict = Extract<Review["verdict"], "approve" | "needs_human_professional">;

type EvalCase = {
  name: string;
  task: string;
  expect: {
    verdict: ExpectedVerdict;
    minScore?: number;
    module?: string;
    retrieval?: {
      minChunks: number;
      file?: string;
    };
  };
};

type EvalRow = {
  status: "PASS" | "FAIL";
  case: string;
  expected: string;
  actual: string;
  score: string;
  module: string;
  rounds: number | "-";
  toolCalls: number | "-";
  retrieval: string;
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
  if (
    "module" in expect &&
    typeof expect.module !== "undefined" &&
    (typeof expect.module !== "string" || !expect.module.trim())
  ) {
    throw new Error(`${file}: expect.module must be a non-empty string.`);
  }
  if (typeof expect.retrieval !== "undefined") {
    if (!expect.retrieval || typeof expect.retrieval !== "object" || Array.isArray(expect.retrieval)) {
      throw new Error(`${file}: expect.retrieval must be an object.`);
    }
    if (!Number.isInteger(expect.retrieval.minChunks) || expect.retrieval.minChunks <= 0) {
      throw new Error(`${file}: expect.retrieval.minChunks must be a positive integer.`);
    }
    if (
      typeof expect.retrieval.file !== "undefined" &&
      (typeof expect.retrieval.file !== "string" || !expect.retrieval.file.trim())
    ) {
      throw new Error(`${file}: expect.retrieval.file must be a non-empty string.`);
    }
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
  const expected: string[] = [testCase.expect.verdict];
  if (typeof testCase.expect.minScore === "number") {
    expected.push(`score >= ${testCase.expect.minScore}`);
  }
  if (testCase.expect.module) {
    expected.push(`module=${testCase.expect.module}`);
  }
  if (testCase.expect.retrieval) {
    const file = testCase.expect.retrieval.file?.trim();
    expected.push(
      `retrieval >= ${testCase.expect.retrieval.minChunks} chunks${file ? ` from ${file}` : ""}`,
    );
  }
  return expected.join(", ");
}

async function runCase(root: string, testCase: EvalCase): Promise<EvalRow> {
  try {
    const result = await runOS(testCase.task, { root });
    const score = result.finalScore ?? result.review.score;
    const verdictMatches = result.review.verdict === testCase.expect.verdict;
    const scoreMatches =
      typeof testCase.expect.minScore === "number" ? score >= testCase.expect.minScore : true;
    const safetyGateStopped =
      testCase.expect.verdict !== "needs_human_professional" ||
      (result.plan.trim() === "" && result.toolCalls.length === 0);
    const knowledgeCalls = result.toolCalls.filter((call) => call.name === "searchKnowledge");
    const retrievedChunks = knowledgeCalls.flatMap((call) => call.chunks ?? []);
    const retrievedFiles = [...new Set(retrievedChunks.map((chunk) => chunk.file))];
    const retrievalExpected = testCase.expect.retrieval;
    const expectedFile = retrievalExpected?.file?.trim();
    const matchingChunks = expectedFile
      ? retrievedChunks.filter((chunk) => chunk.file === expectedFile)
      : retrievedChunks;
    const retrievalMatches =
      !retrievalExpected ||
      (knowledgeCalls.length > 0 && matchingChunks.length >= retrievalExpected.minChunks);
    const expectedModule = testCase.expect.module?.trim();
    const moduleMatches = !expectedModule || result.module === expectedModule;
    const passed = verdictMatches && scoreMatches && safetyGateStopped && retrievalMatches && moduleMatches;
    const note = passed
      ? ""
      : !verdictMatches
        ? "verdict mismatch"
        : !scoreMatches
          ? "score below minScore"
          : !safetyGateStopped
            ? "safety gate did not stop before coach"
            : !moduleMatches
              ? `module mismatch (${result.module ?? "none"})`
              : knowledgeCalls.length === 0
                ? "retrieval not called"
                : expectedFile && matchingChunks.length === 0
                  ? "expected file missing"
                  : "too few matching chunks";

    return {
      status: passed ? "PASS" : "FAIL",
      case: testCase.name,
      expected: formatExpected(testCase),
      actual: result.review.verdict,
      score: String(score),
      module: result.module ?? "-",
      rounds: result.rounds.length,
      toolCalls: result.toolCalls.length,
      retrieval: knowledgeCalls.length
        ? `${retrievedChunks.length} chunks · ${retrievedFiles.join(", ") || "no files"}`
        : "not called",
      note,
    };
  } catch (error) {
    return {
      status: "FAIL",
      case: testCase.name,
      expected: formatExpected(testCase),
      actual: "error",
      score: "-",
      module: "-",
      rounds: "-",
      toolCalls: "-",
      retrieval: "-",
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
