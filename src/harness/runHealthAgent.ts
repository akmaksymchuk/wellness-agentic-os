import type { SDKCustomTool } from "@cursor/sdk";
import { config as loadDotenv } from "dotenv";
import { join } from "node:path";
import { createHealthCoachAgent, type PromptAgent } from "../agents/healthCoach";
import { createSafetyReviewerAgent } from "../agents/safetyReviewer";
import { createHealthCoachTools, savePlan, type ToolCallRecord } from "../skills";
import { completeText } from "./completeText";
import { ACTIVE_PROMPTS, loadPrompt, type PromptVersions } from "./promptVersions";
import { createRoundLog, type RoundState } from "./rounds";
import { summarizeScore } from "./score";
import { traceRun } from "./traceRun";
import { ReviewSchema, normalizeReview, validateReview, type Review } from "./validateReview";

const DEFAULT_MAX_ROUNDS = 3;

export type { RoundState, Review, PromptVersions, ToolCallRecord };

export type RunResultKind = "plan" | "shopping_list";

export type RunHealthAgentResult = {
  resultKind: RunResultKind;
  plan: string;
  review: Review;
  model: string;
  rounds: RoundState[];
  finalScore: number;
  improved: boolean;
  promptVersions: PromptVersions;
  toolCalls: ToolCallRecord[];
  durationMs: number;
};

export type RunHealthAgentOptions = {
  root?: string;
  maxRounds?: number;
  onRound?: (round: number, review: Review) => void;
};

type Runtime = {
  root: string;
  apiKey: string;
  model: string;
};

function loadEnv(root: string) {
  loadDotenv({ path: join(root, ".env"), quiet: true });
}

function reviewTaskSafety(task: string): Review | null {
  const text = task.toLocaleLowerCase("ru-RU");
  const meds = "таблет\\w*|препарат\\w*|лекарств\\w*|медикамент\\w*|капсул\\w*";
  const intent = "каки\\w*|что|чем|подбери|посоветуй|назначь|сколько|дозиров\\w*|пить|принимать";
  const patterns = [
    new RegExp(`(${intent}).{0,50}(${meds})`),
    new RegExp(`(${meds}).{0,50}(пить|принимать|для похудения|от давления|от сахара|дозиров\\w*)`),
    /(диагноз|лечение|лечить|болит|боль|симптом|травм|давлени\w*|сердц\w*|сахар\w*|беремен\w*)/,
  ];
  return patterns.some((pattern) => pattern.test(text))
    ? ReviewSchema.parse({
        verdict: "needs_human_professional",
        score: 0,
        issues: ["Запрос касается медицинской темы: лекарств, симптомов, лечения или дозировок."],
      })
    : null;
}

const SHOPPING_LIST_REVIEW: Review = {
  verdict: "approve",
  score: 10,
  issues: [],
};

function ask(
  runtime: Runtime,
  agent: PromptAgent,
  userMessage: string,
  customTools?: Record<string, SDKCustomTool>,
) {
  return completeText({
    root: runtime.root,
    apiKey: runtime.apiKey,
    model: runtime.model,
    agentName: agent.name,
    instructions: agent.instructions,
    userMessage,
    customTools,
  });
}

async function askCoach(
  runtime: Runtime,
  agent: PromptAgent,
  task: string,
  previousPlan: string,
  issues: string[],
  customTools: Record<string, SDKCustomTool>,
) {
  const revision = issues.length
    ? `\n\nПредыдущий план:\n${previousPlan}\n\nЗамечания Safety Reviewer:\n${issues.map((issue) => `- ${issue}`).join("\n")}\n\nИсправь план с учетом замечаний. Верни только обновленный план.`
    : "";
  const text = await ask(runtime, agent, `Задача пользователя:\n${task}${revision}`, customTools);
  return text;
}

async function askReviewer(
  runtime: Runtime,
  agent: PromptAgent,
  plan: string,
  round: number,
  maxRounds: number,
  previousIssues: string[],
): Promise<Review> {
  const previous =
    previousIssues.length > 0
      ? `\n\nЗамечания прошлого раунда — проверь, закрыты ли они:\n${previousIssues.map((issue) => `- ${issue}`).join("\n")}`
      : "";
  const prompt = `Раунд ревью: ${round} из ${maxRounds}.${previous}\n\nПлан для проверки:\n${plan}`.trim();
  const raw = await ask(runtime, agent, prompt);
  const parsed = await validateReview(raw, () =>
    ask(runtime, agent, `${prompt}\n\nПредыдущий ответ был невалидным JSON. Верни только JSON по схеме.`),
  );
  return normalizeReview(parsed);
}

function toResult(
  startedAt: number,
  model: string,
  plan: string,
  review: Review,
  rounds: RoundState[],
  toolCalls: ToolCallRecord[],
  resultKind: RunResultKind = "plan",
): RunHealthAgentResult {
  const { finalScore, improved } = summarizeScore(rounds);
  return {
    resultKind,
    plan,
    review,
    model,
    rounds,
    finalScore,
    improved,
    promptVersions: { coach: ACTIVE_PROMPTS.coach, reviewer: ACTIVE_PROMPTS.reviewer },
    toolCalls,
    durationMs: Date.now() - startedAt,
  };
}

export async function runHealthAgent(task: string, options: RunHealthAgentOptions = {}): Promise<RunHealthAgentResult> {
  const root = options.root ?? process.cwd();
  const result = await runHealthAgentCore(task, options, root);
  await traceRun({ root, task, result });
  return result;
}

async function runHealthAgentCore(
  task: string,
  options: RunHealthAgentOptions,
  root: string,
): Promise<RunHealthAgentResult> {
  const startedAt = Date.now();
  const maxRounds = options.maxRounds ?? DEFAULT_MAX_ROUNDS;
  loadEnv(root);
  const model = process.env.CURSOR_MODEL ?? "composer-2.5";
  const roundLog = createRoundLog();
  const taskReview = reviewTaskSafety(task);
  if (taskReview) {
    const recorded = roundLog.record("", taskReview);
    options.onRound?.(recorded.round, taskReview);
    return toResult(startedAt, model, "", taskReview, roundLog.snapshot(), []);
  }

  const apiKey = process.env.CURSOR_API_KEY;
  if (!apiKey) throw new Error("Добавь CURSOR_API_KEY в .env");

  const [coachPrompt, reviewerPrompt] = await Promise.all([
    loadPrompt(root, "healthCoach", ACTIVE_PROMPTS.coach),
    loadPrompt(root, "safetyReviewer", ACTIVE_PROMPTS.reviewer),
  ]);
  const runtime: Runtime = { root, apiKey, model };
  const toolCalls: ToolCallRecord[] = [];
  const coachTools = createHealthCoachTools(root, (call) => {
    toolCalls.push(call);
  });
  const coach = createHealthCoachAgent(coachPrompt);
  const reviewer = createSafetyReviewerAgent(reviewerPrompt);
  let plan = "";
  let issues: string[] = [];
  let lastReview: Review | null = null;

  for (let round = 1; round <= maxRounds; round += 1) {
    plan = await askCoach(runtime, coach, task, plan, issues, coachTools);

    if (toolCalls.some((call) => call.name === "generateShoppingList")) {
      return toResult(startedAt, model, plan, SHOPPING_LIST_REVIEW, roundLog.snapshot(), toolCalls, "shopping_list");
    }

    const review = await askReviewer(runtime, reviewer, plan, round, maxRounds, issues);
    lastReview = review;
    roundLog.record(plan, review);
    options.onRound?.(round, review);

    if (review.verdict === "needs_human_professional") {
      return toResult(startedAt, model, "", review, roundLog.snapshot(), toolCalls);
    }
    if (review.verdict === "approve") {
      // Harness owns savePlan: persistence only after reviewer approve, so a draft
      // cannot be saved because the model asked for it in the prompt.
      await savePlan(plan, root);
      toolCalls.push({ name: "savePlan" });
      return toResult(startedAt, model, plan, review, roundLog.snapshot(), toolCalls);
    }
    issues = review.issues;
  }

  if (!lastReview) throw new Error("Reviewer не вернул результат.");
  return toResult(startedAt, model, plan, lastReview, roundLog.snapshot(), toolCalls);
}
