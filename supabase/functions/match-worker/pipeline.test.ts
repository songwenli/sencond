// 本地集成测试：真实 Postgres（跑过全部迁移）+ 确定性的假 AI。
// 验证流水线和 SQL 的配合，不验证真实模型的效果（那个用真实数据跑）。
// 运行：TEST_DATABASE_URL=postgres://... deno test -A pipeline.test.ts
import postgres from 'npm:postgres@3';
import { ok as assert, deepStrictEqual as assertEquals } from 'node:assert';
import { drainQueue } from './pipeline.ts';
import type { AI, Analysis, IntentKind, Store, Verdict } from './types.ts';

const sql = postgres(Deno.env.get('TEST_DATABASE_URL')!, { onnotice: () => {} });

// ── 用 SQL 直接实现 Store（等价于 service role）─────────────────────────────
const store: Store = {
  claimJobs: (n) => sql`select * from claim_matching_jobs(${n})` as any,
  async getIntent(id) {
    const [r] = await sql`select id, owner_id, kind, body, status, moderation, expires_at, derived_text, city, is_remote from intents where id = ${id}`;
    return (r as any) ?? null;
  },
  async rejectIntent(id) { await sql`update intents set moderation = 'rejected' where id = ${id}`; },
  async saveAnalysis(id, a) {
    await sql`update intents set kind = ${a.kind}, lang = ${a.lang}, intent_type = ${a.intent_type},
      derived_text = ${a.derived_text}, is_remote = ${a.is_remote}, city = ${a.city}, country_code = ${a.country_code},
      slots = ${sql.json(a.slots as any)}, quality_score = ${a.quality_score},
      quality_hint = ${a.quality_hint ? sql.json(a.quality_hint as any) : null}, moderation = 'approved' where id = ${id}`;
  },
  async saveEmbeddings(id, model, s, n) {
    const v = (x: number[]) => `[${x.join(',')}]`;
    await sql`insert into intent_embeddings (intent_id, model, facet, embedding) values
      (${id}, ${model}, 'self', ${v(s)}::extensions.vector), (${id}, ${model}, 'need', ${v(n)}::extensions.vector)
      on conflict (intent_id, model, facet) do update set embedding = excluded.embedding`;
  },
  findCandidates: (id, model, limit, min) => sql`select * from match_candidates(${id}, ${model}, ${limit}, ${min})` as any,
  getBriefs: (ids) => sql`select id, kind, body, derived_text, city, is_remote from intents where id = any(${ids})` as any,
  async createPairMatch(a, b, score, strength, reason, algo) {
    const [r] = await sql`select create_pair_match(${a}, ${b}, ${score}, ${strength}, ${sql.json(reason as any)}, ${algo}) as id`;
    return r.id;
  },
  async finishJob(id, error) { await sql`select finish_matching_job(${id}, ${error ?? null})`; },
};

// ── 假 AI：按帖子内容返回预设解析，向量用词袋哈希（有共同词就相似）──────────────
type Fixture = Omit<Analysis, 'lang' | 'slots' | 'quality_score' | 'quality_hint' | 'derived_text' | 'unsafe'>;
const F: Record<string, Fixture> = {
  '我想租一个姑苏区的房子': {
    kind: 'seek', intent_type: 'housing_rental', is_remote: false, city: 'Suzhou', country_code: 'CN',
    self_text: 'tenant looking to rent apartment gusu suzhou', need_text: 'landlord renting out apartment gusu suzhou',
  },
  '我要出租一个套姑苏区的房子': {
    kind: 'offer', intent_type: 'housing_rental', is_remote: false, city: 'Suzhou', country_code: 'CN',
    self_text: 'landlord renting out apartment gusu suzhou', need_text: 'tenant looking to rent apartment gusu suzhou',
  },
  '也在找姑苏区的房子租': {
    kind: 'seek', intent_type: 'housing_rental', is_remote: false, city: 'Suzhou', country_code: 'CN',
    self_text: 'tenant looking to rent apartment gusu suzhou', need_text: 'landlord renting out apartment gusu suzhou',
  },
  '周末想在上海找人玩飞盘': {
    kind: 'seek', intent_type: 'activity_partner', is_remote: false, city: 'Shanghai', country_code: 'CN',
    self_text: 'beginner frisbee player weekends shanghai', need_text: 'partner to play frisbee weekends shanghai',
  },
  'Looking for frisbee buddies in Shanghai on weekends': {
    kind: 'seek', intent_type: 'activity_partner', is_remote: false, city: 'Shanghai', country_code: 'CN',
    self_text: 'frisbee player weekends shanghai', need_text: 'partner to play frisbee weekends shanghai',
  },
  '北京周末飞盘找搭子': {
    kind: 'seek', intent_type: 'activity_partner', is_remote: false, city: 'Beijing', country_code: 'CN',
    self_text: 'frisbee player weekends beijing', need_text: 'partner to play frisbee weekends beijing',
  },
  '想搞清楚欧盟跨境支付合规': {
    kind: 'seek', intent_type: 'advice', is_remote: true, city: 'Hangzhou', country_code: 'CN',
    self_text: 'founder needs help eu payment compliance psd2', need_text: 'expert eu payment compliance psd2 advice',
  },
  'I can advise on EU payment compliance (PSD2)': {
    kind: 'offer', intent_type: 'advice', is_remote: true, city: 'Berlin', country_code: 'DE',
    self_text: 'expert eu payment compliance psd2 advice', need_text: 'founder needs help eu payment compliance psd2',
  },
};

function bow(text: string): number[] {
  const v = new Array(1536).fill(0);
  for (const w of text.toLowerCase().split(/\W+/).filter(Boolean)) {
    let h = 0;
    for (const c of w) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    v[h % 1536] += 1;
  }
  const n = Math.hypot(...v) || 1;
  return v.map((x) => x / n);
}

const calls = { analyze: 0, judge: 0 };
let failNextAnalyze = false;
const fakeAI: AI = {
  embeddingModel: 'fake-bow',
  async moderate(text) { return text.includes('BANNED'); },
  async analyze(body, userKind: IntentKind) {
    calls.analyze++;
    if (failNextAnalyze) { failNextAnalyze = false; throw new Error('LLM timeout (simulated)'); }
    const f = F[body];
    if (!f) throw new Error(`no fixture for ${body}`);
    return { ...f, lang: 'x', slots: {}, quality_score: 80, quality_hint: null, derived_text: f.need_text, unsafe: false };
  },
  async embed(texts) { return texts.map(bow); },
  async judge(source, cands) {
    calls.judge++;
    const sf = F[source.body];
    return cands.map((c): Verdict => {
      const cf = F[c.body];
      const sameType = cf.intent_type === sf.intent_type;
      const competing = sf.intent_type === 'housing_rental' && cf.kind === sf.kind; // 两个租客不算匹配
      const match = sameType && !competing;
      return {
        id: c.id, match, type: sf.kind === cf.kind ? 'similar' : 'complementary', strength: 'strong',
        reason: match ? { en: 'test reason', 'zh-Hans': '测试理由' } : { en: '', 'zh-Hans': '' },
      };
    });
  },
};

// ── 测试数据 ─────────────────────────────────────────────────────────────────
async function reset() {
  await sql`truncate matches, match_participants, intent_embeddings, matching_jobs, intents cascade`;
  await sql`delete from auth.users`;
}
async function post(body: string, kind: IntentKind = 'seek') {
  const [u] = await sql`insert into auth.users (email) values (${crypto.randomUUID() + '@t.dev'}) returning id`;
  const [i] = await sql`insert into intents (owner_id, kind, body) values (${u.id}, ${kind}, ${body}) returning id`;
  return i.id as string;
}
async function matchedPairs() {
  const rows = await sql`
    select a.body as a, b.body as b from matches m
    join match_participants pa on pa.match_id = m.id
    join match_participants pb on pb.match_id = m.id and pb.intent_id > pa.intent_id
    join intents a on a.id = pa.intent_id join intents b on b.id = pb.intent_id`;
  return rows.map((r) => [r.a, r.b].sort().join(' <-> ')).sort();
}

Deno.test('complementary + similar + city filter + competing excluded + remote across cities', async () => {
  await reset();
  // 和你在 app 里发的一样：出租的人误选了「我想找」，应由大模型纠正为 offer
  await post('我想租一个姑苏区的房子', 'seek');
  await post('我要出租一个套姑苏区的房子', 'seek');
  await post('也在找姑苏区的房子租', 'seek');
  await post('周末想在上海找人玩飞盘');
  await post('Looking for frisbee buddies in Shanghai on weekends');
  await post('北京周末飞盘找搭子');
  await post('想搞清楚欧盟跨境支付合规');
  await post('I can advise on EU payment compliance (PSD2)', 'offer');

  const results = await drainQueue(store, fakeAI);
  assertEquals(results.filter((r) => r.status === 'failed'), []);

  const pairs = await matchedPairs();
  console.log(pairs);
  assert(pairs.includes('我想租一个姑苏区的房子 <-> 我要出租一个套姑苏区的房子'), 'tenant ↔ landlord');
  assert(pairs.includes('也在找姑苏区的房子租 <-> 我要出租一个套姑苏区的房子'), 'second tenant ↔ landlord');
  assert(!pairs.includes('也在找姑苏区的房子租 <-> 我想租一个姑苏区的房子'), 'two tenants must not match');
  assert(pairs.includes('Looking for frisbee buddies in Shanghai on weekends <-> 周末想在上海找人玩飞盘'), 'similar, cross-language');
  assert(!pairs.some((p) => p.includes('北京')), 'Beijing frisbee must not match Shanghai');
  assert(pairs.includes('I can advise on EU payment compliance (PSD2) <-> 想搞清楚欧盟跨境支付合规'), 'remote across cities');

  const [landlord] = await sql`select kind, moderation from intents where body = '我要出租一个套姑苏区的房子'`;
  assertEquals(landlord.kind, 'offer', 'kind corrected by analysis');
  assertEquals(landlord.moderation, 'approved');
  const [{ n }] = await sql`select count(*)::int as n from matching_jobs where status <> 'done'`;
  assertEquals(n, 0, 'all jobs done');
});

Deno.test('moderation rejects, failures retry with backoff', async () => {
  await reset();
  const bad = await post('BANNED content here');
  const flaky = await post('我想租一个姑苏区的房子');
  failNextAnalyze = true;

  const results = await drainQueue(store, fakeAI);
  const [b] = await sql`select moderation from intents where id = ${bad}`;
  assertEquals(b.moderation, 'rejected');

  const [job] = await sql`select status, attempts, last_error, run_after > now() as delayed from matching_jobs where intent_id = ${flaky}`;
  assertEquals(job.status, 'queued', 'failed job goes back to queue');
  assertEquals(job.attempts, 1);
  assert(job.delayed, 'retry is delayed');
  assert(String(job.last_error).includes('simulated'));
  assert(results.some((r) => r.status === 'failed'));
});

Deno.test('re-running does not create duplicate matches', async () => {
  await reset();
  await post('我想租一个姑苏区的房子');
  await post('我要出租一个套姑苏区的房子');
  await drainQueue(store, fakeAI);
  // 再把两条都重新入队（模拟重新激活）
  await sql`insert into matching_jobs (intent_id, reason) select id, 'periodic' from intents`;
  const judgeBefore = calls.judge;
  await drainQueue(store, fakeAI);
  const [{ n }] = await sql`select count(*)::int as n from matches`;
  assertEquals(n, 1);
  assertEquals(calls.judge, judgeBefore, 'already-matched pairs are excluded before calling the LLM');
  await sql.end();
});

Deno.test('config: only GEMINI_API_KEY => free setup', async () => {
  const { configFromEnv } = await import('./ai.ts');
  const c = configFromEnv((k) => ({ GEMINI_API_KEY: 'g' } as Record<string, string>)[k]);
  assertEquals(c.llmBaseUrl, 'https://generativelanguage.googleapis.com/v1beta/openai');
  assertEquals(c.llmApiKey, 'g');
  assertEquals(c.embeddingProvider, 'supabase');
  assertEquals(c.embeddingModel, 'gte-small');
  assertEquals(c.openaiApiKey, undefined);
  const o = configFromEnv((k) => ({ OPENAI_API_KEY: 'o' } as Record<string, string>)[k]);
  assertEquals(o.embeddingProvider, 'openai');
  assertEquals(o.llmBaseUrl, 'https://api.openai.com/v1');
});
