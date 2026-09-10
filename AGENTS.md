# Repository Guidelines

## Структура проекта и модули

Это локальное Next.js App Router приложение для запуска Health Coach Agent через веб-интерфейс.

Два слоя инструментов (как у автора курса: IDE пишет систему, код оркестрирует агентов):

- **Разработка:** Cursor IDE + Composer — аналог Codex / Claude Code. Правки кода живут здесь, не в чате вместо кнопки Run Agent.
- **Runtime продукта:** `@cursor/sdk` (`completeText`). Роутер (`classifyIntent`) — `composer-2.5`; коуч и Safety Reviewer — `grok-4.6`. Оркестрация coach/reviewer в `runHealthAgent.ts`, вход продукта — `src/os/runOS.ts`.

- `app/page.tsx` — клиентский чат (`useChat`): одно окно, история только в RAM, без персиста.
- `app/layout.tsx` — root layout, подключает шрифт `Inter` через `next/font` и `globals.css`.
- `app/globals.css` — Tailwind v4 + дизайн-токены темы (см. «Дизайн-система и UI»).
- `app/api/chat/route.ts` — POST `/api/chat`, UI-стрим (таймлайн + план) над `runOS`. Модель не вызывает.
- `app/api/agent/run/route.ts` — POST `/api/agent/run`, JSON-ответ OS/harness без стрима. Нужен eval/replay и внешним клиентам.
- `src/chat/messages.ts` — схемы data-parts чата, `sessionContext` из истории, капля готового плана.
- `components/chat/*` — лента сообщений и живой таймлайн этапов/tool calls.
- `components/ui/*` — примитивы shadcn/ui (button, card, badge, alert, textarea, label, skeleton, separator).
- `components/health/review-widgets.tsx` — презентационные виджеты ревью: `VerdictBadge`, `ScoreMeter`, `RoundsIndicator`, `verdictConfig`.
- `lib/utils.ts` — хелпер `cn()` (clsx + tailwind-merge) для shadcn.
- `components.json` — конфиг shadcn CLI (стиль new-york, alias `@/*`).
- `src/agents/healthCoach.ts` и `src/agents/safetyReviewer.ts` — определения агентов (name + instructions).
- `src/skills/` — локальные custom tools коуча (`generateShoppingList`, `suggestWorkoutTemplate`, `searchKnowledge`). Markdown-данные ушли в MCP; старые wrappers — `*.legacy.ts`.
- `src/rag/` — embeddings (OpenAI-compatible fetch), retriever и PostgREST к `knowledge_chunks`.
- `knowledge/` — учебная база знаний (секции `##`); личный профиль/лог остаются в `data/`.
- `docs/*.sql` и `supabase/migrations/001_knowledge.sql` — схема pgvector.
- `src/mcp/servers.config.ts` — описания MCP-серверов (`markdown-health`, `filesystem`, `weather`, `notion`). Новый сервер = новая запись.
- `src/mcp/markdownHealthServer.ts` — свой stdio MCP-сервер над `data/*.md` (`@modelcontextprotocol/sdk`).
- `src/mcp/stdioClient.ts` — резолв конфига в `mcpServers` для Cursor SDK и короткий MCP-клиент для inspect / `save_health_plan`.
- `src/harness/completeText.ts` — адаптер `@cursor/sdk`: ревьюер `tools: []`, коуч `tools: ["mcp"]` + `customTools` + inline `mcpServers`.
- `src/harness/runHealthAgent.ts` — оркестрация цикла coach/reviewer, safety pre-check, `save_health_plan` + `append_daily_log` через MCP после approve. Safety Reviewer обязателен для каждого модуля.
- `src/os/` — модули (`src/os/modules/`), `classifyIntent` (`router.ts`), обёртка `runOS.ts`. Модуль = `{ name, description, promptFile, tools }`, не отдельный агент.
- `src/harness/traceRun.ts` — пишет локальный JSON-трейс в `runs/run-<timestamp>.json` после каждого запуска (`module`, `intentConfidence`).
- `scripts/replay.ts` и `scripts/eval.ts` — replay одного трейса и последовательный прогон мини-evals через `runOS`.
- `evals/cases/*.json` — исходные кейсы плюс три модульных (`os-a-daily-plan`, `os-b-recipes-dinner`, `os-c-habits`).
- `runs/run-example.json` — пример трейса в репозитории; остальные файлы `runs/` в git не попадают.
- `data/profile.md`, `data/log.md`, `data/output.md`, `data/recipes.md`, `data/habits.md`, `data/preferences.md` — локальный профиль, дневник, план, рецепты, привычки и подтверждённые предпочтения.
- `plans/` — копии планов через filesystem MCP; доступ сервера ограничен `data/` и `plans/`.
- Статические ассеты не используются.

## Команды разработки, сборки и запуска

- `npm run dev` — запускает локальный Next.js dev server на `http://localhost:3000`.
- `npm run build` — проверяет TypeScript и собирает production bundle.
- `npm run start` — запускает production server после успешной сборки.
- `npm run replay -- runs/run-XXX.json` — прогоняет задачу из трейса через текущий harness и печатает old vs new.
- `npm run eval` — последовательно прогоняет `evals/cases/*.json` и печатает таблицу PASS/FAIL.
- `npm run ingest` — очищает `knowledge_chunks` и заново заливает chunks из `knowledge/`.
- `npm run mcp:inspect` — поднимает enabled MCP-серверы из конфига, печатает tools/resources и закрывает процессы.
- `npm install` — восстанавливает зависимости из `package-lock.json`.

Основной сценарий — чат на `/` и стриминговый `/api/chat`. JSON-роут `/api/agent/run` остаётся для прямого запуска. Replay и eval — локальные CLI на `tsx`, без сборки и без внешних трейсеров.

## Стиль кода и соглашения

Проект использует TypeScript, ESM и `strict` режим. Соблюдайте 2 пробела, именуйте React-компоненты в `PascalCase`, функции и переменные в `camelCase`, типы в `PascalCase`. Для runtime validation используйте Zod, как в `ReviewSchema`. Сохраняйте существующий стиль: небольшие focused-файлы, явные типы на публичных результатах.

UI строится на **Tailwind CSS v4 + shadcn/ui** (стиль new-york). Стилизуйте через utility-классы Tailwind и семантические токены темы (`bg-background`, `text-foreground`, `bg-primary` и т.п.), а не через inline styles или сырой hex. Классы объединяйте через `cn()` из `lib/utils.ts`. Иконки — только из `lucide-react` (никаких emoji). Новые примитивы добавляйте через `npx shadcn@latest add <component>` в `components/ui/`; составные виджеты — в `components/health/`.

## Дизайн-система и UI

Направление — **Calm cyan-green (health-tech)**, только светлая тема (dark mode намеренно не добавлен).

- **Стек:** Tailwind v4 (`@tailwindcss/postcss`, CSS-first), shadcn/ui new-york, `lucide-react`, шрифт `Inter` (`next/font`, переменная `--font-inter`).
- **Токены:** объявлены в `:root` внутри `app/globals.css` и проброшены в Tailwind через `@theme inline`. Базовая палитра — cyan (`--primary #0e7490`) на светлом cyan-фоне (`--background #f5fbfc`), текст `--foreground #123c49`. Значения подобраны под контраст WCAG AA. Меняйте цвета только здесь, не в компонентах.
- **Семантика статусов:** цвет вердикта передаётся цветом + иконкой + текстом (правило `color-not-only`). Маппинг живёт в `verdictConfig` (`components/health/review-widgets.tsx`): `approve` → emerald, `revise` → amber, `needs_human_professional` → red. Для статусов используются встроенные шкалы Tailwind (emerald/amber/red), а не кастомные токены.
- **Информативность результата:** живой таймлайн этапов в ответе ассистента, tool calls с бейджами `[MCP]` / `[local]` / `[RAG]`, `ScoreMeter` и `VerdictBadge` после плана, кнопка «Копировать». Empty-state — приглашение начать чат; во время запуска поле ввода disabled.
- **A11y:** сохранён skip-link, `aria-live` на таймлайне, видимые focus-ring, уважается `prefers-reduced-motion`.

При правках UI придерживайтесь чек-листа: контраст ≥4.5:1, один primary-CTA на экран, transitions 150–300 мс, проверка на 375/768/1024/1440 px без горизонтального скролла.

## Тестирование

Автоматические unit-тесты не настроены. Перед сдачей изменений минимум запускайте `npm run build` (он же прогоняет TypeScript). Для изменений UI вручную проверьте `npm run dev`: idle (empty-state), running (таймлайн оживает, input disabled), result (план, verdict/score, «Копировать»), warning при `needs_human_professional`, шаг Revising при `revise`, а также error (пустая задача / отсутствие ключа). «Новая сессия» чистит историю; reload страницы её не восстанавливает. Для изменений harness проверьте, что одобренный план записывается в `data/output.md`, а запуск пишет JSON в `runs/`. После правок промпта или модели используйте `npm run replay` и `npm run eval`.
При написании кода агентом не пиши тесты и не используй TDD.

## Коммиты и pull request

В этой рабочей копии нет доступной git-истории, поэтому используйте простые Conventional Commits: `feat:`, `fix:`, `docs:`, `refactor:`. В PR указывайте цель, измененные файлы, команды проверки и скриншот для UI-изменений. Отдельно отмечайте любые изменения промптов, safety logic или формата API-ответа.

## Безопасность и конфигурация агентов

Секреты храните только в `.env`: `CURSOR_API_KEY`, опционально `CURSOR_MODEL` (по умолчанию `grok-4.6` для коуча/ревьюера), опционально `CURSOR_ROUTER_MODEL` (по умолчанию `composer-2.5` для `classifyIntent`), опционально `NOTION_TOKEN`, для RAG — `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` и блок `EMBEDDING_*`. Ключ агента: Cursor Dashboard → Integrations. Не коммитьте `.env`. Embeddings не берутся из `CURSOR_API_KEY`.

Не переносите цикл coach/reviewer в чат IDE. Не давайте SDK-агенту корень репозитория и не включайте `local.settingSources: ["all"]`. Ревьюер вызывается с `tools: []`. Коуч получает `tools: ["mcp"]`, `local.customTools` (shopping/workouts/searchKnowledge) и inline stdio `mcpServers` из `servers.config.ts` (без shell/read по репозиторию). `filesystem` ограничен `data/` и `plans/`. Данные markdown-сервера читаются по `HEALTH_DATA_ROOT`. Не добавляйте OAuth. История чата только в состоянии страницы (без БД и localStorage). Streaming — UI-протокол `/api/chat` (события harness + капля уже готового плана), не замена Cursor SDK и не `run.stream()` коуча. Личную память (`profile`/`log`) не переносите в БД; pgvector только для `knowledge/`. Промпты и revision loop меняйте только осознанно: это основная бизнес-логика проекта.

## Принципы кодовой базы

- Поддерживать кодовую базу в высокомодульном состоянии и с хорошей документацией.
- Следовать принципу «разделения ответственности» (separation of concerns).
