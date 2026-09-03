# Repository Guidelines

## Структура проекта и модули

Это локальное Next.js App Router приложение для запуска Health Coach Agent через веб-интерфейс.

Два слоя инструментов (как у автора курса: IDE пишет систему, код оркестрирует агентов):

- **Разработка:** Cursor IDE + Composer — аналог Codex / Claude Code. Правки кода живут здесь, не в чате вместо кнопки Run Agent.
- **Runtime продукта:** `@cursor/sdk` (`completeText`) вызывает Composer как модель. Оркестрация coach/reviewer остаётся в `runHealthAgent.ts`.

- `app/page.tsx` — клиентская страница с textarea, кнопкой запуска и блоком результата (на shadcn/ui).
- `app/layout.tsx` — root layout, подключает шрифт `Inter` через `next/font` и `globals.css`.
- `app/globals.css` — Tailwind v4 + дизайн-токены темы (см. «Дизайн-система и UI»).
- `app/api/agent/run/route.ts` — POST endpoint `/api/agent/run`, вызывает harness.
- `components/ui/*` — примитивы shadcn/ui (button, card, badge, alert, textarea, label, skeleton, separator).
- `components/health/review-widgets.tsx` — презентационные виджеты ревью: `VerdictBadge`, `ScoreMeter`, `RoundsIndicator`, `verdictConfig`.
- `lib/utils.ts` — хелпер `cn()` (clsx + tailwind-merge) для shadcn.
- `components.json` — конфиг shadcn CLI (стиль new-york, alias `@/*`).
- `src/agents/healthCoach.ts` и `src/agents/safetyReviewer.ts` — определения агентов (name + instructions).
- `src/skills/` — function tools коуча (`local.customTools` в `@cursor/sdk`), не OpenAI Agents SDK.
- `src/harness/completeText.ts` — адаптер `@cursor/sdk`: ревьюер `tools: []`, коуч `tools: ["mcp"]` + `customTools`.
- `src/harness/runHealthAgent.ts` — оркестрация цикла coach/reviewer, safety pre-check, savePlan после approve.
- `data/profile.md`, `data/log.md`, `data/output.md`, `data/recipes.md` — локальный профиль, дневник, план и рецепты.
- Тестовой директории сейчас нет; статические ассеты тоже не используются.

## Команды разработки, сборки и запуска

- `npm run dev` — запускает локальный Next.js dev server на `http://localhost:3000`.
- `npm run build` — проверяет TypeScript и собирает production bundle.
- `npm run start` — запускает production server после успешной сборки.
- `npm install` — восстанавливает зависимости из `package-lock.json`.

Отдельного CLI entrypoint нет: работаем только через интерфейс и API route.

## Стиль кода и соглашения

Проект использует TypeScript, ESM и `strict` режим. Соблюдайте 2 пробела, именуйте React-компоненты в `PascalCase`, функции и переменные в `camelCase`, типы в `PascalCase`. Для runtime validation используйте Zod, как в `ReviewSchema`. Сохраняйте существующий стиль: небольшие focused-файлы, явные типы на публичных результатах.

UI строится на **Tailwind CSS v4 + shadcn/ui** (стиль new-york). Стилизуйте через utility-классы Tailwind и семантические токены темы (`bg-background`, `text-foreground`, `bg-primary` и т.п.), а не через inline styles или сырой hex. Классы объединяйте через `cn()` из `lib/utils.ts`. Иконки — только из `lucide-react` (никаких emoji). Новые примитивы добавляйте через `npx shadcn@latest add <component>` в `components/ui/`; составные виджеты — в `components/health/`.

## Дизайн-система и UI

Направление — **Calm cyan-green (health-tech)**, только светлая тема (dark mode намеренно не добавлен).

- **Стек:** Tailwind v4 (`@tailwindcss/postcss`, CSS-first), shadcn/ui new-york, `lucide-react`, шрифт `Inter` (`next/font`, переменная `--font-inter`).
- **Токены:** объявлены в `:root` внутри `app/globals.css` и проброшены в Tailwind через `@theme inline`. Базовая палитра — cyan (`--primary #0e7490`) на светлом cyan-фоне (`--background #f5fbfc`), текст `--foreground #123c49`. Значения подобраны под контраст WCAG AA. Меняйте цвета только здесь, не в компонентах.
- **Семантика статусов:** цвет вердикта передаётся цветом + иконкой + текстом (правило `color-not-only`). Маппинг живёт в `verdictConfig` (`components/health/review-widgets.tsx`): `approve` → emerald, `revise` → amber, `needs_human_professional` → red. Для статусов используются встроенные шкалы Tailwind (emerald/amber/red), а не кастомные токены.
- **Информативность результата:** `ScoreMeter` (индикатор 0–10 с цветом по порогу и `role="meter"`), `RoundsIndicator` (раунды ревью), список замечаний, кнопка «Копировать» плана. Loading использует `Skeleton`; empty-state — нумерованные шаги ревью.
- **A11y:** сохранён skip-link, `aria-live` на статусе, видимые focus-ring, touch-friendly CTA (`size="lg"`), уважается `prefers-reduced-motion`.

При правках UI придерживайтесь чек-листа: контраст ≥4.5:1, один primary-CTA на экран, transitions 150–300 мс, проверка на 375/768/1024/1440 px без горизонтального скролла.

## Тестирование

Автоматические тесты пока не настроены. Перед сдачей изменений минимум запускайте `npm run build` (он же прогоняет TypeScript). Для изменений UI вручную проверьте `npm run dev`: idle, running (skeleton + спиннер на кнопке), result (score-meter, раунды, замечания, «Копировать»), warning при `needs_human_professional`, а также error (пустая задача / отсутствие ключа). Для изменений harness проверьте, что одобренный план записывается в `data/output.md`.
При написании кода агентом не пиши тесты и не используй TDD.

## Коммиты и pull request

В этой рабочей копии нет доступной git-истории, поэтому используйте простые Conventional Commits: `feat:`, `fix:`, `docs:`, `refactor:`. В PR указывайте цель, измененные файлы, команды проверки и скриншот для UI-изменений. Отдельно отмечайте любые изменения промптов, safety logic или формата API-ответа.

## Безопасность и конфигурация агентов

Секреты храните только в `.env`: `CURSOR_API_KEY`, опционально `CURSOR_MODEL` (по умолчанию `composer-2.5`). Ключ: Cursor Dashboard → Integrations. Не коммитьте `.env`.

Не переносите цикл coach/reviewer в чат IDE. Не давайте SDK-агенту корень репозитория и не включайте `local.settingSources: ["all"]`. Ревьюер вызывается с `tools: []`. Коуч получает только `tools: ["mcp"]` и `local.customTools` (без shell/read по репозиторию). Не добавляйте авторизацию, БД, историю сообщений, streaming или внешние MCP без явного требования. Промпты и revision loop меняйте только осознанно: это основная бизнес-логика проекта.

## Принципы кодовой базы

- Поддерживать кодовую базу в высокомодульном состоянии и с хорошей документацией.
- Следовать принципу «разделения ответственности» (separation of concerns).
