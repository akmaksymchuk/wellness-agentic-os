import type { LucideIcon } from "lucide-react";
import { BookOpen, ChevronDown, CircleCheckBig, ListChecks, PencilLine, ShieldAlert, Timer } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatToolCallLabel, type ToolCallRecord } from "@/src/skills/cursorTool";

export type { ToolCallRecord };

export type ReviewVerdict = "approve" | "revise" | "needs_human_professional";

type VerdictStyle = {
  label: string;
  Icon: LucideIcon;
  /** Классы чипа/баннера (soft bg + доступный по контрасту текст). */
  badge: string;
  /** Цвет заливки score-meter и акцентной иконки. */
  meter: string;
};

/**
 * Семантика вердиктов передаётся цветом + иконкой + текстом (не только цветом).
 * Базовая тема — cyan-green; статусы используют встроенные шкалы Tailwind
 * (emerald / amber / red), настроенные под контраст AA.
 */
export const verdictConfig: Record<ReviewVerdict, VerdictStyle> = {
  approve: {
    label: "Одобрено",
    Icon: CircleCheckBig,
    badge: "border-emerald-200 bg-emerald-50 text-emerald-700",
    meter: "bg-emerald-500",
  },
  revise: {
    label: "Нужны правки",
    Icon: PencilLine,
    badge: "border-amber-200 bg-amber-50 text-amber-700",
    meter: "bg-amber-500",
  },
  needs_human_professional: {
    label: "Нужен специалист",
    Icon: ShieldAlert,
    badge: "border-red-200 bg-red-50 text-red-700",
    meter: "bg-red-500",
  },
};

export function VerdictBadge({
  verdict,
  className,
}: {
  verdict: ReviewVerdict;
  className?: string;
}) {
  const { label, Icon, badge } = verdictConfig[verdict];
  return (
    <Badge variant="outline" className={cn(badge, className)}>
      <Icon aria-hidden="true" />
      {label}
    </Badge>
  );
}

/** Порог цвета score, если вердикт не задаёт собственный. */
function scoreTone(score: number) {
  if (score >= 7) return "bg-emerald-500";
  if (score >= 4) return "bg-amber-500";
  return "bg-red-500";
}

export function ScoreMeter({
  score,
  max = 10,
  tone,
}: {
  score: number;
  max?: number;
  tone?: string;
}) {
  const clamped = Math.max(0, Math.min(score, max));
  const pct = (clamped / max) * 100;
  const fill = tone ?? scoreTone(clamped);

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          Оценка безопасности
        </span>
        <span className="text-foreground text-sm font-semibold tabular-nums">
          {clamped}
          <span className="text-muted-foreground font-normal">/{max}</span>
        </span>
      </div>
      <div
        role="meter"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuetext={`${clamped} из ${max}`}
        aria-label="Оценка безопасности плана"
        className="bg-muted mt-2 h-2 w-full overflow-hidden rounded-full"
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-500 ease-out motion-reduce:transition-none",
            fill
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function RoundsIndicator({
  rounds,
  total = 3,
}: {
  rounds: number;
  total?: number;
}) {
  const clamped = Math.max(0, Math.min(rounds, total));
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
        Раундов ревью
      </span>
      <div
        className="flex items-center gap-2"
        aria-label={`${clamped} из ${total} раундов`}
      >
        <span className="flex items-center gap-1" aria-hidden="true">
          {Array.from({ length: total }, (_, i) => (
            <span
              key={i}
              className={cn(
                "size-2 rounded-full",
                i < clamped ? "bg-primary" : "bg-border"
              )}
            />
          ))}
        </span>
        <span className="text-foreground text-sm font-semibold tabular-nums">
          {clamped}
          <span className="text-muted-foreground font-normal">/{total}</span>
        </span>
      </div>
    </div>
  );
}

export function IssuesHistory({
  rounds,
}: {
  rounds: Array<{
    round: number;
    review: { verdict: ReviewVerdict; issues: string[] };
  }>;
}) {
  if (!rounds.length) return null;

  const issueCount = rounds.reduce((count, item) => count + item.review.issues.length, 0);

  return (
    <details className="group" open>
      <summary className="text-muted-foreground hover:text-foreground focus-visible:ring-ring flex cursor-pointer list-none items-center justify-between gap-2 rounded-sm text-xs font-medium tracking-wide uppercase select-none focus-visible:ring-2 focus-visible:outline-none [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2">
          <ChevronDown
            className="size-3.5 transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none"
            aria-hidden="true"
          />
          Замечания
        </span>
        <span className="text-foreground font-semibold tracking-normal tabular-nums normal-case">
          {issueCount}
        </span>
      </summary>
      <ol className="mt-3 space-y-3" aria-label="История замечаний по раундам">
        {rounds.map((item) => (
          <li key={item.round} className="space-y-1.5">
            <p className="text-foreground text-sm leading-relaxed">
              Раунд {item.round} — {verdictConfig[item.review.verdict].label}
            </p>
            {item.review.issues.length ? (
              <ul className="space-y-1.5">
                {item.review.issues.map((issue) => (
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
                <CircleCheckBig className="size-4 text-emerald-600" aria-hidden="true" />
                Замечаний нет
              </p>
            )}
          </li>
        ))}
      </ol>
    </details>
  );
}

export function RoundsHistory({
  rounds,
}: {
  rounds: Array<{
    round: number;
    review: { verdict: ReviewVerdict; score: number };
  }>;
}) {
  if (!rounds.length) return null;

  return (
    <details className="group">
      <summary className="text-muted-foreground hover:text-foreground focus-visible:ring-ring flex cursor-pointer list-none items-center justify-between gap-2 rounded-sm text-xs font-medium tracking-wide uppercase select-none focus-visible:ring-2 focus-visible:outline-none [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2">
          <ChevronDown
            className="size-3.5 transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none"
            aria-hidden="true"
          />
          История раундов
        </span>
        <span className="text-foreground font-semibold tracking-normal tabular-nums normal-case">
          {rounds.length}
        </span>
      </summary>
      <ol className="mt-3 space-y-2" aria-label="История раундов ревью">
        {rounds.map((item) => (
          <li key={item.round} className="text-foreground text-sm leading-relaxed">
            Раунд {item.round} — {verdictConfig[item.review.verdict].label} — {item.review.score}
          </li>
        ))}
      </ol>
    </details>
  );
}

function formatDuration(ms: number) {
  if (ms < 1000) return `${Math.max(0, Math.round(ms))} мс`;
  return `${(ms / 1000).toFixed(1)} с`;
}

export function RunMeta({
  durationMs,
  promptVersions,
}: {
  durationMs: number;
  promptVersions: { coach: string; reviewer: string };
}) {
  return (
    <dl className="text-muted-foreground grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
      <div className="flex items-center gap-2">
        <dt className="flex items-center gap-1.5 font-medium tracking-wide uppercase">
          <Timer className="size-3.5" aria-hidden="true" />
          Время
        </dt>
        <dd className="text-foreground font-medium tabular-nums">{formatDuration(durationMs)}</dd>
      </div>
      <div className="flex items-center gap-2">
        <dt className="flex items-center gap-1.5 font-medium tracking-wide uppercase">
          <BookOpen className="size-3.5" aria-hidden="true" />
          Промпты
        </dt>
        <dd className="text-foreground font-medium">
          коуч {promptVersions.coach} · ревьюер {promptVersions.reviewer}
        </dd>
      </div>
    </dl>
  );
}

export function ToolCallsList({ toolCalls }: { toolCalls: ToolCallRecord[] }) {
  return (
    <div className="space-y-3">
      <p className="text-muted-foreground flex items-center gap-2 text-sm font-medium">
        <ListChecks className="size-4" aria-hidden="true" />
        Что сделал агент
      </p>
      {toolCalls.length ? (
        <ol className="flex flex-wrap gap-2">
          {toolCalls.map((call, index) => (
            <li
              key={`${call.name}-${index}`}
              className="bg-muted/45 text-foreground inline-flex min-h-8 items-center gap-2 rounded-md px-2.5 py-1.5 text-xs font-medium"
            >
              <span className="text-muted-foreground tabular-nums">{index + 1}</span>
              {formatToolCallLabel(call)}
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-muted-foreground text-sm">Инструменты не вызывались</p>
      )}
    </div>
  );
}
