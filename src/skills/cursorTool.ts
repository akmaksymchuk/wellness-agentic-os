import type { SDKCustomTool, SDKJsonValue } from "@cursor/sdk";
import type { z } from "zod";

import type { HealthMcpServerName } from "../mcp/servers.config";

export type ToolCallSource = HealthMcpServerName | "local";

export type ToolCallKind = "rag" | "mcp" | "local";

export type KnowledgeChunkTrace = {
  file: string;
  heading: string;
};

export type ToolCallRecord = {
  name: string;
  source?: ToolCallSource;
  args?: Record<string, SDKJsonValue>;
  result?: Record<string, SDKJsonValue>;
  chunks?: KnowledgeChunkTrace[];
};

function formatArgValue(value: SDKJsonValue): string {
  if (typeof value === "string") {
    if (!value) return "—";
    return value.length > 40 ? `${value.slice(0, 40)}…` : value;
  }
  return JSON.stringify(value);
}

export const LOCAL_TOOL_NAMES = new Set([
  "generateShoppingList",
  "suggestWorkoutTemplate",
  "searchKnowledge",
]);

export function toolSource(call: ToolCallRecord): ToolCallSource | null {
  if (call.name === "searchKnowledge") return "local";
  if (call.source) return call.source;
  if (LOCAL_TOOL_NAMES.has(call.name)) return "local";
  return null;
}

export function toolCallKind(call: ToolCallRecord): ToolCallKind | null {
  if (call.name === "searchKnowledge") return "rag";
  const source = toolSource(call);
  if (!source) return null;
  if (source === "local") return "local";
  return "mcp";
}

function localResource(name: string): string {
  if (name === "generateShoppingList") return "shopping";
  if (name === "suggestWorkoutTemplate") return "workouts";
  return name;
}

export function formatToolCallBadge(call: ToolCallRecord): string | null {
  const kind = toolCallKind(call);
  if (kind === "rag") return "[RAG · knowledge]";
  if (kind === "mcp") {
    const source = toolSource(call);
    return source ? `[MCP · ${source}]` : "[MCP]";
  }
  if (kind === "local") return `[local · ${localResource(call.name)}]`;
  return null;
}

export function formatToolCallDetail(call: ToolCallRecord): string | null {
  if (call.name === "searchKnowledge") {
    const query = typeof call.args?.query === "string" ? formatArgValue(call.args.query) : "—";
    const count = call.chunks?.length ?? (typeof call.result?.count === "number" ? call.result.count : "—");
    return `${query} · ${count} chunks`;
  }
  if (
    (call.name === "read_recent_logs" || call.name === "getRecentLog") &&
    typeof call.args?.days === "number"
  ) {
    return `${call.args.days} дн.`;
  }

  const entries = call.args
    ? Object.entries(call.args).filter(([, value]) => value !== undefined && value !== "")
    : [];
  if (!entries.length) return null;
  return entries.map(([key, value]) => `${key}: ${formatArgValue(value)}`).join(", ");
}

function parseKnowledgeChunks(output: string): KnowledgeChunkTrace[] {
  try {
    const parsed = JSON.parse(output) as unknown;
    const rows = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === "object" && Array.isArray((parsed as { chunks?: unknown }).chunks)
        ? (parsed as { chunks: unknown[] }).chunks
        : [];
    const chunks: KnowledgeChunkTrace[] = [];
    for (const row of rows) {
      if (!row || typeof row !== "object" || Array.isArray(row)) continue;
      const candidate = row as { file?: unknown; heading?: unknown };
      const file = typeof candidate.file === "string" ? candidate.file.trim() : "";
      const heading = typeof candidate.heading === "string" ? candidate.heading.trim() : "";
      if (!file || !heading) continue;
      chunks.push({ file, heading });
    }
    return chunks;
  } catch {
    return [];
  }
}

export function formatToolCallLabel(call: ToolCallRecord): string {
  const detail = formatToolCallDetail(call);
  return detail ? `${call.name} · ${detail}` : call.name;
}

/** Cursor analog of OpenAI Agents `tool()`: JSON Schema for the model + Zod parse in execute. */
export function defineCursorTool<T extends z.ZodType>(input: {
  description: string;
  parameters: T;
  jsonSchema: Record<string, SDKJsonValue>;
  execute: (args: z.infer<T>) => string | Promise<string>;
}): SDKCustomTool {
  return {
    description: input.description,
    inputSchema: input.jsonSchema,
    async execute(raw) {
      const parsed = input.parameters.parse(raw ?? {});
      return input.execute(parsed);
    },
  };
}

export function traceTools(
  tools: Record<string, SDKCustomTool>,
  onCall: (call: ToolCallRecord) => void,
): Record<string, SDKCustomTool> {
  return Object.fromEntries(
    Object.entries(tools).map(([name, tool]) => [
      name,
      {
        ...tool,
        async execute(args, context) {
          const output = await tool.execute(args, context);
          const chunks =
            name === "searchKnowledge" && typeof output === "string"
              ? parseKnowledgeChunks(output)
              : undefined;
          onCall({
            name,
            source: "local",
            args,
            ...(chunks
              ? {
                  chunks,
                  result: {
                    count: chunks.length,
                    headings: chunks.map((chunk) => chunk.heading),
                    files: chunks.map((chunk) => chunk.file),
                  },
                }
              : {}),
          });
          return output;
        },
      } satisfies SDKCustomTool,
    ]),
  );
}
