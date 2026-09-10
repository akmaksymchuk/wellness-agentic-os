import type { OsModule, OsModuleName } from "../types";
import { dailyPlanModule } from "./dailyPlan";
import { generalModule } from "./general";
import { habitsModule } from "./habits";
import { knowledgeModule } from "./knowledge";
import { nutritionModule } from "./nutrition";
import { recipesModule } from "./recipes";
import { recoveryModule } from "./recovery";
import { shoppingListModule } from "./shoppingList";
import { trainingModule } from "./training";

export const osModules: OsModule[] = [
  dailyPlanModule,
  nutritionModule,
  recipesModule,
  trainingModule,
  recoveryModule,
  habitsModule,
  shoppingListModule,
  knowledgeModule,
  generalModule,
];

const modulesByName = new Map(osModules.map((module) => [module.name, module]));

/** Modules sent to classifyIntent. `general` is fallback-only. */
export const routableOsModules = osModules.filter((module) => module.name !== "general");

export function getOsModule(name: OsModuleName): OsModule {
  return modulesByName.get(name) ?? generalModule;
}

export { generalModule };
