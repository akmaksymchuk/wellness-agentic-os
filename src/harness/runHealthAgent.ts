import { config as loadDotenv } from "dotenv";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createHealthCoachAgent, type PromptAgent } from "../agents/healthCoach";
import { createSafetyReviewerAgent, type Review, ReviewSchema } from "../agents/safetyReviewer";
import { completeText } from "./completeText";

const MAX_ROUNDS = 3;

export type RunHealthAgentResult = {
  plan: string;
  review: Review;
  rounds: number;
};

export type RunHealthAgentOptions = {
  root?: string;
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

function parseReview(raw: string) {
  const json = raw.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "");
  return ReviewSchema.parse(JSON.parse(json));
}

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

async function askReviewer(runtime: Runtime, agent: PromptAgent, baseContext: string, plan: string): Promise<Review> {
  const prompt = `${baseContext}\n\nПлан для проверки:\n${plan}`.trim();
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const retry = attempt === 1 ? "" : "\n\nПредыдущий ответ был невалидным JSON. Верни только JSON по схеме.";
    const raw = await ask(runtime, agent, `${prompt}${retry}`);
    try {
      return parseReview(raw);
    } catch {
      if (attempt === 2) throw new Error(`Reviewer вернул невалидный JSON после ретрая:\n${raw}`);
      console.log("Reviewer вернул невалидный JSON, повторяю ревью один раз.");
    }
  }
  throw new Error("Reviewer не вернул результат.");
}

export async function runHealthAgent(task: string, options: RunHealthAgentOptions = {}): Promise<RunHealthAgentResult> {
  const root = options.root ?? process.cwd();
  loadEnv(root);
  const taskReview = reviewTaskSafety(task);
  if (taskReview) {
    options.onRound?.(1, taskReview);
    return { plan: "", review: taskReview, rounds: 1 };
  }

  const apiKey = process.env.CURSOR_API_KEY;
  if (!apiKey) throw new Error("Добавь CURSOR_API_KEY в .env");

  // Контекст только из локальных markdown-файлов.
  const [profile, log] = await Promise.all([
    readFile(join(root, "data/profile.md"), "utf8"), readFile(join(root, "data/log.md"), "utf8"),
  ]);
  const runtime: Runtime = {
    root,
    apiKey,
    model: process.env.CURSOR_MODEL ?? "composer-2.5",
  };
  const baseContext = buildContext(task, profile, log);
  const coach = createHealthCoachAgent();
  const reviewer = createSafetyReviewerAgent();
  let plan = "";
  let issues: string[] = [];
  let lastReview: Review | null = null;

  // Коуч и ревьюер общаются через явные раунды оркестратора.
  for (let round = 1; round <= MAX_ROUNDS; round += 1) {
    plan = await askCoach(runtime, coach, baseContext, plan, issues);
    const review = await askReviewer(runtime, reviewer, baseContext, plan);
    lastReview = review;
    options.onRound?.(round, review);

    if (review.verdict === "needs_human_professional") {
      return { plan: "", review, rounds: round };
    }
    if (review.verdict === "approve") {
      await writeFile(join(root, "data/output.md"), `${plan}\n`, "utf8");
      return { plan, review, rounds: round };
    }
    issues = review.issues;
  }

  if (!lastReview) throw new Error("Reviewer не вернул результат.");
  return { plan, review: lastReview, rounds: MAX_ROUNDS };
}
