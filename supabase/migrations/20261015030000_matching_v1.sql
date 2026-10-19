-- =============================================================================
-- 匹配 v1：候选召回支持两种匹配 + 同城过滤 + 任务重试
--
-- 两种匹配：
--   互补型 complementary：A 想找的 ≈ B 能提供的（出租 ↔ 求租、找合伙人 ↔ 想加入的工程师）
--       分数 = (A.need·B.self + B.need·A.self) / 2
--   同好型 similar：A 想找的 ≈ B 想找的（都想找人玩飞盘、都想学日语）
--       分数 = A.need·B.need
-- 召回时两路各取一批，合并后两种分数都算，交给 worker 里的大模型做最终判断。
--
-- 同城过滤：两边都是线下意图（is_remote = false）时，国家或城市不同就不匹配。
-- 任何一边是线上意图，或城市未知，都放行。
-- =============================================================================

-- ── 任务锁：worker 中途崩溃时，10 分钟后任务会被重新领取 ─────────────────────
alter table public.matching_jobs add column if not exists locked_at timestamptz;

create or replace function public.claim_matching_jobs(p_limit int default 10)
returns setof public.matching_jobs language sql security definer set search_path = '' as $$
  update public.matching_jobs j
     set status = 'running', attempts = attempts + 1, locked_at = now()
   where j.id in (select id from public.matching_jobs
                  where (status = 'queued' and run_after <= now())
                     or (status = 'running' and locked_at < now() - interval '10 minutes')
                  order by run_after
                  limit p_limit
                  for update skip locked)
  returning j.*;
$$;

-- 完成或失败：失败时指数退避重试（2、4、8、16 分钟），第 5 次仍失败则标记 failed
create or replace function public.finish_matching_job(p_job_id bigint, p_error text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_error is null then
    update public.matching_jobs
       set status = 'done', finished_at = now(), last_error = null, locked_at = null
     where id = p_job_id;
  else
    update public.matching_jobs
       set status     = case when attempts >= 5 then 'failed'::public.job_status else 'queued'::public.job_status end,
           run_after  = now() + make_interval(mins => power(2, attempts)::int),
           last_error = left(p_error, 2000),
           finished_at = case when attempts >= 5 then now() end,
           locked_at  = null
     where id = p_job_id;
  end if;
end $$;

-- ── 候选召回 v2 ───────────────────────────────────────────────────────────────
create or replace function public.match_candidates(
  p_intent_id uuid,
  p_model text,
  p_limit int default 20,
  p_min_score real default 0.25
)
returns table (
  intent_id uuid,
  owner_id uuid,
  kind public.intent_kind,
  complementary_score real,
  similar_score real,
  score real
)
language sql stable security definer set search_path = '' as $$
  with src as (
    select i.id, i.owner_id, i.is_remote, i.city, i.country_code,
           (select embedding from public.intent_embeddings
             where intent_id = i.id and model = p_model and facet = 'need') as need_vec,
           (select embedding from public.intent_embeddings
             where intent_id = i.id and model = p_model and facet = 'self') as self_vec
    from public.intents i
    where i.id = p_intent_id
  ),
  -- 互补：我想找的 vs 别人的自我描述
  recall_comp as (
    select e.intent_id
    from src join public.intent_embeddings e
      on e.model = p_model and e.facet = 'self' and e.intent_id <> src.id
    where src.need_vec is not null
    order by e.embedding operator(extensions.<=>) src.need_vec
    limit p_limit * 3
  ),
  -- 同好：我想找的 vs 别人想找的
  recall_sim as (
    select e.intent_id
    from src join public.intent_embeddings e
      on e.model = p_model and e.facet = 'need' and e.intent_id <> src.id
    where src.need_vec is not null
    order by e.embedding operator(extensions.<=>) src.need_vec
    limit p_limit * 3
  ),
  recalled as (
    select intent_id from recall_comp union select intent_id from recall_sim
  ),
  scored as (
    select c.id, c.owner_id, c.kind,
           (( (1 - (cs.embedding operator(extensions.<=>) src.need_vec))
            + coalesce(1 - (cn.embedding operator(extensions.<=>) src.self_vec), 0) ) / 2)::real as comp,
           (1 - (cn.embedding operator(extensions.<=>) src.need_vec))::real as sim
    from recalled r
    cross join src
    join public.intents c on c.id = r.intent_id
    join public.intent_embeddings cs on cs.intent_id = c.id and cs.model = p_model and cs.facet = 'self'
    left join public.intent_embeddings cn on cn.intent_id = c.id and cn.model = p_model and cn.facet = 'need'
    where c.owner_id <> src.owner_id
      and c.status = 'active'
      and c.moderation = 'approved'
      and c.expires_at > now()
      and not public.is_blocked_between(c.owner_id, src.owner_id)
      -- 同城过滤：两边都是线下时，国家 / 城市必须一致
      and not (
        coalesce(src.is_remote, false) = false and coalesce(c.is_remote, false) = false
        and (
          (src.country_code is not null and c.country_code is not null and src.country_code <> c.country_code)
          or (src.city is not null and c.city is not null and lower(src.city) <> lower(c.city))
        )
      )
      and not exists (
        select 1 from public.matches m
        where m.pair_key = least(src.id::text, c.id::text) || ':' || greatest(src.id::text, c.id::text))
  )
  select id, owner_id, kind, comp, coalesce(sim, 0),
         greatest(comp, coalesce(sim, 0)) as score
  from scored
  where greatest(comp, coalesce(sim, 0)) >= p_min_score
  order by score desc
  limit p_limit;
$$;

revoke execute on function public.match_candidates(uuid, text, int, real) from public, anon, authenticated;
revoke execute on function public.finish_matching_job(bigint, text)       from public, anon, authenticated;
grant  execute on function public.match_candidates(uuid, text, int, real) to service_role;
grant  execute on function public.finish_matching_job(bigint, text)       to service_role;
