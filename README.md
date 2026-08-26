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

The agent reads `data/profile.md` and `data/log.md`. Approved plans are saved to `data/output.md`.
