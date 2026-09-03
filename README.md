# Local Wellness Agent

Simple Next.js App Router UI for the Health Coach Agent and Safety Reviewer Agent loop.

Runtime uses Cursor SDK (`composer-2.5` by default) instead of DeepSeek. Cursor IDE + Composer is the coding tool; the coach/reviewer loop still runs in `src/harness/runHealthAgent.ts`.

## Setup

1. `npm install`
2. Create `.env` with `CURSOR_API_KEY` from [Cursor Dashboard → Integrations](https://cursor.com/dashboard/integrations). Optional: `CURSOR_MODEL=composer-2.5`.

## Run

```bash
npm run dev
```

Open `http://localhost:3000`, enter one task, and press `Run Agent`.

The coach loads `data/profile.md` and `data/log.md` via custom tools when needed. Approved plans are saved to `data/output.md`.

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
