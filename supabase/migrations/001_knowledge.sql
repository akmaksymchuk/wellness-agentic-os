-- Knowledge RAG: pgvector chunks for recipes, nutrition, training, recovery, preferences.
-- Default embedding size is 768 (Ollama nomic-embed-text).
-- Switching embedding models: apply docs/002_resize_embedding_dim.sql, then re-run npm run ingest.
-- Personal memory (data/profile.md, data/log.md) stays in markdown/MCP and is not stored here.

create extension if not exists vector;

create table if not exists public.knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  file text not null,
  heading text not null,
  content text not null,
  embedding vector(768) not null
);

create index if not exists knowledge_chunks_embedding_idx
  on public.knowledge_chunks
  using hnsw (embedding vector_cosine_ops);

create or replace function public.match_knowledge(
  query_embedding vector(768),
  match_count int default 5
)
returns table (
  id uuid,
  file text,
  heading text,
  content text,
  similarity float
)
language sql
stable
as $$
  select
    knowledge_chunks.id,
    knowledge_chunks.file,
    knowledge_chunks.heading,
    knowledge_chunks.content,
    1 - (knowledge_chunks.embedding <=> query_embedding) as similarity
  from public.knowledge_chunks
  order by knowledge_chunks.embedding <=> query_embedding
  limit greatest(match_count, 1);
$$;

alter table public.knowledge_chunks enable row level security;

revoke all on table public.knowledge_chunks from anon, authenticated;
grant select, insert, update, delete on table public.knowledge_chunks to service_role;
grant execute on function public.match_knowledge(vector(768), int) to service_role;
