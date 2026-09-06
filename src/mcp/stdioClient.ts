import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { McpServerConfig } from "@cursor/sdk";
import { join } from "node:path";

export const MARKDOWN_HEALTH_MCP_NAME = "markdown-health";

export const HEALTH_COACH_MCP_TOOLS = [
  "read_profile",
  "read_recent_logs",
  "append_daily_log",
  "list_recipes",
] as const;

export type MarkdownHealthMcpClient = {
  listTools(): Promise<Array<{ name: string; description?: string }>>;
  listResources(): Promise<Array<{ uri: string; name?: string }>>;
  readResource(uri: string): Promise<unknown>;
  callTool(name: string, args?: Record<string, unknown>): Promise<unknown>;
  close(): Promise<void>;
};

type SpawnOptions = {
  allowedTools?: readonly string[];
};

function stringEnv(env: NodeJS.ProcessEnv): Record<string, string> {
  return Object.fromEntries(
    Object.entries(env).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
}

function serverCommand(root: string) {
  return {
    command: process.execPath,
    args: [join(root, "node_modules/tsx/dist/cli.mjs"), join(root, "src/mcp/markdownHealthServer.ts")],
    cwd: root,
  };
}

function serverEnv(root: string, allowedTools?: readonly string[]): Record<string, string> {
  return {
    ...stringEnv(process.env),
    HEALTH_DATA_ROOT: root,
    ...(allowedTools?.length ? { HEALTH_COACH_ALLOWED_TOOLS: allowedTools.join(",") } : {}),
  };
}

/** Inline stdio config for `@cursor/sdk`. The SDK, not harness, spawns this process for the coach. */
export function markdownHealthMcpConfig(root: string, options: SpawnOptions = {}): McpServerConfig {
  const spawn = serverCommand(root);
  return {
    type: "stdio",
    command: spawn.command,
    args: spawn.args,
    cwd: spawn.cwd,
    env: serverEnv(root, options.allowedTools),
  };
}

/**
 * Harness/inspect client: a short-lived stdio process we can list, read, and callTool.
 * Cursor SDK does not expose a live MCP handle, so save_health_plan goes through this client.
 */
export async function createMarkdownHealthMcpClient(
  root: string,
  options: SpawnOptions = {},
): Promise<MarkdownHealthMcpClient> {
  const spawn = serverCommand(root);
  const transport = new StdioClientTransport({
    command: spawn.command,
    args: spawn.args,
    cwd: spawn.cwd,
    env: serverEnv(root, options.allowedTools),
  });
  const client = new Client({ name: "markdown-health-client", version: "1.0.0" });
  await client.connect(transport);

  return {
    async listTools() {
      const result = await client.listTools();
      return result.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
      }));
    },
    async listResources() {
      const result = await client.listResources();
      return result.resources.map((resource) => ({
        uri: resource.uri,
        name: resource.name,
      }));
    },
    readResource(uri: string) {
      return client.readResource({ uri });
    },
    async callTool(name: string, args: Record<string, unknown> = {}) {
      const result = await client.callTool({ name, arguments: args });
      if (result.isError) {
        const content = Array.isArray(result.content) ? result.content : [];
        const text = content
          .map((block) =>
            block && typeof block === "object" && "text" in block && typeof block.text === "string"
              ? block.text
              : "",
          )
          .filter(Boolean)
          .join("\n")
          .trim();
        throw new Error(text || `MCP tool ${name} failed.`);
      }
      return result;
    },
    async close() {
      await client.close();
    },
  };
}
