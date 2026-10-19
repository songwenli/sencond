import type { AI, Candidate, Intent, Job, Store } from './types.ts';

export const ALGO_VERSION = 'v1';

export const config = {
  /** 每次召回的候选数 */
  recallLimit: 20,
  /** 向量分数低于这个值的候选直接丢弃，不交给大模型 */
  minScore: 0.3,
  /** 每条意图最多交给大模型判断的候选数（控制成本） */
  judgeTopN: 8,
};

export type JobOutcome =
  | { status: 'skipped'; reason: string }
  | { status: 'rejected' }
  | { status: 'matched'; created: number; judged: number; candidates: number }
  | { status: 'failed'; error: string };

/** 处理一个任务：审核 → 解析 → 向量化 → 召回 → 大模型判断 → 写入匹配 */
export async function processJob(job: Job, store: Store, ai: AI): Promise<JobOutcome> {
  try {
    const outcome = await run(job, store, ai);
    await store.finishJob(job.id);
    return outcome;
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await store.finishJob(job.id, error);
    return { status: 'failed', error };
  }
}

async function run(job: Job, store: Store, ai: AI): Promise<JobOutcome> {
  const intent = await store.getIntent(job.intent_id);
  if (!intent) return { status: 'skipped', reason: 'intent deleted' };
  if (intent.status !== 'active') return { status: 'skipped', reason: `status ${intent.status}` };
  if (new Date(intent.expires_at) <= new Date()) return { status: 'skipped', reason: 'expired' };
  if (intent.moderation === 'rejected' || intent.moderation === 'flagged') {
    return { status: 'skipped', reason: `moderation ${intent.moderation}` };
  }

  // 1. 新发布或改过正文的意图，先审核、解析、向量化
  if (intent.moderation === 'pending' || !intent.derived_text) {
    const ok = await analyzeIntent(intent, store, ai);
    if (!ok) return { status: 'rejected' };
  }

  // 2. 召回候选（两种匹配 + 同城过滤 + 排除已匹配 / 拉黑，都在数据库里做）
  const candidates = await store.findCandidates(intent.id, ai.embeddingModel, config.recallLimit, config.minScore);
  if (candidates.length === 0) return { status: 'matched', created: 0, judged: 0, candidates: 0 };

  // 3. 分数最高的几个交给大模型做最终判断并写理由
  const top = candidates.slice(0, config.judgeTopN);
  const briefs = await store.getBriefs([intent.id, ...top.map((c) => c.intent_id)]);
  const source = briefs.find((b) => b.id === intent.id);
  if (!source) throw new Error('source intent brief missing');
  const others = briefs.filter((b) => b.id !== intent.id);
  const verdicts = await ai.judge(source, others);

  // 4. 写入匹配
  const byId = new Map<string, Candidate>(top.map((c) => [c.intent_id, c]));
  let created = 0;
  for (const v of verdicts) {
    const cand = byId.get(v.id);
    if (!v.match || !cand) continue; // 大模型说不匹配，或返回了不在候选里的 id
    const id = await store.createPairMatch(intent.id, cand.intent_id, cand.score, v.strength, v.reason, ALGO_VERSION);
    if (id) created++;
  }
  return { status: 'matched', created, judged: others.length, candidates: candidates.length };
}

async function analyzeIntent(intent: Intent, store: Store, ai: AI): Promise<boolean> {
  if (await ai.moderate(intent.body)) {
    await store.rejectIntent(intent.id);
    return false;
  }
  const analysis = await ai.analyze(intent.body, intent.kind);
  if (analysis.unsafe) {
    await store.rejectIntent(intent.id);
    return false;
  }
  const [selfVec, needVec] = await ai.embed([analysis.self_text, analysis.need_text]);
  // 先存向量，再把意图标记为已通过，避免出现「已通过但没有向量」的意图被别人召回不到
  await store.saveEmbeddings(intent.id, ai.embeddingModel, selfVec, needVec);
  await store.saveAnalysis(intent.id, analysis);
  return true;
}

/** 一次调用里循环处理，直到队列空或者快超时 */
export async function drainQueue(store: Store, ai: AI, budgetMs = 120_000, batch = 5) {
  const started = Date.now();
  const results: Array<{ job: number; intent: string } & JobOutcome> = [];
  while (Date.now() - started < budgetMs) {
    const jobs = await store.claimJobs(batch);
    if (jobs.length === 0) break;
    const outcomes = await Promise.all(jobs.map((j) => processJob(j, store, ai)));
    jobs.forEach((j, i) => results.push({ job: j.id, intent: j.intent_id, ...outcomes[i] }));
  }
  return results;
}
