-- =============================================================================
-- 向量列不再固定 1536 维，以便开发期用 Supabase 自带的免费 gte-small（384 维），
-- 以后换 OpenAI（1536 维）或其他模型时不用改表。
-- 同一个 model 的向量维度一定相同，match_candidates 只在同一 model 内比较。
--
-- HNSW 索引要求固定维度，先去掉：几千条以内全表扫描也只要几毫秒。
-- 定下正式模型后再按模型建表达式索引，例如：
--   create index on intent_embeddings using hnsw ((embedding::extensions.vector(1536)) extensions.vector_cosine_ops)
--   where model = 'text-embedding-3-small';
-- =============================================================================

drop index if exists public.intent_embeddings_self_hnsw;
drop index if exists public.intent_embeddings_need_hnsw;

alter table public.intent_embeddings
  alter column embedding type extensions.vector using embedding::extensions.vector;
