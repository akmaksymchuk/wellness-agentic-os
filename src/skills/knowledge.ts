import { z } from "zod";

import { searchKnowledge } from "../rag/retriever";
import { defineCursorTool } from "./cursorTool";

export const SearchKnowledgeParamsSchema = z.object({
  query: z
    .string()
    .min(1)
    .describe(
      "Search query for the knowledge base: recipes, nutrition rules, workout templates, or recovery rules. Use the user's food or training constraints in their own words.",
    ),
  topK: z.number().int().min(1).max(10).optional(),
});

export function formatKnowledgeHits(
  hits: Awaited<ReturnType<typeof searchKnowledge>>,
): string {
  return JSON.stringify({
    chunks: hits.map((hit) => ({
      file: hit.file,
      heading: hit.heading,
      content: hit.content,
      similarity: Number(hit.similarity.toFixed(4)),
    })),
  });
}

export function createSearchKnowledgeTool() {
  return defineCursorTool({
    description:
      "Search the wellness knowledge base for recipes, nutrition rules, workout templates, and recovery rules. Use this before inventing meals or protocols. Do not use it for the user's personal profile or daily log.",
    parameters: SearchKnowledgeParamsSchema,
    jsonSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Search query for recipes, nutrition rules, workout templates, or recovery rules.",
        },
        topK: {
          type: "integer",
          description: "How many chunks to return. Default 5.",
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
    execute: async ({ query, topK }) => formatKnowledgeHits(await searchKnowledge(query, topK ?? 5)),
  });
}
