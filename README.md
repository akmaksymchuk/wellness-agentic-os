# Local Wellness Agent

Simple Next.js App Router UI for the Health Coach Agent and Safety Reviewer Agent loop.

Runtime uses Cursor SDK (`composer-2.5` by default) instead of DeepSeek / OpenAI Chat Completions. Cursor IDE + Composer is the coding tool; the coach/reviewer loop still runs in `src/harness/runHealthAgent.ts`.

## Setup

1. `npm install`
2. Create `.env` with `CURSOR_API_KEY` from [Cursor Dashboard → Integrations](https://cursor.com/dashboard/integrations). Optional: `CURSOR_MODEL=composer-2.5`.

## Run

```bash
npm run dev
```

Open `http://localhost:3000`, enter one task, and press `Run Agent`.

The coach reads local markdown data through the local MCP server when it needs context. Approved plans are saved to `data/output.md` through MCP; generated shopping lists still use a local tool and are saved to `data/shopping.md`.

## MCP

Markdown health data is exposed through a local stdio MCP server:

```bash
npm run mcp:inspect
```

The inspector starts `src/mcp/markdownHealthServer.ts`, lists its tools, lists its resources, reads each resource through MCP, prints a short preview, and then closes the process. There are no external MCP servers or network transports.

Cursor SDK is the MCP client for the Health Coach: harness passes an inline `mcpServers` stdio config, and the SDK starts the process. Harness keeps a separate short-lived MCP client for `save_health_plan` after reviewer approve and for `mcp:inspect`.

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
