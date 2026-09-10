import type { UIMessage } from "ai";
import { z } from "zod";
import type { HealthAgentStage, RunHealthAgentEvent, ToolCallRecord } from "../harness/runHealthAgent";
import { ReviewSchema } from "../harness/validateReview";

const MAX_CONTEXT_MESSAGES = 12;
const MAX_CONTEXT_CHARACTERS = 12_000;

const StageSchema = z.enum([
  "reading_profile",
  "searching_knowledge",
  "generating_plan",
  "reviewing_safety",
  "revising",
  "final_approved_plan",
]);

const ToolCallRecordSchema = z.object({
  name: z.string(),
  source: z.string().optional(),
  args: z.record(z.string(), z.unknown()).optional(),
  result: z.record(z.string(), z.unknown()).optional(),
  chunks: z
    .array(
      z.object({
        file: z.string(),
        heading: z.string(),
      }),
    )
    .optional(),
});

const TimelineStageSchema = z.object({
  kind: z.literal("stage"),
  stage: StageSchema,
  status: z.enum(["active", "complete"]),
  round: z.number().int().positive().optional(),
  query: z.string().optional(),
  verdict: z.enum(["approve", "revise", "needs_human_professional"]).optional(),
  score: z.number().min(0).max(10).optional(),
});

const TimelineToolSchema = z.object({
  kind: z.literal("tool"),
  toolCall: ToolCallRecordSchema,
});

const TimelineModuleSchema = z.object({
  kind: z.literal("module"),
  module: z.string().min(1),
  confidence: z.number().min(0).max(1),
});

export const TimelineDataSchema = z.discriminatedUnion("kind", [
  TimelineStageSchema,
  TimelineToolSchema,
  TimelineModuleSchema,
]);

export const ResultDataSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("final"),
    resultKind: z.enum(["plan", "shopping_list"]),
    review: ReviewSchema,
  }),
  z.object({
    kind: z.literal("professional_help"),
    review: ReviewSchema,
  }),
]);

export type TimelineData = z.infer<typeof TimelineDataSchema>;
export type ResultData = z.infer<typeof ResultDataSchema>;

export type HealthChatMessage = UIMessage<
  never,
  {
    timeline: TimelineData;
    result: ResultData;
  }
>;

export const healthChatDataSchemas = {
  timeline: TimelineDataSchema,
  result: ResultDataSchema,
};

export const stageLabels: Record<HealthAgentStage, string> = {
  reading_profile: "Читаю профиль",
  searching_knowledge: "Ищу в базе знаний",
  generating_plan: "Составляю план",
  reviewing_safety: "Проверяю безопасность",
  revising: "Правки",
  final_approved_plan: "Финальный план",
};

function toolCallId(toolCall: ToolCallRecord) {
  const query = typeof toolCall.args?.query === "string" ? toolCall.args.query : "";
  return ["tool", toolCall.source ?? "local", toolCall.name, query]
    .join("-")
    .replaceAll(/[^a-zA-Z0-9_-]/g, "_");
}

function stageId(stage: HealthAgentStage, round?: number) {
  return round && ["reviewing_safety", "revising"].includes(stage)
    ? `stage-${stage}-${round}`
    : `stage-${stage}`;
}

export function eventToTimelinePart(event: RunHealthAgentEvent) {
  if (event.type === "tool_call") {
    return {
      type: "data-timeline" as const,
      id: toolCallId(event.toolCall),
      data: {
        kind: "tool" as const,
        toolCall: event.toolCall,
      },
    };
  }

  if (event.type === "module") {
    return {
      type: "data-timeline" as const,
      id: `module-${event.module}`,
      data: {
        kind: "module" as const,
        module: event.module,
        confidence: event.confidence,
      },
    };
  }

  return {
    type: "data-timeline" as const,
    id: stageId(event.stage, event.round),
    data: {
      kind: "stage" as const,
      stage: event.stage,
      status: event.status,
      round: event.round,
      query: event.query,
      verdict: event.verdict,
      score: event.score,
    },
  };
}

function textFromMessage(message: HealthChatMessage) {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text.trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

export function latestUserText(messages: HealthChatMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role !== "user") continue;

    const text = textFromMessage(message);
    if (text) return text;
  }

  return "";
}

export function isHealthChatMessages(value: unknown): value is HealthChatMessage[] {
  if (!Array.isArray(value)) return false;

  return value.every((message) => {
    if (!message || typeof message !== "object") return false;
    const candidate = message as { role?: unknown; parts?: unknown };
    return (
      typeof candidate.role === "string" &&
      ["user", "assistant", "system"].includes(candidate.role) &&
      Array.isArray(candidate.parts)
    );
  });
}

function latestUserIndex(messages: HealthChatMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role === "user" && textFromMessage(message)) return index;
  }

  return -1;
}

export function sessionContextFromMessages(messages: HealthChatMessage[]) {
  const currentIndex = latestUserIndex(messages);
  if (currentIndex === -1) return "";

  const history = messages
    .slice(Math.max(0, currentIndex - MAX_CONTEXT_MESSAGES), currentIndex)
    .flatMap((message) => {
      const text = textFromMessage(message);
      if (!text) return [];
      return [`${message.role === "user" ? "User" : "Previous approved response"}:\n${text}`];
    });

  return history.join("\n\n").slice(-MAX_CONTEXT_CHARACTERS);
}

export async function* planTextChunks(plan: string) {
  const chunks = plan.match(/\S+\s*|\s+/g) ?? [];

  for (const [index, chunk] of chunks.entries()) {
    yield chunk;
    if (chunks.length > 1 && index < chunks.length - 1) {
      await new Promise<void>((resolve) => setTimeout(resolve, 12));
    }
  }
}
