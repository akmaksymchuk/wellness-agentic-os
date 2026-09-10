export type OsModuleName =
  | "dailyPlan"
  | "nutrition"
  | "recipes"
  | "training"
  | "recovery"
  | "habits"
  | "shoppingList"
  | "knowledge"
  | "general";

export type OsModule = {
  name: OsModuleName;
  description: string;
  promptFile: string;
  tools: string[];
};

export type ClassifiedIntent = {
  module: OsModuleName;
  confidence: number;
};
