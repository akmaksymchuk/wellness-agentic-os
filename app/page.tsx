"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import { DefaultChatTransport } from "ai";
import { useChat } from "@ai-sdk/react";
import { Loader2, Plus, SendHorizontal, Sparkles } from "lucide-react";

import { ChatError, ChatMessage } from "@/components/chat/chat-message";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { healthChatDataSchemas, type HealthChatMessage } from "@/src/chat/messages";

const chatTransport = new DefaultChatTransport<HealthChatMessage>({
  api: "/api/chat",
});

export default function Page() {
  const [input, setInput] = useState("");
  const [inputError, setInputError] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const { messages, sendMessage, setMessages, status, error, clearError } = useChat<HealthChatMessage>({
    transport: chatTransport,
    dataPartSchemas: healthChatDataSchemas,
  });
  const isRunning = status === "submitted" || status === "streaming";

  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    endRef.current?.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
      block: "end",
    });
  }, [messages, status]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = input.trim();

    if (isRunning) return;
    if (!text) {
      setInputError("Опишите задачу для Health Coach.");
      return;
    }

    setInputError("");
    clearError();
    setInput("");
    void sendMessage({ text }).catch(() => undefined);
  }

  function startNewSession() {
    if (isRunning) return;
    setMessages([]);
    setInput("");
    setInputError("");
    clearError();
  }

  return (
    <>
      <a
        href="#composer"
        className="bg-primary text-primary-foreground focus:ring-ring sr-only rounded-md px-4 py-2 text-sm font-medium focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:ring-2"
      >
        К сообщению
      </a>

      <main className="mx-auto flex h-dvh w-full max-w-3xl flex-col px-3 sm:px-6">
        <header className="border-border flex shrink-0 items-center justify-between gap-4 border-b py-4 sm:py-5">
          <div className="min-w-0">
            <p className="text-primary flex items-center gap-1.5 text-xs font-semibold tracking-[0.14em] uppercase">
              <Sparkles className="size-3.5" aria-hidden="true" />
              Wellness companion
            </p>
            <h1 className="text-foreground mt-1 text-xl font-semibold tracking-tight sm:text-2xl">Health Coach</h1>
          </div>
          <Button type="button" variant="outline" onClick={startNewSession} disabled={isRunning}>
            <Plus aria-hidden="true" />
            Новая сессия
          </Button>
        </header>

        <section
          id="chat-feed"
          aria-label="Переписка с Health Coach"
          className="min-h-0 flex-1 overflow-y-auto py-6 sm:py-8"
        >
          {messages.length ? (
            <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 sm:gap-5">
              {messages.map((message) => (
                <ChatMessage key={message.id} message={message} />
              ))}
              {error ? <ChatError message={error.message} /> : null}
              <div ref={endRef} aria-hidden="true" />
            </div>
          ) : (
            <div className="mx-auto flex h-full max-w-md flex-col justify-center pb-20 text-center">
              <Sparkles className="text-primary mx-auto size-7" aria-hidden="true" />
              <h2 className="text-foreground mt-4 text-lg font-semibold">Ваш wellness-план начинается здесь</h2>
              <p className="text-muted-foreground mt-2 text-sm leading-6">
                Опишите цель — коуч изучит контекст, проверит план на безопасность и покажет ход работы в этом чате.
              </p>
              {error ? (
                <div className="mt-5">
                  <ChatError message={error.message} />
                </div>
              ) : null}
              <div ref={endRef} aria-hidden="true" />
            </div>
          )}
        </section>

        <form id="composer" onSubmit={handleSubmit} className="border-border bg-background/95 shrink-0 border-t py-3 backdrop-blur sm:py-4">
          <div className="border-border bg-card focus-within:ring-ring flex items-end gap-2 rounded-xl border p-2 shadow-sm focus-within:ring-2">
            <label htmlFor="message" className="sr-only">
              Сообщение для Health Coach
            </label>
            <Textarea
              id="message"
              value={input}
              onChange={(event) => {
                setInput(event.target.value);
                if (inputError) setInputError("");
              }}
              disabled={isRunning}
              rows={2}
              placeholder="Например: составь план питания и активности на завтра…"
              className="min-h-12 flex-1 resize-none border-0 bg-transparent px-2 py-1.5 shadow-none focus-visible:ring-0"
            />
            <Button
              type="submit"
              size="icon"
              disabled={isRunning || !input.trim()}
              aria-busy={isRunning}
              aria-label={isRunning ? "Health Coach работает" : "Отправить сообщение"}
            >
              {isRunning ? <Loader2 className="animate-spin" aria-hidden="true" /> : <SendHorizontal aria-hidden="true" />}
            </Button>
          </div>
          {inputError ? (
            <p role="alert" className="text-destructive mt-2 px-1 text-xs">
              {inputError}
            </p>
          ) : (
            <p className="text-muted-foreground mt-2 px-1 text-xs">
              Во время запуска поле заблокировано. История хранится только в этой сессии.
            </p>
          )}
        </form>
      </main>
    </>
  );
}
