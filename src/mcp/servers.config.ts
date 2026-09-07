import { join } from "node:path";

export type HealthMcpServerName = "markdown-health" | "filesystem" | "weather" | "notion";

export type HealthMcpServerConfig = {
  name: HealthMcpServerName;
  command: string;
  args: string[];
  env?: Record<string, string>;
  enabled: boolean;
  enableWhenEnv?: string;
  allowedTools?: string[];
};

export const HEALTH_COACH_MCP_TOOLS = [
  "read_profile",
  "read_recent_logs",
  "append_daily_log",
  "list_recipes",
] as const;

const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";

const npmCacheEnv = {
  NPM_CONFIG_CACHE: "{root}/.cache/npm",
};

/** Adding a server is a new entry here. Harness only reads enabled rows. */
export const healthMcpServerConfigs: HealthMcpServerConfig[] = [
  {
    name: "markdown-health",
    command: process.execPath,
    args: [
      join("{root}", "node_modules/tsx/dist/cli.mjs"),
      join("{root}", "src/mcp/markdownHealthServer.ts"),
    ],
    env: {
      HEALTH_DATA_ROOT: "{root}",
    },
    enabled: true,
    allowedTools: [...HEALTH_COACH_MCP_TOOLS],
  },
  {
    name: "filesystem",
    command: npxCommand,
    args: ["-y", "@modelcontextprotocol/server-filesystem", join("{root}", "data"), join("{root}", "plans")],
    env: npmCacheEnv,
    enabled: true,
  },
  {
    name: "weather",
    command: npxCommand,
    args: ["-y", "@cynosure-mcp/weather"],
    env: npmCacheEnv,
    enabled: true,
  },
  {
    name: "notion",
    command: npxCommand,
    args: ["-y", "@notionhq/notion-mcp-server"],
    env: {
      ...npmCacheEnv,
      NOTION_TOKEN: "{env:NOTION_TOKEN}",
    },
    enabled: false,
    enableWhenEnv: "NOTION_TOKEN",
  },
];
