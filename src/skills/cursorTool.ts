import type { SDKCustomTool, SDKJsonValue } from "@cursor/sdk";
import type { z } from "zod";

export type ToolCallRecord = {
  name: string;
  args?: Record<string, SDKJsonValue>;
};

function formatArgValue(value: SDKJsonValue): string {
  if (typeof value === "string") {
    if (!value) return "—";
    return value.length > 40 ? `${value.slice(0, 40)}…` : value;
  }
  return JSON.stringify(value);
}

export function formatToolCallLabel(call: ToolCallRecord): string {
  if (call.name === "getRecentLog" && typeof call.args?.days === "number") {
    return `getRecentLog · ${call.args.days} дн.`;
  }

  const entries = call.args
    ? Object.entries(call.args).filter(([, value]) => value !== undefined && value !== "")
    : [];
  if (!entries.length) return call.name;

  const detail = entries.map(([key, value]) => `${key}: ${formatArgValue(value)}`).join(", ");
  return `${call.name} · ${detail}`;
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
          onCall({ name, args });
          return tool.execute(args, context);
        },
      } satisfies SDKCustomTool,
    ]),
  );
}
