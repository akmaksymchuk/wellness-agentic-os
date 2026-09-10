import type { McpServerConfig, SDKCustomTool } from "@cursor/sdk";
import { config as loadDotenv } from "dotenv";
import { join } from "node:path";
import { createHealthCoachAgent, type PromptAgent } from "../agents/healthCoach";
import { createSafetyReviewerAgent } from "../agents/safetyReviewer";
import { createMarkdownHealthMcpClient, cursorMcpServers, type MarkdownHealthMcpClient } from "../mcp/stdioClient";
import {
  buildDailyLogEntry,
  buildPreferenceEntry,
  taskRequestsPreferenceUpdate,
} from "../os/memory";
import { createLocalHealthCoachTools, type ToolCallRecord } from "../skills";
import { completeText } from "./completeText";
import { ACTIVE_PROMPTS, loadPrompt, type PromptVersions } from "./promptVersions";
import { createRoundLog, type RoundState } from "./rounds";
import { summarizeScore } from "./score";
import { traceRun } from "./traceRun";
import { ReviewSchema, normalizeReview, validateReview, type Review } from "./validateReview";

const DEFAULT_MAX_ROUNDS = 3;
const DEFAULT_COACH_MODEL = "grok-4.6";

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
  module?: string;
  intentConfidence?: number;
};

export type HealthAgentStage =
  | "reading_profile"
  | "searching_knowledge"
  | "generating_plan"
  | "reviewing_safety"
  | "revising"
  | "final_approved_plan";

export type RunHealthAgentEvent =
  | {
      type: "stage";
      stage: HealthAgentStage;
      status: "active" | "complete";
      round?: number;
      query?: string;
      verdict?: Review["verdict"];
      score?: number;
    }
  | {
      type: "tool_call";
      toolCall: ToolCallRecord;
    }
  | {
      type: "module";
      module: string;
      confidence: number;
    };

export type RunHealthAgentOptions = {
  root?: string;
  maxRounds?: number;
  sessionContext?: string;
  onRound?: (round: number, review: Review) => void;
  onEvent?: (event: RunHealthAgentEvent) => void;
  coachPrompt?: string;
  allowedTools?: string[];
  module?: string;
  intentConfidence?: number;
};

type Runtime = {
  root: string;
  apiKey: string;
  model: string;
  mcpServers?: Record<string, McpServerConfig>;
  onToolCall?: (call: ToolCallRecord) => void;
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
    mcpServers: customTools ? runtime.mcpServers : undefined,
    onToolCall: customTools ? runtime.onToolCall : undefined,
  });
}

function buildTaskPrompt(task: string, sessionContext?: string) {
  const context = sessionContext?.trim();
  return context
    ? `Контекст текущей сессии:\n${context}\n\nЗадача пользователя:\n${task}`.trim()
    : `Задача пользователя:\n${task}`.trim();
}

function knowledgeQuery(call: ToolCallRecord): string | undefined {
  return typeof call.args?.query === "string" ? call.args.query : undefined;
}

async function askCoach(
  runtime: Runtime,
  agent: PromptAgent,
  task: string,
  sessionContext: string | undefined,
  previousPlan: string,
  issues: string[],
  customTools: Record<string, SDKCustomTool>,
) {
  const revision = issues.length
    ? `\n\nПредыдущий план:\n${previousPlan}\n\nЗамечания Safety Reviewer:\n${issues.map((issue) => `- ${issue}`).join("\n")}\n\nИсправь план с учетом замечаний. Верни только обновленный план.`
    : "";
  return ask(runtime, agent, `${buildTaskPrompt(task, sessionContext)}${revision}`, customTools);
}

/**
 * Safety Reviewer is an OS invariant: every module, including shoppingList and habits,
 * goes through this text-only gate. Do not skip it for tool shortcuts.
 */
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

async function persistApprovedRun(
  server: MarkdownHealthMcpClient,
  task: string,
  plan: string,
  moduleName: string,
  recordToolCall: (call: ToolCallRecord) => void,
) {
  await server.callTool("save_health_plan", { markdown: plan });
  recordToolCall({ name: "save_health_plan", source: "markdown-health" });

  await server.callTool("append_daily_log", { entry: buildDailyLogEntry(task, moduleName, plan) });
  recordToolCall({ name: "append_daily_log", source: "markdown-health" });

  if (taskRequestsPreferenceUpdate(task)) {
    await server.callTool("update_preferences", { note: buildPreferenceEntry(task) });
    recordToolCall({ name: "update_preferences", source: "markdown-health" });
  }
}

function toResult(
  startedAt: number,
  model: string,
  plan: string,
  review: Review,
  rounds: RoundState[],
  toolCalls: ToolCallRecord[],
  extras: {
    resultKind?: RunResultKind;
    module?: string;
    intentConfidence?: number;
  } = {},
): RunHealthAgentResult {
  const { finalScore, improved } = summarizeScore(rounds);
  return {
    resultKind: extras.resultKind ?? "plan",
    plan,
    review,
    model,
    rounds,
    finalScore,
    improved,
    promptVersions: { coach: ACTIVE_PROMPTS.coach, reviewer: ACTIVE_PROMPTS.reviewer },
    toolCalls,
    durationMs: Date.now() - startedAt,
    module: extras.module,
    intentConfidence: extras.intentConfidence,
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
  const sessionContext = options.sessionContext?.trim() || undefined;
  const emit = (event: RunHealthAgentEvent) => options.onEvent?.(event);
  const routing = {
    module: options.module,
    intentConfidence: options.intentConfidence,
  };
  loadEnv(root);
  const model = process.env.CURSOR_MODEL?.trim() || DEFAULT_COACH_MODEL;
  const roundLog = createRoundLog();
  emit({ type: "stage", stage: "reading_profile", status: "active" });
  const taskReview = reviewTaskSafety(task);
  if (taskReview) {
    const recorded = roundLog.record("", taskReview);
    options.onRound?.(recorded.round, taskReview);
    emit({ type: "stage", stage: "reading_profile", status: "complete" });
    emit({ type: "stage", stage: "reviewing_safety", status: "active", round: 1 });
    emit({
      type: "stage",
      stage: "reviewing_safety",
      status: "complete",
      round: 1,
      verdict: taskReview.verdict,
      score: taskReview.score,
    });
    return toResult(startedAt, model, "", taskReview, roundLog.snapshot(), [], routing);
  }

  const apiKey = process.env.CURSOR_API_KEY;
  if (!apiKey) throw new Error("Добавь CURSOR_API_KEY в .env");

  const [coachPrompt, reviewerPrompt] = await Promise.all([
    options.coachPrompt?.trim()
      ? Promise.resolve(options.coachPrompt.trim())
      : loadPrompt(root, "healthCoach", ACTIVE_PROMPTS.coach),
    loadPrompt(root, "safetyReviewer", ACTIVE_PROMPTS.reviewer),
  ]);
  const toolCalls: ToolCallRecord[] = [];
  const recordToolCall = (call: ToolCallRecord) => {
    toolCalls.push(call);
    emit({ type: "tool_call", toolCall: call });
    if (call.name === "searchKnowledge") {
      emit({
        type: "stage",
        stage: "searching_knowledge",
        status: "active",
        query: knowledgeQuery(call),
      });
    }
  };
  const coachTools = createLocalHealthCoachTools(root, recordToolCall, options.allowedTools);
  const markdownMcp = await createMarkdownHealthMcpClient(root);
  const runtime: Runtime = {
    root,
    apiKey,
    model,
    mcpServers: cursorMcpServers(root, {
      allowedTools: options.allowedTools,
      moduleName: options.module,
    }),
    onToolCall: recordToolCall,
  };
  const coach = createHealthCoachAgent(coachPrompt);
  const reviewer = createSafetyReviewerAgent(reviewerPrompt);
  let plan = "";
  let issues: string[] = [];
  let lastReview: Review | null = null;
  emit({ type: "stage", stage: "reading_profile", status: "complete" });

  try {
    for (let round = 1; round <= maxRounds; round += 1) {
      if (round > 1) {
        emit({ type: "stage", stage: "revising", status: "active", round });
      }
      emit({ type: "stage", stage: "searching_knowledge", status: "active" });
      emit({ type: "stage", stage: "generating_plan", status: "active" });

      const beforeCalls = toolCalls.length;
      plan = await askCoach(runtime, coach, task, sessionContext, plan, issues, coachTools);
      const roundCalls = toolCalls.slice(beforeCalls);
      const knowledgeCall = roundCalls.find((call) => call.name === "searchKnowledge");

      emit({
        type: "stage",
        stage: "searching_knowledge",
        status: "complete",
        query: knowledgeCall ? knowledgeQuery(knowledgeCall) : undefined,
      });
      emit({ type: "stage", stage: "generating_plan", status: "complete" });
      if (round > 1) {
        emit({ type: "stage", stage: "revising", status: "complete", round });
      }

      emit({ type: "stage", stage: "reviewing_safety", status: "active", round });
      const review = await askReviewer(runtime, reviewer, plan, round, maxRounds, issues);
      lastReview = review;
      roundLog.record(plan, review);
      options.onRound?.(round, review);
      emit({
        type: "stage",
        stage: "reviewing_safety",
        status: "complete",
        round,
        verdict: review.verdict,
        score: review.score,
      });

      if (review.verdict === "needs_human_professional") {
        return toResult(startedAt, model, "", review, roundLog.snapshot(), toolCalls, routing);
      }
      if (review.verdict === "approve") {
        emit({ type: "stage", stage: "final_approved_plan", status: "active" });
        await persistApprovedRun(markdownMcp, task, plan, options.module ?? "general", recordToolCall);
        emit({ type: "stage", stage: "final_approved_plan", status: "complete" });
        return toResult(startedAt, model, plan, review, roundLog.snapshot(), toolCalls, {
          ...routing,
          resultKind: toolCalls.some((call) => call.name === "generateShoppingList") ? "shopping_list" : "plan",
        });
      }
      issues = review.issues;
    }

    if (!lastReview) throw new Error("Reviewer не вернул результат.");
    return toResult(startedAt, model, plan, lastReview, roundLog.snapshot(), toolCalls, routing);
  } finally {
    await markdownMcp.close();
  }
}
