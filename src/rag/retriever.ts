import { embedQuery } from "./embed";
import { supabaseMatchKnowledge } from "./supabaseRest";

export type KnowledgeHit = {
  file: string;
  heading: string;
  content: string;
  similarity: number;
};

export async function searchKnowledge(query: string, topK = 5): Promise<KnowledgeHit[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const embedding = await embedQuery(trimmed);
  const rows = await supabaseMatchKnowledge(embedding, topK);
  return rows.map((row) => ({
    file: row.file,
    heading: row.heading,
    content: row.content,
    similarity: row.similarity,
  }));
}
