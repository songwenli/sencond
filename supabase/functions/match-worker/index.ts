// 匹配 worker 入口：由数据库定时任务（pg_cron）每 30 秒检查一次，
// 有待处理任务时才会调用。部署时关闭 JWT 校验，改用 x-worker-secret 头鉴权，
// 密钥只存在数据库 Vault 里，通过 verify_match_worker_secret() 核对。
//
// 用哪家模型由环境变量决定（Supabase 后台 → Edge Functions → Secrets）：
//   免费方案：只设 GEMINI_API_KEY（大模型用 Gemini，向量用 Supabase 自带 gte-small）
//   付费方案：设 OPENAI_API_KEY（大模型、向量、审核都用 OpenAI）
//   可选覆盖：LLM_MODEL、LLM_BASE_URL、LLM_API_KEY、EMBEDDING_PROVIDER、EMBEDDING_MODEL
import { createClient } from 'npm:@supabase/supabase-js@2';
import { configFromEnv, createAI } from './ai.ts';
import { drainQueue } from './pipeline.ts';
import { createSupabaseStore } from './store.ts';

function env(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`missing env ${name}`);
  return v;
}

Deno.serve(async (req) => {
  const url = env('SUPABASE_URL');
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY');

  const provided = req.headers.get('x-worker-secret') ?? '';
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: ok } = await admin.rpc('verify_match_worker_secret', { p_secret: provided });
  if (!provided || ok !== true) return new Response('unauthorized', { status: 401 });

  try {
    const cfg = configFromEnv((k) => Deno.env.get(k) || undefined);
    const ai = createAI(cfg);
    const store = createSupabaseStore(url, serviceKey);

    const results = await drainQueue(store, ai);
    const summary = { llm: cfg.llmModel, embedding: cfg.embeddingModel, processed: results.length, results };
    console.log(JSON.stringify(summary));
    return Response.json(summary);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(message);
    return Response.json({ error: message }, { status: 500 });
  }
});
