import type { OsModule } from "../types";

export const recoveryModule: OsModule = {
  name: "recovery",
  description:
    "Сон, отдых, DOMS, восстановление после нагрузки. Не острый симптом — это safety gate в harness, не модуль.",
  promptFile: "prompts/modules/recovery.md",
  tools: ["read_profile", "read_recent_logs", "searchKnowledge"],
};
