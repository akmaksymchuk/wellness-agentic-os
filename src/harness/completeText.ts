import {
  Agent,
  CursorAgentError,
  type McpServerConfig,
  type SDKCustomTool,
  type SDKJsonValue,
} from "@cursor/sdk";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import type { HealthMcpServerName } from "../mcp/servers.config";
import type { ToolCallRecord, ToolCallSource } from "../skills/cursorTool";

const TEXT_ONLY = `
Не используй инструменты. Не читай и не меняй файлы. Не запускай команды.
Ответь только текстом в роли указанного агента.
`.trim();

const COACH_TOOLS = `
Можно вызывать только переданные custom tools и tools подключённых MCP-серверов из конфига.
Не читай и не меняй файлы репозитория напрямую и не запускай команды в терминале.
Профиль, дневник и личные рецепты бери через markdown-health.
Список покупок, шаблон тренировки и поиск в базе знаний (searchKnowledge) — через custom tools.
Не вызывай save_health_plan, append_daily_log и update_preferences: их вызывает harness после одобрения Safety Reviewer.
`.trim();

const KNOWN_MCP_SOURCES = new Set<HealthMcpServerName>([
  "markdown-health",
  "filesystem",
  "weather",
  "notion",
]);

const SKIP_MCP_TOOL_NAMES = new Set(["GetMcpTools", "GetMcpResources", "ListMcpResources"]);

export type CompleteTextInput = {
  root: string;
  apiKey: string;
  model: string;
  agentName: string;
  instructions: string;
  userMessage: string;
  customTools?: Record<string, SDKCustomTool>;
  mcpServers?: Record<string, McpServerConfig>;
  onToolCall?: (call: ToolCallRecord) => void;
};

function asArgs(value: unknown): Record<string, SDKJsonValue> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Record<string, SDKJsonValue>;
}

function sourceFromProvider(providerIdentifier: string | undefined): ToolCallSource {
  if (!providerIdentifier) return "markdown-health";
  if (providerIdentifier === "markdown-health" || providerIdentifier.startsWith("markdown-health-")) {
    return "markdown-health";
  }
  if (KNOWN_MCP_SOURCES.has(providerIdentifier as HealthMcpServerName)) {
    return providerIdentifier as HealthMcpServerName;
  }
  return "markdown-health";
}

function noteMcpTool(toolCall: unknown, onToolCall?: (call: ToolCallRecord) => void) {
  if (!toolCall || typeof toolCall !== "object") return;
  const call = toolCall as {
    type?: string;
    args?: { toolName?: string; providerIdentifier?: string; args?: unknown };
  };
  if (call.type !== "mcp") return;
  if (call.args?.providerIdentifier === "custom-user-tools") return;
  const name = call.args?.toolName;
  if (!name || SKIP_MCP_TOOL_NAMES.has(name)) return;
  const args = asArgs(call.args?.args);
  onToolCall?.({
    name,
    source: sourceFromProvider(call.args?.providerIdentifier),
    ...(args ? { args } : {}),
  });
}

export async function completeText(input: CompleteTextInput): Promise<string> {
  const cwd = join(input.root, "tmp", "cursor-agent");
  await mkdir(cwd, { recursive: true });
  const hasCustomTools = Boolean(input.customTools && Object.keys(input.customTools).length);
  const hasMcpServers = Boolean(input.mcpServers && Object.keys(input.mcpServers).length);
  const hasTools = hasCustomTools || hasMcpServers;
  const prompt = [
    `Агент: ${input.agentName}`,
    hasTools ? COACH_TOOLS : TEXT_ONLY,
    "Инструкции:",
    input.instructions,
    "Сообщение:",
    input.userMessage,
  ].join("\n\n");

  try {
    if (!hasTools) {
      const result = await Agent.prompt(prompt, {
        apiKey: input.apiKey,
        model: { id: input.model },
        name: input.agentName,
        tools: [],
        local: {
          cwd,
          settingSources: [],
        },
      });
      if (result.status !== "finished") {
        throw new Error(result.error?.message ?? `Cursor agent status: ${result.status}`);
      }
      const text = result.result?.trim() ?? "";
      if (!text) throw new Error(`${input.agentName} вернул пустой ответ.`);
      return text;
    }

    // create/send keeps onDelta so MCP tool names land in the same toolCalls as custom tools.
    const agent = await Agent.create({
      apiKey: input.apiKey,
      model: { id: input.model },
      name: input.agentName,
      tools: ["mcp"],
      ...(hasMcpServers ? { mcpServers: input.mcpServers } : {}),
      local: {
        cwd,
        settingSources: [],
        ...(hasCustomTools ? { customTools: input.customTools } : {}),
      },
    });

    try {
      let recordedFromDelta = 0;
      const run = await agent.send(prompt, {
        onDelta: ({ update }) => {
          if (update.type !== "tool-call-completed") return;
          noteMcpTool(update.toolCall, (call) => {
            recordedFromDelta += 1;
            input.onToolCall?.(call);
          });
        },
      });
      const result = await run.wait();
      if (result.status !== "finished") {
        throw new Error(result.error?.message ?? `Cursor agent status: ${result.status}`);
      }

      if (recordedFromDelta === 0 && run.supports("conversation")) {
        const turns = await run.conversation();
        for (const turn of turns) {
          if (turn.type !== "agentConversationTurn") continue;
          for (const step of turn.turn.steps) {
            if (step.type === "toolCall") noteMcpTool(step.message, input.onToolCall);
          }
        }
      }

      const text = result.result?.trim() ?? "";
      if (!text) throw new Error(`${input.agentName} вернул пустой ответ.`);
      return text;
    } finally {
      agent.close();
    }
  } catch (error) {
    if (error instanceof CursorAgentError) {
      throw new Error(`Cursor SDK не запустился: ${error.message}`);
    }
    throw error;
  }
}
