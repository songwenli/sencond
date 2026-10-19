import type { AI, Analysis, IntentBrief, IntentKind, Verdict } from './types.ts';
import { ANALYZE_SYSTEM, JUDGE_SYSTEM, analyzeUser, judgeUser } from './prompts.ts';

export interface AIConfig {
  /** 大模型：任何 OpenAI 兼容接口（OpenAI / Gemini / OpenRouter …） */
  llmBaseUrl: string;
  llmApiKey: string;
  llmModel: string;
  /** 向量：'openai' 用 OpenAI 接口；'supabase' 用 Supabase 自带的免费 gte-small 模型 */
  embeddingProvider: 'openai' | 'supabase';
  embeddingModel: string;
  /** 有 OpenAI key 时用它的免费审核接口；没有就只靠大模型解析时的 unsafe 判断 */
  openaiApiKey?: string;
}

const OPENAI_BASE = 'https://api.openai.com/v1';

/** 根据环境变量决定用哪家：只填 GEMINI_API_KEY 就是全免费方案 */
export function configFromEnv(get: (k: string) => string | undefined): AIConfig {
  const openai = get('OPENAI_API_KEY');
  const gemini = get('GEMINI_API_KEY');
  const llmApiKey = get('LLM_API_KEY') ?? gemini ?? openai;
  if (!llmApiKey) throw new Error('missing env: set GEMINI_API_KEY (free) or OPENAI_API_KEY');

  const defaultBase = gemini && !get('LLM_API_KEY')
    ? 'https://generativelanguage.googleapis.com/v1beta/openai'
    : OPENAI_BASE;
  const llmModel = get('LLM_MODEL') ?? (defaultBase === OPENAI_BASE ? 'gpt-5.4-mini' : 'gemini-2.5-flash');

  const embeddingProvider = (get('EMBEDDING_PROVIDER') as 'openai' | 'supabase' | undefined)
    ?? (openai ? 'openai' : 'supabase');
  return {
    llmBaseUrl: get('LLM_BASE_URL') ?? defaultBase,
    llmApiKey,
    llmModel,
    embeddingProvider,
    embeddingModel: get('EMBEDDING_MODEL') ?? (embeddingProvider === 'openai' ? 'text-embedding-3-small' : 'gte-small'),
    openaiApiKey: openai,
  };
}

/** OpenAI 兼容接口的实现，大模型、向量、审核分别可配置 */
export function createAI(cfg: AIConfig): AI {
  const llmBase = cfg.llmBaseUrl.replace(/\/$/, '');
  const llmKey = cfg.llmApiKey;
  const embeddingModel = cfg.embeddingModel;
  const env = { LLM_MODEL: cfg.llmModel };
  let gteSession: { run(t: string, o: unknown): Promise<number[]> } | null = null;

  async function post(base: string, key: string, path: string, body: unknown) {
    const res = await fetchWithRetry(`${base}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`${path} ${res.status}: ${text.slice(0, 500)}`);
    return JSON.parse(text);
  }

  async function chatJson(system: string, user: string): Promise<any> {
    const data = await post(llmBase, llmKey, '/chat/completions', {
      model: env.LLM_MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      response_format: { type: 'json_object' },
    });
    const content: string | undefined = data?.choices?.[0]?.message?.content;
    if (!content) throw new Error(`LLM returned no content: ${JSON.stringify(data).slice(0, 300)}`);
    return parseJsonLoose(content);
  }

  return {
    embeddingModel,

    async moderate(text) {
      if (!cfg.openaiApiKey) return false; // 没有 OpenAI key：交给 analyze 的 unsafe 判断
      const data = await post(OPENAI_BASE, cfg.openaiApiKey, '/moderations', {
        model: 'omni-moderation-latest',
        input: text,
      });
      return Boolean(data?.results?.[0]?.flagged);
    },

    async analyze(body, userKind) {
      const raw = await chatJson(ANALYZE_SYSTEM, analyzeUser(body, userKind));
      return normalizeAnalysis(raw, userKind);
    },

    async embed(texts) {
      if (cfg.embeddingProvider === 'supabase') {
        // Supabase Edge Runtime 自带的 gte-small（384 维，免费，不需要 key）。
        // 它只懂英文，所以 analyze 阶段已经把 self/need 统一写成英文。
        // deno-lint-ignore no-explicit-any
        const Supabase = (globalThis as any).Supabase;
        if (!Supabase?.ai) throw new Error('Supabase.ai is not available in this runtime');
        gteSession ??= new Supabase.ai.Session(embeddingModel);
        const out: number[][] = [];
        for (const t of texts) out.push(Array.from(await gteSession!.run(t, { mean_pool: true, normalize: true })));
        return out;
      }
      if (!cfg.openaiApiKey) throw new Error('EMBEDDING_PROVIDER=openai requires OPENAI_API_KEY');
      const data = await post(OPENAI_BASE, cfg.openaiApiKey, '/embeddings', { model: embeddingModel, input: texts });
      return (data.data as Array<{ index: number; embedding: number[] }>)
        .sort((a, b) => a.index - b.index)
        .map((d) => d.embedding);
    },

    async judge(source, candidates) {
      if (candidates.length === 0) return [];
      const strip = (b: IntentBrief) => ({ id: b.id, kind: b.kind, post: b.body, summary: b.derived_text, city: b.city, remote: b.is_remote });
      const raw = await chatJson(JUDGE_SYSTEM, judgeUser(strip(source), candidates.map(strip)));
      return normalizeVerdicts(raw, new Set(candidates.map((c) => c.id)));
    },
  };
}

// ── 输出校验：大模型的输出一律当作不可信数据处理 ───────────────────────────────

export function normalizeAnalysis(raw: any, userKind: IntentKind): Analysis {
  const str = (v: unknown, max = 500) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
  const selfText = str(raw?.self_text);
  const needText = str(raw?.need_text);
  if (!selfText || !needText) throw new Error('analyze: missing self_text / need_text');
  const score = Number(raw?.quality_score);
  const hint = raw?.quality_hint && str(raw.quality_hint.en) && str(raw.quality_hint['zh-Hans'])
    ? { en: str(raw.quality_hint.en, 200)!, 'zh-Hans': str(raw.quality_hint['zh-Hans'], 200)! }
    : null;
  const cc = str(raw?.country_code, 2)?.toUpperCase() ?? null;
  return {
    kind: raw?.kind === 'offer' || raw?.kind === 'seek' ? raw.kind : userKind,
    lang: str(raw?.lang, 20) ?? 'und',
    intent_type: str(raw?.intent_type, 40) ?? 'other',
    self_text: selfText,
    need_text: needText,
    derived_text: str(raw?.derived_text) ?? needText,
    is_remote: typeof raw?.is_remote === 'boolean' ? raw.is_remote : null,
    city: str(raw?.city, 80),
    country_code: cc && /^[A-Z]{2}$/.test(cc) ? cc : null,
    slots: raw?.slots && typeof raw.slots === 'object' && !Array.isArray(raw.slots) ? raw.slots : {},
    quality_score: Number.isFinite(score) ? Math.max(0, Math.min(100, Math.round(score))) : 50,
    quality_hint: hint,
    unsafe: raw?.unsafe === true,
  };
}

export function normalizeVerdicts(raw: any, allowed: Set<string>): Verdict[] {
  const list: any[] = Array.isArray(raw?.results) ? raw.results : [];
  const out: Verdict[] = [];
  const seen = new Set<string>();
  for (const r of list) {
    const id = typeof r?.id === 'string' ? r.id : '';
    if (!allowed.has(id) || seen.has(id)) continue;
    seen.add(id);
    const en = typeof r?.reason?.en === 'string' ? r.reason.en.trim().slice(0, 200) : '';
    const zh = typeof r?.reason?.['zh-Hans'] === 'string' ? r.reason['zh-Hans'].trim().slice(0, 100) : '';
    const match = r?.match === true && en.length > 0 && zh.length > 0; // 没有理由的匹配不要
    out.push({
      id,
      match,
      type: r?.type === 'similar' ? 'similar' : 'complementary',
      strength: r?.strength === 'strong' ? 'strong' : 'weak',
      reason: { en, 'zh-Hans': zh },
    });
  }
  return out;
}

function parseJsonLoose(s: string) {
  try {
    return JSON.parse(s);
  } catch {
    const m = s.match(/\{[\s\S]*\}/); // 有的模型会在 JSON 外面包一层 ```json
    if (m) return JSON.parse(m[0]);
    throw new Error(`LLM returned non-JSON: ${s.slice(0, 200)}`);
  }
}

/** 429 / 5xx / 网络错误重试 3 次，间隔 1s、2s、4s */
async function fetchWithRetry(url: string, init: RequestInit, tries = 3): Promise<Response> {
  let last: unknown;
  for (let i = 0; i <= tries; i++) {
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(45_000) });
      if (res.status !== 429 && res.status < 500) return res;
      last = new Error(`HTTP ${res.status}`);
      if (i === tries) return res;
    } catch (e) {
      last = e;
      if (i === tries) throw e;
    }
    await new Promise((r) => setTimeout(r, 1000 * 2 ** i));
  }
  throw last;
}
