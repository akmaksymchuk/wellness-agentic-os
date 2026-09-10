import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import { runOS } from "../../../src/os/runOS";
import {
  eventToTimelinePart,
  isHealthChatMessages,
  latestUserText,
  planTextChunks,
  sessionContextFromMessages,
  type HealthChatMessage,
} from "../../../src/chat/messages";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  let messages: HealthChatMessage[];

  try {
    const body = await request.json();
    if (!isHealthChatMessages(body.messages)) {
      return Response.json({ error: "Передай историю сообщений чата." }, { status: 400 });
    }
    messages = body.messages;
  } catch {
    return Response.json({ error: "Не удалось прочитать запрос чата." }, { status: 400 });
  }

  const task = latestUserText(messages);
  if (!task) {
    return Response.json({ error: "Передай непустую задачу." }, { status: 400 });
  }

  const stream = createUIMessageStream<HealthChatMessage>({
    execute: async ({ writer }) => {
      const result = await runOS(task, {
        sessionContext: sessionContextFromMessages(messages),
        onEvent: (event) => writer.write(eventToTimelinePart(event)),
      });

      if (result.review.verdict === "needs_human_professional") {
        writer.write({
          type: "data-result",
          id: "result",
          data: {
            kind: "professional_help",
            review: result.review,
          },
        });
        return;
      }

      writer.write({
        type: "data-result",
        id: "result",
        data: {
          kind: "final",
          resultKind: result.resultKind,
          review: result.review,
        },
      });
      writer.write({ type: "text-start", id: "plan" });
      for await (const delta of planTextChunks(result.plan)) {
        writer.write({ type: "text-delta", id: "plan", delta });
      }
      writer.write({ type: "text-end", id: "plan" });
    },
    onError: (error) => {
      console.error("Chat stream failed", error);
      return "Не удалось завершить запуск агента. Попробуйте ещё раз.";
    },
  });

  return createUIMessageStreamResponse({ stream });
}
