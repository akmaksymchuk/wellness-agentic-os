"use client";

import { type FormEvent, useState } from "react";
import {
  Check,
  CircleCheckBig,
  Copy,
  Loader2,
  ShieldAlert,
  Sparkles,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  RoundsIndicator,
  ScoreMeter,
  VerdictBadge,
  verdictConfig,
  type ReviewVerdict,
} from "@/components/health/review-widgets";

type AgentResult = {
  plan: string;
  review: {
    verdict: ReviewVerdict;
    score: number;
    issues: string[];
  };
  rounds: number;
};

type Status = "idle" | "running" | "result";

const statusMeta: Record<Status, { label: string; dot: string }> = {
  idle: { label: "Готов", dot: "bg-muted-foreground/50" },
  running: { label: "Выполняется", dot: "bg-primary animate-pulse" },
  result: { label: "Готово", dot: "bg-emerald-500" },
};

const reviewSteps = ["Черновик", "Ревью", "Правки", "Финал"];

const isProfessionalVerdict = (result: AgentResult | null) =>
  result?.review.verdict === "needs_human_professional";

export default function Page() {
  const [task, setTask] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [result, setResult] = useState<AgentResult | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const isRunning = status === "running";

  async function runAgent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedTask = task.trim();
    if (isRunning) return;

    if (!trimmedTask) {
      setError("Опишите задачу, чтобы запустить агента.");
      return;
    }

    setStatus("running");
    setResult(null);
    setError("");
    setCopied(false);

    try {
      const response = await fetch("/api/agent/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task: trimmedTask }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Не удалось запустить агента.");
      setResult(payload);
      setStatus("result");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось запустить агента.");
      setStatus("idle");
    }
  }

  async function copyPlan() {
    if (!result?.plan) return;
    try {
      await navigator.clipboard.writeText(result.plan);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Не удалось скопировать план.");
    }
  }

  const status_ = statusMeta[status];

  return (
    <>
      <a
        href="#task"
        className="bg-primary text-primary-foreground focus:ring-ring sr-only rounded-md px-4 py-2 text-sm font-medium focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:ring-2"
      >
        К задаче
      </a>

      <main
        id="main-content"
        className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 sm:py-14"
      >
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-2">
            <p className="text-primary flex items-center gap-1.5 text-xs font-semibold tracking-[0.14em] uppercase">
              <Sparkles className="size-3.5" aria-hidden="true" />
              Local wellness runner
            </p>
            <h1 className="text-foreground text-3xl font-semibold tracking-tight sm:text-4xl">
              Health Coach Agent
            </h1>
            <p className="text-muted-foreground max-w-prose text-sm">
              Опишите цель — коуч составит wellness-план, а ревьюер проверит его
              на безопасность перед выдачей.
            </p>
          </div>

          <div
            aria-live="polite"
            className="border-border bg-card inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium shadow-sm"
          >
            <span
              aria-hidden="true"
              className={cn("size-2 rounded-full", status_.dot)}
            />
            {status_.label}
          </div>
        </header>

        <div className="mt-8 grid gap-6 lg:grid-cols-[1.35fr_1fr]">
          {/* Форма задачи */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Задача для агента</CardTitle>
              <CardDescription>
                Например: план питания и активности на завтра.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={runAgent} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="task">Опишите цель</Label>
                  <Textarea
                    id="task"
                    name="task"
                    autoComplete="off"
                    disabled={isRunning}
                    onChange={(event) => setTask(event.target.value)}
                    placeholder="Например: составь план питания и активности на завтра…"
                    required
                    rows={8}
                    value={task}
                    className="resize-y"
                  />
                </div>

                <Button
                  type="submit"
                  size="lg"
                  disabled={isRunning}
                  aria-busy={isRunning}
                  className="w-full sm:w-auto"
                >
                  {isRunning ? (
                    <>
                      <Loader2 className="animate-spin" aria-hidden="true" />
                      Агент работает…
                    </>
                  ) : (
                    <>
                      <Sparkles aria-hidden="true" />
                      Запустить агента
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Панель ревью безопасности */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Проверка безопасности</CardTitle>
              <CardDescription>Ревью коуч → ревьюер</CardDescription>
              <CardAction>
                {result ? (
                  <VerdictBadge verdict={result.review.verdict} />
                ) : (
                  <span className="text-muted-foreground text-xs font-medium">
                    {isRunning ? "Идёт проверка…" : "В очереди"}
                  </span>
                )}
              </CardAction>
            </CardHeader>
            <CardContent>
              {result ? (
                <div className="space-y-5">
                  <ScoreMeter
                    score={result.review.score}
                    tone={verdictConfig[result.review.verdict].meter}
                  />
                  <Separator />
                  <RoundsIndicator rounds={result.rounds} />
                  <Separator />
                  <div className="space-y-2">
                    <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                      Замечания
                    </p>
                    {result.review.issues.length ? (
                      <ul className="space-y-2">
                        {result.review.issues.map((issue) => (
                          <li
                            key={issue}
                            className="text-foreground flex gap-2 text-sm leading-relaxed"
                          >
                            <span
                              aria-hidden="true"
                              className="bg-amber-500 mt-2 size-1.5 shrink-0 rounded-full"
                            />
                            {issue}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-muted-foreground flex items-center gap-2 text-sm">
                        <CircleCheckBig
                          className="size-4 text-emerald-600"
                          aria-hidden="true"
                        />
                        Замечаний нет
                      </p>
                    )}
                  </div>
                </div>
              ) : isRunning ? (
                <div className="space-y-4" aria-hidden="true">
                  <Skeleton className="h-2 w-full" />
                  <Skeleton className="h-2 w-2/3" />
                  <Separator />
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-4 w-3/4" />
                </div>
              ) : (
                <ol className="space-y-3" aria-label="Порядок проверки">
                  {reviewSteps.map((step, index) => (
                    <li
                      key={step}
                      className="text-muted-foreground flex items-center gap-3 text-sm"
                    >
                      <span className="border-border text-muted-foreground flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold tabular-nums">
                        {index + 1}
                      </span>
                      {step}
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </div>

        {error ? (
          <Alert variant="destructive" className="mt-6">
            <ShieldAlert aria-hidden="true" />
            <AlertTitle>Ошибка запуска</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {status === "result" && result ? (
          <section aria-label="Результат агента" className="mt-6">
            {isProfessionalVerdict(result) ? (
              <Alert variant="destructive">
                <ShieldAlert aria-hidden="true" />
                <AlertTitle>Нужна консультация специалиста</AlertTitle>
                <AlertDescription>
                  <p>
                    Этот запрос выходит за рамки безопасного wellness-плана.
                    Обратитесь к квалифицированному специалисту.
                  </p>
                </AlertDescription>
              </Alert>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Финальный план</CardTitle>
                  <CardDescription>
                    Одобрен ревьюером безопасности
                  </CardDescription>
                  <CardAction>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={copyPlan}
                      aria-label="Копировать план"
                    >
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
                  </CardAction>
                </CardHeader>
                <CardContent>
                  <pre className="bg-muted/50 text-foreground overflow-x-auto rounded-lg p-4 font-mono text-sm leading-relaxed whitespace-pre-wrap">
                    {result.plan}
                  </pre>
                </CardContent>
              </Card>
            )}
          </section>
        ) : null}
      </main>
    </>
  );
}
