import { Agent, CursorAgentError } from "@cursor/sdk";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const TEXT_ONLY = `
Не используй инструменты. Не читай и не меняй файлы. Не запускай команды.
Ответь только текстом в роли указанного агента.
`.trim();

export type CompleteTextInput = {
  root: string;
  apiKey: string;
  model: string;
  agentName: string;
  instructions: string;
  userMessage: string;
};

export async function completeText(input: CompleteTextInput): Promise<string> {
  const cwd = join(input.root, "tmp", "cursor-agent");
  await mkdir(cwd, { recursive: true });
  const prompt = [
    `Агент: ${input.agentName}`,
    TEXT_ONLY,
    "Инструкции:",
    input.instructions,
    "Сообщение:",
    input.userMessage,
  ].join("\n\n");

  try {
    const result = await Agent.prompt(prompt, {
      apiKey: input.apiKey,
      model: { id: input.model },
      name: input.agentName,
      tools: [],
      local: { cwd, settingSources: [] },
    });
    if (result.status !== "finished") {
      throw new Error(result.error?.message ?? `Cursor agent status: ${result.status}`);
    }
    const text = result.result?.trim() ?? "";
    if (!text) throw new Error(`${input.agentName} вернул пустой ответ.`);
    return text;
  } catch (error) {
    if (error instanceof CursorAgentError) {
      throw new Error(`Cursor SDK не запустился: ${error.message}`);
    }
    throw error;
  }
}
