import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { config as loadDotenv } from "dotenv";

import { chunkMarkdown } from "../src/rag/chunk";
import { embedTexts, embeddingConfig } from "../src/rag/embed";
import { supabaseDeleteAllChunks, supabaseInsertChunks } from "../src/rag/supabaseRest";

const KNOWLEDGE_DIR = "knowledge";
const EMBED_BATCH = 8;
const INSERT_BATCH = 20;

async function loadKnowledgeChunks(root: string) {
  const dir = join(root, KNOWLEDGE_DIR);
  const files = (await readdir(dir)).filter((file) => file.endsWith(".md")).sort();
  const chunks = [];
  for (const file of files) {
    const markdown = await readFile(join(dir, file), "utf8");
    chunks.push(...chunkMarkdown(file, markdown));
  }
  return { files, chunks };
}

async function main() {
  const root = process.cwd();
  loadDotenv({ path: join(root, ".env"), quiet: true });

  const cfg = embeddingConfig();
  const { files, chunks } = await loadKnowledgeChunks(root);
  if (chunks.length === 0) {
    throw new Error(`В ${KNOWLEDGE_DIR}/ нет секций ## для ингеста.`);
  }

  console.log(
    `Embeddings: ${cfg.provider} ${cfg.model} dim=${cfg.dim} @ ${cfg.baseUrl}\nФайлов: ${files.length}. Chunks: ${chunks.length}. Очистка и повторная заливка.`,
  );

  await supabaseDeleteAllChunks();

  for (let offset = 0; offset < chunks.length; offset += EMBED_BATCH) {
    const batch = chunks.slice(offset, offset + EMBED_BATCH);
    const vectors = await embedTexts(batch.map((chunk) => chunk.content));
    const rows = batch.map((chunk, index) => ({
      file: chunk.file,
      heading: chunk.heading,
      content: chunk.content,
      embedding: vectors[index] ?? [],
    }));

    for (let insertOffset = 0; insertOffset < rows.length; insertOffset += INSERT_BATCH) {
      await supabaseInsertChunks(rows.slice(insertOffset, insertOffset + INSERT_BATCH));
    }
    console.log(`Записано ${Math.min(offset + batch.length, chunks.length)} / ${chunks.length}`);
  }

  console.log("Ingest завершён. Повторный запуск снова очистит таблицу и зальёт те же chunks.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
