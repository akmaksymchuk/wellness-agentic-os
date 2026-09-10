import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { appendFile, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";

const RECENT_LOG_RESOURCE_DAYS = 7;

type LogSection = {
  date: string;
  content: string;
};

function dataRoot() {
  return resolve(process.env.HEALTH_DATA_ROOT ?? process.cwd());
}

function dataPath(file: string) {
  return join(dataRoot(), "data", file);
}

function allowedToolNames(): Set<string> | null {
  const raw = process.env.HEALTH_COACH_ALLOWED_TOOLS;
  if (!raw?.trim()) return null;
  return new Set(
    raw
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean),
  );
}

function textContent(text: string) {
  return {
    content: [{ type: "text" as const, text }],
  };
}

async function readMarkdown(file: string): Promise<string> {
  return (await readFile(dataPath(file), "utf8")).trim();
}

function splitDatedSections(markdown: string): LogSection[] {
  const headingPattern = /^##\s+(\d{4}-\d{2}-\d{2})\s*$/gm;
  const headings = Array.from(markdown.matchAll(headingPattern));

  return headings
    .map((heading, index) => {
      const start = heading.index ?? 0;
      const end = headings[index + 1]?.index ?? markdown.length;
      return {
        date: heading[1],
        content: markdown.slice(start, end).trim(),
      };
    })
    .filter((section) => section.content.length > 0);
}

async function readRecentLogs(days: number): Promise<string> {
  const rawLog = await readFile(dataPath("log.md"), "utf8");
  const sections = splitDatedSections(rawLog);

  if (sections.length === 0) return rawLog.trim();

  return sections
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-days)
    .map((section) => section.content)
    .join("\n\n");
}

async function appendDailyLog(entry: string): Promise<{ ok: true }> {
  const normalizedEntry = entry.trim();
  if (!normalizedEntry) throw new Error("entry must not be empty.");

  await appendFile(dataPath("log.md"), `\n\n${normalizedEntry}\n`, "utf8");
  return { ok: true };
}

async function saveHealthPlan(markdown: string): Promise<{ ok: true }> {
  await writeFile(dataPath("output.md"), `${markdown.trim()}\n`, "utf8");
  return { ok: true };
}

async function updatePreferences(note: string): Promise<{ ok: true }> {
  const normalizedNote = note.trim();
  if (!normalizedNote) throw new Error("note must not be empty.");
  await appendFile(dataPath("preferences.md"), `\n\n${normalizedNote}\n`, "utf8");
  return { ok: true };
}

async function checkHabit(name: string, date?: string): Promise<{ ok: true; habit: string; date: string }> {
  const habit = name.trim();
  if (!habit) throw new Error("habit name must not be empty.");
  const checkedAt = date?.trim() || new Date().toISOString().slice(0, 10);
  await appendFile(dataPath("habits.md"), `\n- [x] ${habit} — ${checkedAt}\n`, "utf8");
  return { ok: true, habit, date: checkedAt };
}

function registerResources(server: McpServer) {
  server.registerResource(
    "profile",
    "profile://me",
    {
      title: "Wellness profile",
      description: "Local profile from data/profile.md.",
      mimeType: "text/markdown",
    },
    async (uri) => ({
      contents: [{ uri: uri.href, mimeType: "text/markdown", text: await readMarkdown("profile.md") }],
    }),
  );

  server.registerResource(
    "recent-logs",
    "logs://recent",
    {
      title: "Recent wellness logs",
      description: `Last ${RECENT_LOG_RESOURCE_DAYS} dated entries from data/log.md.`,
      mimeType: "text/markdown",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "text/markdown",
          text: await readRecentLogs(RECENT_LOG_RESOURCE_DAYS),
        },
      ],
    }),
  );

  server.registerResource(
    "recipes",
    "recipes://all",
    {
      title: "Favorite recipes",
      description: "Favorite recipes from data/recipes.md.",
      mimeType: "text/markdown",
    },
    async (uri) => ({
      contents: [{ uri: uri.href, mimeType: "text/markdown", text: await readMarkdown("recipes.md") }],
    }),
  );

  server.registerResource(
    "latest-plan",
    "plans://latest",
    {
      title: "Latest approved health plan",
      description: "Latest approved plan from data/output.md.",
      mimeType: "text/markdown",
    },
    async (uri) => ({
      contents: [{ uri: uri.href, mimeType: "text/markdown", text: await readMarkdown("output.md") }],
    }),
  );
}

function shouldRegister(name: string) {
  const allowed = allowedToolNames();
  return !allowed || allowed.has(name);
}

function registerTools(server: McpServer) {
  if (shouldRegister("read_profile")) {
    server.registerTool(
      "read_profile",
      {
        description:
          "Read the user's local wellness profile from data/profile.md before making personalized nutrition, activity, recovery, sleep, hydration, or habit recommendations.",
        inputSchema: {},
      },
      async () => textContent(await readMarkdown("profile.md")),
    );
  }

  if (shouldRegister("read_recent_logs")) {
    server.registerTool(
      "read_recent_logs",
      {
        description:
          "Read the last N dated entries from data/log.md. Use 3-7 days for normal planning unless the user asks for a different range.",
        inputSchema: {
          days: z.number().int().min(1).max(30).describe("How many recent dated diary entries to return."),
        },
      },
      async ({ days }) => textContent(await readRecentLogs(days)),
    );
  }

  if (shouldRegister("append_daily_log")) {
    server.registerTool(
      "append_daily_log",
      {
        description:
          "Append one complete markdown daily log entry to data/log.md. The entry should normally start with a '## YYYY-MM-DD' heading.",
        inputSchema: {
          entry: z.string().min(1).describe("Complete markdown daily log entry to append."),
        },
      },
      async ({ entry }) => textContent(JSON.stringify(await appendDailyLog(entry))),
    );
  }

  if (shouldRegister("save_health_plan")) {
    server.registerTool(
      "save_health_plan",
      {
        description:
          "Persist the final approved wellness plan to data/output.md. Only the harness should call this after Safety Reviewer approval.",
        inputSchema: {
          markdown: z
            .string()
            .min(1)
            .describe("The complete approved wellness plan in Markdown, without summaries or extra commentary."),
        },
      },
      async ({ markdown }) => textContent(JSON.stringify(await saveHealthPlan(markdown))),
    );
  }

  if (shouldRegister("list_recipes")) {
    server.registerTool(
      "list_recipes",
      {
        description:
          "Read data/recipes.md with the user's favorite simple meals for meal variety, preferred recipes, and familiar foods.",
        inputSchema: {},
      },
      async () => textContent(await readMarkdown("recipes.md")),
    );
  }

  if (shouldRegister("read_habits")) {
    server.registerTool(
      "read_habits",
      {
        description: "Read the local habit tracker from data/habits.md.",
        inputSchema: {},
      },
      async () => textContent(await readMarkdown("habits.md")),
    );
  }

  if (shouldRegister("check_habit")) {
    server.registerTool(
      "check_habit",
      {
        description: "Mark a habit as done in data/habits.md for a calendar date.",
        inputSchema: {
          name: z.string().min(1).describe("Habit name as it appears in data/habits.md."),
          date: z.string().optional().describe("ISO date YYYY-MM-DD. Defaults to today."),
        },
      },
      async ({ name, date }) => textContent(JSON.stringify(await checkHabit(name, date))),
    );
  }

  if (shouldRegister("update_preferences")) {
    server.registerTool(
      "update_preferences",
      {
        description:
          "Append a confirmed preference to data/preferences.md. Only the harness should call this after an explicit user signal.",
        inputSchema: {
          note: z.string().min(1).describe("Markdown note to append to data/preferences.md."),
        },
      },
      async ({ note }) => textContent(JSON.stringify(await updatePreferences(note))),
    );
  }
}

export function createMarkdownHealthServer() {
  const server = new McpServer({
    name: "markdown-health",
    version: "1.0.0",
  });

  registerTools(server);
  registerResources(server);

  return server;
}

async function main() {
  const server = createMarkdownHealthServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error("Markdown Health MCP server failed:", error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
