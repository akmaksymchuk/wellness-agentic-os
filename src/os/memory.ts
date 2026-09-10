/** Cyrillic-safe: no `\\b` / `\\w` — those are ASCII-only in JS. */
export function taskRequestsPreferenceUpdate(task: string): boolean {
  const text = task.toLocaleLowerCase("ru-RU");
  return text.includes("запомни") || text.includes("мне понравилось");
}

export function todayIsoDate(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function buildDailyLogEntry(task: string, moduleName: string, plan: string, now = new Date()): string {
  const excerpt = plan.replace(/\s+/g, " ").trim().slice(0, 280);
  return [
    `## ${todayIsoDate(now)}`,
    `- Тип запроса: ${moduleName}`,
    `- Задача: ${task.trim()}`,
    excerpt ? `- Суть плана: ${excerpt}` : "- Суть плана: (пусто)",
  ].join("\n");
}

export function buildPreferenceEntry(task: string, now = new Date()): string {
  return `## ${todayIsoDate(now)}\n- ${task.trim()}`;
}
