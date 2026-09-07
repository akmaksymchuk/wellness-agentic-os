import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { McpServerConfig } from "@cursor/sdk";

import {
  HEALTH_COACH_MCP_TOOLS,
  healthMcpServerConfigs,
  type HealthMcpServerConfig,
  type HealthMcpServerName,
} from "./servers.config";

export { HEALTH_COACH_MCP_TOOLS, type HealthMcpServerName };
export const MARKDOWN_HEALTH_MCP_NAME = "markdown-health" satisfies HealthMcpServerName;

export type MarkdownHealthMcpClient = {
  listTools(): Promise<Array<{ name: string; description?: string }>>;
  listResources(): Promise<Array<{ uri: string; name?: string }>>;
  readResource(uri: string): Promise<unknown>;
  callTool(name: string, args?: Record<string, unknown>): Promise<unknown>;
  close(): Promise<void>;
};

export type ResolvedMcpSpawn = {
  name: HealthMcpServerName;
  command: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
};

const ENV_PLACEHOLDER_PATTERN = /\{env:([A-Z0-9_]+)\}/g;

function stringEnv(env: NodeJS.ProcessEnv): Record<string, string> {
  return Object.fromEntries(
    Object.entries(env).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
}

function resolveTemplate(value: string, root: string): string {
  return value
    .replaceAll("{root}", root)
    .replace(ENV_PLACEHOLDER_PATTERN, (_match, envName: string) => process.env[envName] ?? "");
}

function resolveEnv(env: Record<string, string> | undefined, root: string): Record<string, string> {
  if (!env) return {};
  return Object.fromEntries(Object.entries(env).map(([key, value]) => [key, resolveTemplate(value, root)]));
}

export function isHealthMcpEnabled(config: HealthMcpServerConfig): boolean {
  if (config.enabled) return true;
  return Boolean(config.enableWhenEnv && process.env[config.enableWhenEnv]);
}

export function enabledHealthMcpConfigs(
  configs: HealthMcpServerConfig[] = healthMcpServerConfigs,
): HealthMcpServerConfig[] {
  return configs.filter(isHealthMcpEnabled);
}

export function resolveHealthMcpSpawn(
  root: string,
  config: HealthMcpServerConfig,
  options: { applyAllowedTools?: boolean } = {},
): ResolvedMcpSpawn {
  const applyAllowedTools = options.applyAllowedTools ?? true;
  const env = {
    ...stringEnv(process.env),
    ...resolveEnv(config.env, root),
  };
  if (applyAllowedTools && config.allowedTools?.length) {
    env.HEALTH_COACH_ALLOWED_TOOLS = config.allowedTools.join(",");
  }

  return {
    name: config.name,
    command: resolveTemplate(config.command, root),
    args: config.args.map((arg) => resolveTemplate(arg, root)),
    cwd: root,
    env,
  };
}

function toCursorConfig(spawn: ResolvedMcpSpawn): McpServerConfig {
  return {
    type: "stdio",
    command: spawn.command,
    args: spawn.args,
    cwd: spawn.cwd,
    env: spawn.env,
  };
}

/** Inline stdio map for `@cursor/sdk`. The SDK, not harness, spawns these processes for the coach. */
export function cursorMcpServers(root: string): Record<string, McpServerConfig> {
  return Object.fromEntries(
    enabledHealthMcpConfigs().map((config) => [config.name, toCursorConfig(resolveHealthMcpSpawn(root, config))]),
  );
}

function wrapClient(client: Client): MarkdownHealthMcpClient {
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
    async callTool(toolName: string, args: Record<string, unknown> = {}) {
      const result = await client.callTool({ name: toolName, arguments: args });
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
        throw new Error(text || `MCP tool ${toolName} failed.`);
      }
      return result;
    },
    async close() {
      await client.close();
    },
  };
}

async function connectStdioClient(spawn: ResolvedMcpSpawn, clientName: string): Promise<MarkdownHealthMcpClient> {
  const transport = new StdioClientTransport({
    command: spawn.command,
    args: spawn.args,
    cwd: spawn.cwd,
    env: spawn.env,
  });
  const client = new Client({ name: clientName, version: "1.0.0" });
  await client.connect(transport);
  return wrapClient(client);
}

/**
 * Harness/inspect client for markdown-health.
 * Cursor SDK does not expose a live MCP handle, so save_health_plan goes through this client.
 */
export async function createMarkdownHealthMcpClient(root: string): Promise<MarkdownHealthMcpClient> {
  const config = healthMcpServerConfigs.find((item) => item.name === MARKDOWN_HEALTH_MCP_NAME);
  if (!config) throw new Error("markdown-health MCP server is missing from servers.config.ts.");
  return connectStdioClient(
    resolveHealthMcpSpawn(root, config, { applyAllowedTools: false }),
    "markdown-health-client",
  );
}

export async function createConfiguredMcpClient(
  root: string,
  config: HealthMcpServerConfig,
): Promise<MarkdownHealthMcpClient> {
  return connectStdioClient(resolveHealthMcpSpawn(root, config), `${config.name}-inspect`);
}
