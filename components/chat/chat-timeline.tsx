import {
  CheckCircle2,
  Compass,
  FileCheck2,
  LoaderCircle,
  RefreshCw,
  Search,
  ShieldCheck,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { stageLabels, type TimelineData } from "@/src/chat/messages";
import {
  formatToolCallBadge,
  formatToolCallDetail,
  toolCallKind,
  type ToolCallRecord,
} from "@/src/skills/cursorTool";

type ChatTimelineProps = {
  items: TimelineData[];
};

const stageIcons: Record<string, LucideIcon> = {
  reading_profile: FileCheck2,
  searching_knowledge: Search,
  generating_plan: LoaderCircle,
  reviewing_safety: ShieldCheck,
  revising: RefreshCw,
  final_approved_plan: CheckCircle2,
};

function stageLabel(item: Extract<TimelineData, { kind: "stage" }>) {
  const label = stageLabels[item.stage];
  if (item.stage === "revising" && item.round) return `${label} (раунд ${item.round})`;
  return label;
}

function reviewSummary(item: Extract<TimelineData, { kind: "stage" }>) {
  if (item.stage !== "reviewing_safety" || item.status !== "complete") return "";
  if (typeof item.score !== "number" || !item.verdict) return "";
  return `${item.verdict} · ${item.score}/10`;
}

export function ChatTimeline({ items }: ChatTimelineProps) {
  if (!items.length) return null;

  return (
    <ol
      aria-label="Статус работы агента"
      aria-live="polite"
      className="border-border/80 bg-muted/35 space-y-1 rounded-xl border p-2.5"
    >
      {items.map((item, index) => {
        if (item.kind === "module") {
          return (
            <li
              key={`module-${item.module}-${index}`}
              className="text-foreground flex min-w-0 items-start gap-2 rounded-lg px-2 py-1.5 text-sm"
            >
              <Compass className="text-primary mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0">
                <span className="font-medium">Module: {item.module}</span>
                <span className="text-muted-foreground block pt-0.5 text-xs">
                  confidence {item.confidence.toFixed(2)}
                </span>
              </span>
            </li>
          );
        }

        if (item.kind === "tool") {
          const call = item.toolCall as ToolCallRecord;
          const badge = formatToolCallBadge(call);
          const detail = formatToolCallDetail(call);
          const kind = toolCallKind(call);

          return (
            <li
              key={`${call.name}-${index}`}
              className="text-muted-foreground flex min-w-0 items-start gap-2 rounded-lg px-2 py-1.5 text-xs"
            >
              {kind === "rag" ? (
                <Search className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              ) : (
                <Wrench className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              )}
              <span className="min-w-0 space-y-0.5">
                <span className="flex flex-wrap items-center gap-1.5">
                  <span className="text-foreground font-medium">{call.name}</span>
                  {badge ? (
                    <Badge
                      variant="outline"
                      className="h-5 rounded-sm px-1.5 text-[10px] font-semibold tracking-wide"
                    >
                      {badge}
                    </Badge>
                  ) : null}
                </span>
                {detail ? (
                  <span className="block break-words text-[11px] leading-snug">{detail}</span>
                ) : null}
              </span>
            </li>
          );
        }

        const Icon = stageIcons[item.stage] ?? LoaderCircle;
        const isActive = item.status === "active";
        const isLoading = isActive && item.stage === "generating_plan";
        const summary = reviewSummary(item);

        return (
          <li
            key={`${item.stage}-${item.round ?? "base"}`}
            className={cn(
              "text-foreground flex min-w-0 items-start gap-2 rounded-lg px-2 py-1.5 text-sm",
              isActive && "chat-pulse",
            )}
          >
            <Icon
              aria-hidden="true"
              className={cn(
                "mt-0.5 size-4 shrink-0",
                isActive ? "text-primary" : "text-emerald-600",
                isLoading && "chat-spin",
              )}
            />
            <span className="min-w-0">
              <span className="font-medium">{stageLabel(item)}</span>
              {item.query ? (
                <span className="text-muted-foreground block break-words pt-0.5 text-xs">{item.query}</span>
              ) : null}
              {summary ? (
                <span className="text-muted-foreground block pt-0.5 text-xs">{summary}</span>
              ) : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
