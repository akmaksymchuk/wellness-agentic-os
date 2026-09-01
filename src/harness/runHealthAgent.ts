import { config as loadDotenv } from "dotenv";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createHealthCoachAgent, type PromptAgent } from "../agents/healthCoach";
import { createSafetyReviewerAgent } from "../agents/safetyReviewer";
import { completeText } from "./completeText";
import { ACTIVE_PROMPTS, loadPrompt, type PromptVersions } from "./promptVersions";
import { createRoundLog, type RoundState } from "./rounds";
import { summarizeScore } from "./score";
import { ReviewSchema, normalizeReview, validateReview, type Review } from "./validateReview";

const DEFAULT_MAX_ROUNDS = 3;

export type { RoundState, Review, PromptVersions };

export type RunHealthAgentResult = {
  plan: string;
  review: Review;
  rounds: RoundState[];
  finalScore: number;
  improved: boolean;
  promptVersions: PromptVersions;
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
    ? ReviewSchema.parse({ verdict: "needs_human_professional", score: 0, issues: ["Запрос касается медицинской темы: лекарств, симптомов, лечения или дозировок."] })
    : null;
}

const buildContext = (task: string, profile: string, log: string) =>
  `Задача пользователя:\n${task}\n\nПрофиль пользователя:\n${profile}\n\nДневник последних дней:\n${log}`.trim();

function ask(runtime: Runtime, agent: PromptAgent, userMessage: string) {
  return completeText({
    root: runtime.root,
    apiKey: runtime.apiKey,
    model: runtime.model,
    agentName: agent.name,
    instructions: agent.instructions,
    userMessage,
  });
}

async function askCoach(runtime: Runtime, agent: PromptAgent, baseContext: string, previousPlan: string, issues: string[]) {
  const revision = issues.length
    ? `\n\nПредыдущий план:\n${previousPlan}\n\nЗамечания Safety Reviewer:\n${issues.map((issue) => `- ${issue}`).join("\n")}\n\nИсправь план с учетом замечаний. Верни только обновленный план.`
    : "";
  return ask(runtime, agent, `${baseContext}${revision}`);
}

async function askReviewer(
  runtime: Runtime,
  agent: PromptAgent,
  baseContext: string,
  plan: string,
  round: number,
  maxRounds: number,
  previousIssues: string[],
): Promise<Review> {
  const previous =
    previousIssues.length > 0
      ? `\n\nЗамечания прошлого раунда — проверь, закрыты ли они:\n${previousIssues.map((issue) => `- ${issue}`).join("\n")}`
      : "";
  const prompt =
    `${baseContext}\n\nРаунд ревью: ${round} из ${maxRounds}.${previous}\n\nПлан для проверки:\n${plan}`.trim();
  const raw = await ask(runtime, agent, prompt);
  const parsed = await validateReview(raw, () =>
    ask(runtime, agent, `${prompt}\n\nПредыдущий ответ был невалидным JSON. Верни только JSON по схеме.`),
  );
  return normalizeReview(parsed);
}

function toResult(startedAt: number, plan: string, review: Review, rounds: RoundState[]): RunHealthAgentResult {
  const { finalScore, improved } = summarizeScore(rounds);
  return {
    plan,
    review,
    rounds,
    finalScore,
    improved,
    promptVersions: { coach: ACTIVE_PROMPTS.coach, reviewer: ACTIVE_PROMPTS.reviewer },
    durationMs: Date.now() - startedAt,
  };
}

export async function runHealthAgent(task: string, options: RunHealthAgentOptions = {}): Promise<RunHealthAgentResult> {
  const startedAt = Date.now();
  const root = options.root ?? process.cwd();
  const maxRounds = options.maxRounds ?? DEFAULT_MAX_ROUNDS;
  loadEnv(root);
  const roundLog = createRoundLog();
  const taskReview = reviewTaskSafety(task);
  if (taskReview) {
    const recorded = roundLog.record("", taskReview);
    options.onRound?.(recorded.round, taskReview);
    return toResult(startedAt, "", taskReview, roundLog.snapshot());
  }

  const apiKey = process.env.CURSOR_API_KEY;
  if (!apiKey) throw new Error("Добавь CURSOR_API_KEY в .env");

  const [profile, log, coachPrompt, reviewerPrompt] = await Promise.all([
    readFile(join(root, "data/profile.md"), "utf8"),
    readFile(join(root, "data/log.md"), "utf8"),
    loadPrompt(root, "healthCoach", ACTIVE_PROMPTS.coach),
    loadPrompt(root, "safetyReviewer", ACTIVE_PROMPTS.reviewer),
  ]);
  const runtime: Runtime = {
    root,
    apiKey,
    model: process.env.CURSOR_MODEL ?? "composer-2.5",
  };
  const baseContext = buildContext(task, profile, log);
  const coach = createHealthCoachAgent(coachPrompt);
  const reviewer = createSafetyReviewerAgent(reviewerPrompt);
  let plan = "";
  let issues: string[] = [];
  let lastReview: Review | null = null;

  for (let round = 1; round <= maxRounds; round += 1) {
    plan = await askCoach(runtime, coach, baseContext, plan, issues);
    const review = await askReviewer(runtime, reviewer, baseContext, plan, round, maxRounds, issues);
    lastReview = review;
    roundLog.record(plan, review);
    options.onRound?.(round, review);

    if (review.verdict === "needs_human_professional") {
      return toResult(startedAt, "", review, roundLog.snapshot());
    }
    if (review.verdict === "approve") {
      await writeFile(join(root, "data/output.md"), `${plan}\n`, "utf8");
      return toResult(startedAt, plan, review, roundLog.snapshot());
    }
    issues = review.issues;
  }

  if (!lastReview) throw new Error("Reviewer не вернул результат.");
  return toResult(startedAt, plan, lastReview, roundLog.snapshot());
}
