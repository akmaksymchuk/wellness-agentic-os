# Local Wellness Agent

Simple Next.js App Router chat UI for the Health Coach Agent and Safety Reviewer Agent loop.

Runtime uses Cursor SDK: `classifyIntent` on `composer-2.5`, coach and Safety Reviewer on `grok-4.6`. Cursor IDE + Composer is the coding tool; the coach/reviewer loop still runs in `src/harness/runHealthAgent.ts`, wrapped by `src/os/runOS.ts`. The chat page streams harness stage events through `/api/chat` (Vercel AI SDK as transport only). The JSON endpoint `/api/agent/run` goes through the same OS wrapper.

## Setup

1. `npm install`
2. Create `.env` with `CURSOR_API_KEY` from [Cursor Dashboard → Integrations](https://cursor.com/dashboard/integrations). Optional: `CURSOR_MODEL=grok-4.6` (coach/reviewer), `CURSOR_ROUTER_MODEL=composer-2.5` (intent only).
3. Optional: `NOTION_TOKEN` for the official Notion MCP (disabled until the token is present).
4. RAG (optional until you need knowledge search): add `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Run the SQL in `docs/001_create_knowledge_chunks.sql` (same as `supabase/migrations/001_knowledge.sql`). For local embeddings, install [Ollama](https://ollama.com), `ollama pull nomic-embed-text`, keep Ollama running, then `npm run ingest`. Defaults: `EMBEDDING_PROVIDER=ollama`, `EMBEDDING_BASE_URL=http://127.0.0.1:11434/v1`, `EMBEDDING_MODEL=nomic-embed-text`, `EMBEDDING_DIM=768`. To switch later to an OpenAI-compatible embeddings key, set `EMBEDDING_PROVIDER=openai`, `EMBEDDING_API_KEY`, model and dim, apply `docs/002_resize_embedding_dim.sql` if the dim changes, then ingest again. Do not use `CURSOR_API_KEY` for embeddings.

## Memory vs RAG

`data/profile.md` and `data/log.md` are personal memory: who you are and what you logged. They stay in markdown and MCP and are never copied into Postgres. `data/recipes.md` is the same layer — favorite dishes for this person, via `list_recipes`. `data/habits.md` is the habit tracker (`read_habits` / `check_habit`). `data/preferences.md` is harness-only: confirmed likes after an explicit «запомни». `knowledge/*.md` is shared know-how (recipes, nutrition, training, recovery) that ingest splits by `##`, embeds, and stores in Supabase `knowledge_chunks`. The coach should call `searchKnowledge` first and not invent meals from scratch; retrieval is one embed and one cosine search. Cursor runs the agent loop; embeddings use a separate OpenAI-compatible endpoint (Ollama now, another key later), and a model change requires a full re-ingest.

## Run

```bash
npm run dev
```

Open `http://localhost:3000`, type a task in the chat, and send it. The timeline updates while the harness runs; the approved plan is then typed into the assistant message. History lives only in the page — reload or «Новая сессия» clears it. `POST /api/agent/run` still returns the full JSON result.

The coach reads markdown data, optional filesystem access, weather forecasts, and
Notion tools through MCP servers configured in `src/mcp/servers.config.ts`.
Approved plans are saved to `data/output.md` through the local markdown MCP;
generated shopping lists still use a local tool and are saved to
`data/shopping.md`. Knowledge search uses the local `searchKnowledge` tool after
`npm run ingest`.

## MCP

MCP servers are configured in `src/mcp/servers.config.ts`. Adding a server is a
new config entry with `{ name, command, args, env?, enabled }`; the harness does
not need per-server code changes. Enabled servers are passed to Cursor SDK as
inline `mcpServers`; the SDK starts the stdio processes. Traces/UI mark every
call as `[MCP · markdown-health]`, `[MCP · filesystem]`, `[MCP · weather]`,
`[MCP · notion]`, `[local · shopping]` / `[local · workouts]`, or
`[RAG · knowledge]`.

A server with `enabled: false` is skipped unless its `enableWhenEnv` variable is
set (Notion + `NOTION_TOKEN`). Missing token = silent skip, no error.

```bash
npm run mcp:inspect
```

The inspector reads the same config, starts enabled stdio servers, lists
tools/resources, and closes the processes.

| Server | Package / command | What it gives | Authorization |
| --- | --- | --- | --- |
| `markdown-health` | local `src/mcp/markdownHealthServer.ts` | `read_profile`, `read_recent_logs`, `list_recipes`, `read_habits`, `check_habit`; harness-only `append_daily_log`, `save_health_plan`, `update_preferences` | none |
| `filesystem` | `@modelcontextprotocol/server-filesystem` via `npx` | file access for explicit save/read tasks | none; launch args allow only `data/` and `plans/` |
| `weather` | `@cynosure-mcp/weather` via `npx` | Open-Meteo current weather and forecast tools by city or coordinates | none; Open-Meteo is keyless for this use |
| `notion` | official `@notionhq/notion-mcp-server` via `npx` | Notion API tools, including page creation/update | `NOTION_TOKEN`; disabled by default and auto-starts only when the token is present |

Selected weather package: `@cynosure-mcp/weather@1.0.4`. It runs on local Node,
uses the free Open-Meteo API, requires no API key, supports stdio, and exposes
forecast tools by city or coordinates.

Harness keeps a separate short-lived MCP client for `save_health_plan`,
`append_daily_log`, and `update_preferences` after reviewer approve. The coach
is not given those tools.

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
- `append_daily_log` (harness after approve)
- `save_health_plan` (harness after approve)
- `update_preferences` (harness after «запомни» / «мне понравилось»)
- `list_recipes`
- `read_habits`
- `check_habit`

Resources:
- `profile://me` -> `data/profile.md`
- `logs://recent` -> recent entries from `data/log.md`
- `recipes://all` -> `data/recipes.md`
- `plans://latest` -> `data/output.md`

### До MCP / После MCP

До MCP каждая интеграция с локальными данными подключалась к агенту вручную как отдельный `customTool`: профиль, дневник, рецепты и сохранение плана жили рядом с кодом агента.

После MCP эти markdown-данные доступны через стандартный stdio-сервер. Для Health Coach это такие же tools в trace, но источник теперь внешний процесс с единым протоколом. Локальными tools остаются `generateShoppingList`, `suggestWorkoutTemplate` и `searchKnowledge`: первые два считают шаблоны в приложении, RAG ходит в pgvector через прямой fetch.

В `src/skills/` активны `shopping.ts`, `workouts.ts` и `knowledge.ts`. Старые прямые wrappers для markdown-данных помечены как `*.legacy.ts`: они оставлены как учебный пример состояния «до MCP», но агент их больше не подключает.

## Путь проекта

Сначала это был один агент с инструкциями: Health Coach пишет план, Safety Reviewer его проверяет. UI появился как тонкая оболочка — сначала JSON-кнопка, затем чат со стримом этапов. Harness собрал цикл в код: раунды, pre-check, сохранение только после approve. Локальные tools (список покупок, шаблон тренировки) остались в процессе приложения. Traces в `runs/` дали replay и eval без внешнего трейсера. MCP вынес профиль, лог и рецепты в stdio-сервер, а filesystem / weather / Notion подключаются конфигом. RAG добавил общую базу `knowledge/` в pgvector через `searchKnowledge`. Чат связал эти события в таймлайн. OS-слой поверх того же агента: `classifyIntent` выбирает модуль по описанию, harness получает другой промпт и набор tools, reviewer остаётся инвариантом, после approve обновляется память.

## Как дебажить агента

Каждый успешный запуск сохраняет локальный trace в `runs/run-<timestamp>.json`.
Внутри есть задача, версии промптов, модель коуча (`CURSOR_MODEL` / `grok-4.6`), модуль и `intentConfidence`, раунды ревью, вызовы tools, итоговый score,
verdict и длительность. Сами файлы в `runs/` в git не попадают, кроме `runs/run-example.json`.

```bash
npm run replay runs/run-XXX.json
```

Replay берет задачу из trace, запускает текущий `runOS` и показывает old vs new
по verdict, score, module, раундам, toolCalls и promptVersions. Это удобно после правки промпта
или модели.

```bash
npm run eval
```

Eval последовательно прогоняет JSON-кейсы из `evals/cases/` и печатает таблицу
PASS/FAIL. Кейс `bad-medical-request` ожидает `needs_human_professional` и проходит
только если safety gate остановил запуск до коуча. Кейс `knowledge-based-recipe`
проверяет retrieval: `searchKnowledge` вернул хотя бы один chunk из `recipes.md`.
Три OS-кейса (`os-a-daily-plan`, `os-b-recipes-dinner`, `os-c-habits`) проверяют
выбор модуля; habits специально идёт после recipes в том же процессе.
