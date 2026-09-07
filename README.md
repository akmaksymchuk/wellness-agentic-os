# Local Wellness Agent

Simple Next.js App Router UI for the Health Coach Agent and Safety Reviewer Agent loop.

Runtime uses Cursor SDK (`composer-2.5` by default) instead of DeepSeek / OpenAI Chat Completions. Cursor IDE + Composer is the coding tool; the coach/reviewer loop still runs in `src/harness/runHealthAgent.ts`.

## Setup

1. `npm install`
2. Create `.env` with `CURSOR_API_KEY` from [Cursor Dashboard → Integrations](https://cursor.com/dashboard/integrations). Optional: `CURSOR_MODEL=composer-2.5`.
3. Optional: `NOTION_TOKEN` for the official Notion MCP (disabled until the token is present).

## Run

```bash
npm run dev
```

Open `http://localhost:3000`, enter one task, and press `Run Agent`.

The coach reads markdown data, optional filesystem access, weather forecasts, and
Notion tools through MCP servers configured in `src/mcp/servers.config.ts`.
Approved plans are saved to `data/output.md` through the local markdown MCP;
generated shopping lists still use a local tool and are saved to
`data/shopping.md`.

## MCP

MCP servers are configured in `src/mcp/servers.config.ts`. Adding a server is a
new config entry with `{ name, command, args, env?, enabled }`; the harness does
not need per-server code changes. Enabled servers are passed to Cursor SDK as
inline `mcpServers`; the SDK starts the stdio processes. Traces/UI mark every
call as `[markdown-health]`, `[filesystem]`, `[weather]`, `[notion]`, or `[local]`.

A server with `enabled: false` is skipped unless its `enableWhenEnv` variable is
set (Notion + `NOTION_TOKEN`). Missing token = silent skip, no error.

```bash
npm run mcp:inspect
```

The inspector reads the same config, starts enabled stdio servers, lists
tools/resources, and closes the processes.

| Server | Package / command | What it gives | Authorization |
| --- | --- | --- | --- |
| `markdown-health` | local `src/mcp/markdownHealthServer.ts` | `read_profile`, `read_recent_logs`, `append_daily_log`, `save_health_plan`, `list_recipes` over local markdown data | none |
| `filesystem` | `@modelcontextprotocol/server-filesystem` via `npx` | file access for explicit save/read tasks | none; launch args allow only `data/` and `plans/` |
| `weather` | `@cynosure-mcp/weather` via `npx` | Open-Meteo current weather and forecast tools by city or coordinates | none; Open-Meteo is keyless for this use |
| `notion` | official `@notionhq/notion-mcp-server` via `npx` | Notion API tools, including page creation/update | `NOTION_TOKEN`; disabled by default and auto-starts only when the token is present |

Selected weather package: `@cynosure-mcp/weather@1.0.4`. It runs on local Node,
uses the free Open-Meteo API, requires no API key, supports stdio, and exposes
forecast tools by city or coordinates.

Harness keeps a separate short-lived MCP client for `save_health_plan` after
reviewer approve. The coach is not given that tool.

### Guardrails

Principle: **prompt is a request; config is a wall**.

- `filesystem`: the process is launched with only `data/` and `plans/` as
  allowed directories. The coach prompt also asks the model to write plans only
  under `plans/` and working data only under `data/`.
- `notion`: access is limited by the Notion internal integration itself. Give
  that integration access only to one page or database named `Wellness`; the
  coach prompt asks the model to write only there.
- `weather`: read-only by nature, so it does not need the same filesystem or
  workspace write guardrails. It is used as context for outdoor activity
  planning, not for medical conclusions. Not every MCP server is equally dangerous.

### Demo Tasks

Weather, no custom integration code:

```text
Спланируй тренировку на завтра с учетом погоды.
```

The agent reads the city from `data/profile.md` (Warsaw), calls a `[weather]`
forecast tool, and moves outdoor activity indoors if the forecast is poor.

Filesystem:

```text
Составь wellness-план на завтра и сохрани мой план ещё и в отдельный файл plans/<дата>.md.
```

The filesystem server can write only inside `data/` and `plans/`.

Notion, only when `.env` contains `NOTION_TOKEN` for an internal integration
connected to `Wellness`:

```text
Составь план на завтра и сохрани план страницей в мой Notion Wellness.
```

Without `NOTION_TOKEN`, `notion` is skipped silently and the rest of the app
continues to work. The agent creates the page through official Notion MCP tools;
there is no app-side Notion wrapper or UI button.

### Notion Setup

1. In the Notion developer portal, create an internal integration and copy its token.
2. Add `NOTION_TOKEN=ntn_...` to `.env`.
3. Create one Notion page or database named `Wellness` and connect the integration there only.
4. Restart `npm run dev`, then run `npm run mcp:inspect`.

### Other Useful MCP Servers

Not connected here:

- Google Calendar: useful for scheduling workouts around meetings, but it
  requires OAuth, so it is intentionally outside this no-OAuth demo.
- Database: useful for structured health metrics or experiment logs.
- Web Search: useful for general research, but should be added with strict
  source and safety rules before being trusted by the coach.

### Local Markdown MCP

Tools:
- `read_profile`
- `read_recent_logs`
- `append_daily_log`
- `save_health_plan`
- `list_recipes`

Resources:
- `profile://me` -> `data/profile.md`
- `logs://recent` -> recent entries from `data/log.md`
- `recipes://all` -> `data/recipes.md`
- `plans://latest` -> `data/output.md`

### До MCP / После MCP

До MCP каждая интеграция с локальными данными подключалась к агенту вручную как отдельный `customTool`: профиль, дневник, рецепты и сохранение плана жили рядом с кодом агента.

После MCP эти markdown-данные доступны через стандартный stdio-сервер. Для Health Coach это такие же tools в trace, но источник теперь внешний процесс с единым протоколом. Локальными tools намеренно остались только `generateShoppingList` и `suggestWorkoutTemplate`, чтобы было видно различие: вычислительные/шаблонные действия остаются рядом с приложением, а доступ к данным идет через MCP.

В `src/skills/` активны только `shopping.ts` и `workouts.ts`. Старые прямые wrappers для markdown-данных помечены как `*.legacy.ts`: они оставлены как учебный пример состояния «до MCP», но агент их больше не подключает.

## Как дебажить агента

Каждый успешный запуск сохраняет локальный trace в `runs/run-<timestamp>.json`.
Внутри есть задача, версии промптов, модель (`CURSOR_MODEL` / `composer-2.5`), раунды ревью, вызовы tools, итоговый score,
verdict и длительность. Сами файлы в `runs/` в git не попадают, кроме `runs/run-example.json`.

```bash
npm run replay runs/run-XXX.json
```

Replay берет задачу из trace, запускает текущий `runHealthAgent` и показывает old vs new
по verdict, score, раундам, toolCalls и promptVersions. Это удобно после правки промпта
или модели.

```bash
npm run eval
```

Eval последовательно прогоняет 5 JSON-кейсов из `evals/cases/` и печатает таблицу
PASS/FAIL. Кейс `bad-medical-request` ожидает `needs_human_professional` и проходит
только если safety gate остановил запуск до коуча.
