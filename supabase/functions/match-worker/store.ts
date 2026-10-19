import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { Analysis, Candidate, I18nText, Intent, IntentBrief, Job, Store } from './types.ts';

/** 生产环境的数据层：通过 service role 访问数据库（绕过 RLS，只在服务端用） */
export function createSupabaseStore(url: string, serviceKey: string): Store {
  const db: SupabaseClient = createClient(url, serviceKey, { auth: { persistSession: false } });
  const check = <T>(r: { data: T; error: { message: string } | null }, op: string): T => {
    if (r.error) throw new Error(`${op}: ${r.error.message}`);
    return r.data;
  };

  return {
    async claimJobs(limit) {
      return check(await db.rpc('claim_matching_jobs', { p_limit: limit }), 'claimJobs') as Job[];
    },

    async getIntent(id) {
      const r = await db
        .from('intents')
        .select('id, owner_id, kind, body, status, moderation, expires_at, derived_text, city, is_remote')
        .eq('id', id)
        .maybeSingle();
      return check(r, 'getIntent') as Intent | null;
    },

    async rejectIntent(id) {
      check(await db.from('intents').update({ moderation: 'rejected' }).eq('id', id), 'rejectIntent');
    },

    async saveAnalysis(id, a: Analysis) {
      check(
        await db
          .from('intents')
          .update({
            kind: a.kind,
            lang: a.lang,
            intent_type: a.intent_type,
            derived_text: a.derived_text,
            is_remote: a.is_remote,
            city: a.city,
            country_code: a.country_code,
            slots: a.slots,
            quality_score: a.quality_score,
            quality_hint: a.quality_hint,
            moderation: 'approved',
          })
          .eq('id', id),
        'saveAnalysis',
      );
    },

    async saveEmbeddings(id, model, selfVec, needVec) {
      const v = (x: number[]) => `[${x.join(',')}]`;
      check(
        await db.from('intent_embeddings').upsert([
          { intent_id: id, model, facet: 'self', embedding: v(selfVec) },
          { intent_id: id, model, facet: 'need', embedding: v(needVec) },
        ]),
        'saveEmbeddings',
      );
    },

    async findCandidates(id, model, limit, minScore) {
      const r = await db.rpc('match_candidates', { p_intent_id: id, p_model: model, p_limit: limit, p_min_score: minScore });
      return check(r, 'findCandidates') as Candidate[];
    },

    async getBriefs(ids) {
      const r = await db.from('intents').select('id, kind, body, derived_text, city, is_remote').in('id', ids);
      return check(r, 'getBriefs') as IntentBrief[];
    },

    async createPairMatch(a, b, score, strength, reason: I18nText, algo) {
      const r = await db.rpc('create_pair_match', {
        p_intent_a: a,
        p_intent_b: b,
        p_score: score,
        p_strength: strength,
        p_reason_i18n: reason,
        p_algo_version: algo,
      });
      return check(r, 'createPairMatch') as string | null;
    },

    async finishJob(id, error) {
      check(await db.rpc('finish_matching_job', { p_job_id: id, p_error: error ?? null }), 'finishJob');
    },
  };
}
