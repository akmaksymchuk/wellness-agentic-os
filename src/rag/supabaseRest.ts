function supabaseConfig() {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Добавь SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY в .env");
  }
  return { url, key };
}

function restHeaders(extra?: Record<string, string>) {
  const { key } = supabaseConfig();
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

async function parseError(response: Response): Promise<string> {
  const text = await response.text();
  return text || response.statusText;
}

export async function supabaseDeleteAllChunks(): Promise<void> {
  const { url } = supabaseConfig();
  const response = await fetch(`${url}/rest/v1/knowledge_chunks?id=not.is.null`, {
    method: "DELETE",
    headers: restHeaders({ Prefer: "return=minimal" }),
  });
  if (!response.ok) {
    throw new Error(`Не удалось очистить knowledge_chunks: ${response.status} ${await parseError(response)}`);
  }
}

export type KnowledgeChunkInsert = {
  file: string;
  heading: string;
  content: string;
  embedding: number[];
};

export async function supabaseInsertChunks(rows: KnowledgeChunkInsert[]): Promise<void> {
  if (rows.length === 0) return;
  const { url } = supabaseConfig();
  const response = await fetch(`${url}/rest/v1/knowledge_chunks`, {
    method: "POST",
    headers: restHeaders({ Prefer: "return=minimal" }),
    body: JSON.stringify(rows),
  });
  if (!response.ok) {
    throw new Error(`Не удалось записать knowledge_chunks: ${response.status} ${await parseError(response)}`);
  }
}

export type MatchKnowledgeRow = {
  id: string;
  file: string;
  heading: string;
  content: string;
  similarity: number;
};

export async function supabaseMatchKnowledge(
  queryEmbedding: number[],
  matchCount: number,
): Promise<MatchKnowledgeRow[]> {
  const { url } = supabaseConfig();
  const response = await fetch(`${url}/rest/v1/rpc/match_knowledge`, {
    method: "POST",
    headers: restHeaders(),
    body: JSON.stringify({
      query_embedding: queryEmbedding,
      match_count: matchCount,
    }),
  });
  if (!response.ok) {
    throw new Error(`match_knowledge не выполнен: ${response.status} ${await parseError(response)}`);
  }
  const payload = (await response.json()) as MatchKnowledgeRow[];
  if (!Array.isArray(payload)) {
    throw new Error("match_knowledge вернул неожиданный ответ.");
  }
  return payload;
}
