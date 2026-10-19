// 匹配 worker 的类型定义。pipeline 只依赖这里的接口，
// 生产环境注入 Supabase + OpenAI 实现，测试时注入本地 Postgres + 假 AI。

export type IntentKind = 'seek' | 'offer';
export type I18nText = { en: string; 'zh-Hans': string };

export interface Job {
  id: number;
  intent_id: string;
  attempts: number;
}

export interface Intent {
  id: string;
  owner_id: string;
  kind: IntentKind;
  body: string;
  status: string;
  moderation: string;
  expires_at: string;
  derived_text: string | null;
  city: string | null;
  is_remote: boolean | null;
}

/** 大模型对一条意图的解析结果 */
export interface Analysis {
  kind: IntentKind;
  lang: string;
  intent_type: string;
  self_text: string;
  need_text: string;
  derived_text: string;
  is_remote: boolean | null;
  city: string | null;
  country_code: string | null;
  slots: Record<string, unknown>;
  quality_score: number;
  quality_hint: I18nText | null;
  /** 大模型判断内容违规（没有接 OpenAI 审核接口时，靠这个兜底） */
  unsafe: boolean;
}

export interface Candidate {
  intent_id: string;
  owner_id: string;
  kind: IntentKind;
  complementary_score: number;
  similar_score: number;
  score: number;
}

/** 给大模型做最终判断用的意图摘要 */
export interface IntentBrief {
  id: string;
  kind: IntentKind;
  body: string;
  derived_text: string | null;
  city: string | null;
  is_remote: boolean | null;
}

export interface Verdict {
  id: string;
  match: boolean;
  type: 'complementary' | 'similar';
  strength: 'strong' | 'weak';
  reason: I18nText;
}

export interface Store {
  claimJobs(limit: number): Promise<Job[]>;
  getIntent(id: string): Promise<Intent | null>;
  rejectIntent(id: string): Promise<void>;
  saveAnalysis(id: string, a: Analysis): Promise<void>;
  saveEmbeddings(id: string, model: string, selfVec: number[], needVec: number[]): Promise<void>;
  findCandidates(id: string, model: string, limit: number, minScore: number): Promise<Candidate[]>;
  getBriefs(ids: string[]): Promise<IntentBrief[]>;
  createPairMatch(a: string, b: string, score: number, strength: 'strong' | 'weak', reason: I18nText, algo: string): Promise<string | null>;
  finishJob(id: number, error?: string): Promise<void>;
}

export interface AI {
  embeddingModel: string;
  /** true = 内容违规 */
  moderate(text: string): Promise<boolean>;
  analyze(body: string, userKind: IntentKind): Promise<Analysis>;
  embed(texts: string[]): Promise<number[][]>;
  judge(source: IntentBrief, candidates: IntentBrief[]): Promise<Verdict[]>;
}
