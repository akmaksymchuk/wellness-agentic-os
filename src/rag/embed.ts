export type EmbeddingProvider = "ollama" | "openai";

export type EmbeddingConfig = {
  provider: EmbeddingProvider;
  model: string;
  dim: number;
  baseUrl: string;
  apiKey: string;
};

function asProvider(value: string | undefined): EmbeddingProvider {
  if (value === "openai" || value === "ollama") return value;
  return "ollama";
}

export function embeddingConfig(): EmbeddingConfig {
  const provider = asProvider(process.env.EMBEDDING_PROVIDER);
  const dimRaw = process.env.EMBEDDING_DIM ?? (provider === "openai" ? "1536" : "768");
  const dim = Number(dimRaw);
  if (!Number.isInteger(dim) || dim <= 0) {
    throw new Error(`EMBEDDING_DIM должен быть положительным целым, сейчас: ${dimRaw}`);
  }

  const baseUrl = (
    process.env.EMBEDDING_BASE_URL ??
    (provider === "openai" ? "https://api.openai.com/v1" : "http://127.0.0.1:11434/v1")
  ).replace(/\/$/, "");
  const apiKey = process.env.EMBEDDING_API_KEY ?? "";
  const model =
    process.env.EMBEDDING_MODEL ?? (provider === "openai" ? "text-embedding-3-small" : "nomic-embed-text");

  if (provider === "openai" && !apiKey.trim()) {
    throw new Error("Для EMBEDDING_PROVIDER=openai задай EMBEDDING_API_KEY в .env");
  }

  return { provider, model, dim, baseUrl, apiKey };
}

type EmbeddingResponse = {
  data?: Array<{ embedding?: number[]; index?: number }>;
  error?: { message?: string };
};

function assertDim(vector: number[], expected: number) {
  if (vector.length !== expected) {
    throw new Error(
      `Длина embedding ${vector.length} не совпадает с EMBEDDING_DIM=${expected}. Смени модель или примени docs/002_resize_embedding_dim.sql и залей ингест заново.`,
    );
  }
}

async function requestEmbeddings(input: string[]): Promise<number[][]> {
  const cfg = embeddingConfig();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (cfg.apiKey) headers.Authorization = `Bearer ${cfg.apiKey}`;

  const response = await fetch(`${cfg.baseUrl}/embeddings`, {
    method: "POST",
    headers,
    body: JSON.stringify({ model: cfg.model, input }),
  });
  const payload = (await response.json()) as EmbeddingResponse;
  if (!response.ok) {
    const detail = payload.error?.message ?? JSON.stringify(payload);
    throw new Error(`Embeddings ${response.status}: ${detail}`);
  }

  const rows = [...(payload.data ?? [])].sort((left, right) => (left.index ?? 0) - (right.index ?? 0));
  if (rows.length !== input.length) {
    throw new Error(`Embeddings вернули ${rows.length} векторов вместо ${input.length}.`);
  }

  return rows.map((row, index) => {
    const vector = row.embedding;
    if (!Array.isArray(vector) || vector.length === 0) {
      throw new Error(`Пустой embedding для текста #${index}.`);
    }
    assertDim(vector, cfg.dim);
    return vector;
  });
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  try {
    return await requestEmbeddings(texts);
  } catch (error) {
    if (texts.length === 1) throw error;
    const vectors: number[][] = [];
    for (const text of texts) {
      const [vector] = await requestEmbeddings([text]);
      vectors.push(vector);
    }
    return vectors;
  }
}

export async function embedQuery(query: string): Promise<number[]> {
  const [vector] = await embedTexts([query]);
  if (!vector) throw new Error("Не удалось получить embedding запроса.");
  return vector;
}
