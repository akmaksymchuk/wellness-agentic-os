"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Bot, Check, CircleAlert, Copy, ShieldAlert, UserRound } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ScoreMeter, VerdictBadge, verdictConfig } from "@/components/health/review-widgets";
import type { HealthChatMessage, ResultData, TimelineData } from "@/src/chat/messages";
import { ChatTimeline } from "./chat-timeline";

type ChatMessageProps = {
  message: HealthChatMessage;
};

const markdownPlugins = [remarkGfm];

function partGroups(message: HealthChatMessage) {
  const textParts = message.parts.filter((part) => part.type === "text");
  const text = textParts
    .map((part) => part.text)
    .filter(Boolean)
    .join("\n");
  const timeline = message.parts
    .filter((part) => part.type === "data-timeline")
    .map((part) => part.data as TimelineData);
  const result = message.parts.find(
    (part): part is Extract<typeof part, { type: "data-result" }> => part.type === "data-result",
  )?.data as ResultData | undefined;

  return {
    text,
    timeline,
    result,
    isTextStreaming: textParts.some((part) => part.state === "streaming"),
  };
}

function FinalResult({
  result,
  markdown,
  isPlanStreaming,
}: {
  result: Extract<ResultData, { kind: "final" }>;
  markdown: string;
  isPlanStreaming: boolean;
}) {
  const [copied, setCopied] = useState(false);

  async function copyPlan() {
    if (!markdown || isPlanStreaming) return;
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <footer className="border-border mt-4 space-y-3 border-t pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <VerdictBadge verdict={result.review.verdict} />
        {!isPlanStreaming && markdown ? (
          <Button type="button" variant="outline" size="sm" onClick={copyPlan} aria-label="Копировать план">
            {copied ? (
              <>
                <Check aria-hidden="true" />
                Скопировано
              </>
            ) : (
              <>
                <Copy aria-hidden="true" />
                Копировать
              </>
            )}
          </Button>
        ) : null}
      </div>
      <ScoreMeter score={result.review.score} tone={verdictConfig[result.review.verdict].meter} />
    </footer>
  );
}

function ProfessionalHelp({ result }: { result: Extract<ResultData, { kind: "professional_help" }> }) {
  return (
    <Alert variant="destructive" className="mt-4">
      <ShieldAlert aria-hidden="true" />
      <AlertTitle>Требуется специалист</AlertTitle>
      <AlertDescription>
        <p>Запрос выходит за рамки безопасного wellness-плана. Обратитесь к квалифицированному специалисту.</p>
        {result.review.issues.length ? (
          <ul className="mt-3 list-disc space-y-1 pl-5">
            {result.review.issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}

export function ChatMessage({ message }: ChatMessageProps) {
  const { text, timeline, result, isTextStreaming } = partGroups(message);
  const isUser = message.role === "user";

  if (isUser) {
    return (
      <article className="flex justify-end" aria-label="Сообщение пользователя">
        <div className="bg-primary text-primary-foreground max-w-[88%] rounded-2xl rounded-br-md px-4 py-3 text-sm leading-relaxed shadow-sm sm:max-w-[76%]">
          <span className="mb-1 flex items-center justify-end gap-1.5 text-[11px] font-semibold tracking-wide opacity-80">
            Вы <UserRound className="size-3" aria-hidden="true" />
          </span>
          <p className="whitespace-pre-wrap break-words">{text}</p>
        </div>
      </article>
    );
  }

  return (
    <article className="flex justify-start" aria-label="Ответ Health Coach">
      <div className="border-border bg-card max-w-[94%] rounded-2xl rounded-bl-md border px-4 py-3 shadow-sm sm:max-w-[86%]">
        <div className="text-primary mb-3 flex items-center gap-1.5 text-xs font-semibold tracking-[0.12em] uppercase">
          <Bot className="size-3.5" aria-hidden="true" />
          Health Coach
        </div>

        <ChatTimeline items={timeline} />

        {text ? (
          <section className="text-foreground mt-4 break-words text-sm leading-6">
            <h2 className="mb-2 font-semibold">
              {result?.kind === "final" && result.resultKind === "shopping_list" ? "Список покупок" : "Финальный план"}
            </h2>
            <div className="markdown-content">
              <ReactMarkdown remarkPlugins={markdownPlugins} skipHtml>
                {text}
              </ReactMarkdown>
            </div>
          </section>
        ) : null}

        {result?.kind === "professional_help" ? <ProfessionalHelp result={result} /> : null}
        {result?.kind === "final" ? (
          <FinalResult result={result} markdown={text} isPlanStreaming={isTextStreaming} />
        ) : null}
      </div>
    </article>
  );
}

export function ChatError({ message }: { message: string }) {
  return (
    <article className="flex justify-start" role="alert">
      <div className="border-destructive/30 bg-destructive/5 text-foreground max-w-[94%] rounded-2xl rounded-bl-md border px-4 py-3 text-sm sm:max-w-[86%]">
        <p className="flex items-center gap-2 font-semibold">
          <CircleAlert className="text-destructive size-4" aria-hidden="true" />
          Не удалось завершить запуск
        </p>
        <p className="text-muted-foreground mt-1.5">{message}</p>
      </div>
    </article>
  );
}
