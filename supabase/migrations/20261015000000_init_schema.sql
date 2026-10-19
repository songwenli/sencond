-- =============================================================================
-- Tongpin（同频）海外版 · 初始数据库结构
-- 适用：Supabase（Postgres 15+，pgvector 0.5+）
--
-- 设计原则
--   1. 枚举用英文代码值，展示文案交给客户端 i18n
--   2. 只存事实（时间戳、ID），不存派生文案（"今天活跃"、"剩 5 天"由客户端计算）
--   3. 匹配 = 一组参与者（match_participants），一对一和多人共用一套结构
--   4. 有业务规则的写操作走 RPC（security definer），客户端不直接改状态
--   5. 向量单独成表，换 embedding 模型时不动业务表；沿用双向量设计：
--      self = 我是谁 / 我能提供什么，need = 我想找的人是什么样
--      匹配时用 A.need 对 B.self 召回，再反向校验 B.need 对 A.self
--   6. 匹配流水线由后台 worker 消费 matching_jobs 队列（service_role），客户端不可见
-- =============================================================================

-- 旧原型表保留为 intents_legacy（不删数据，确认不需要后再手动删除）
do $$
begin
  if to_regclass('public.intents') is not null and to_regclass('public.intents_legacy') is null then
    alter table public.intents rename to intents_legacy;
  end if;
end $$;

-- pgvector 从 public 挪到 extensions（Supabase 推荐做法，避免安全告警）
do $$
begin
  if exists (select 1 from pg_extension e join pg_namespace n on n.oid = e.extnamespace
             where e.extname = 'vector' and n.nspname = 'public') then
    alter extension vector set schema extensions;
  end if;
end $$;
create extension if not exists vector with schema extensions;

-- -----------------------------------------------------------------------------
-- 枚举
-- -----------------------------------------------------------------------------
create type public.intent_kind        as enum ('seek', 'offer');
create type public.intent_status      as enum ('active', 'paused', 'expired', 'archived');
create type public.moderation_status  as enum ('pending', 'approved', 'flagged', 'rejected');
create type public.match_kind         as enum ('pair', 'group');
create type public.match_strength     as enum ('strong', 'weak');
create type public.participant_status as enum ('pending', 'skipped', 'contacted', 'joined', 'left');
create type public.group_status       as enum ('forming', 'active', 'ended');
create type public.group_role         as enum ('initiator', 'member');
create type public.conversation_kind  as enum ('direct', 'group');
create type public.report_target      as enum ('user', 'intent', 'message', 'group');
create type public.report_status      as enum ('open', 'reviewing', 'resolved', 'dismissed');
create type public.job_status         as enum ('queued', 'running', 'done', 'failed');
create type public.push_platform      as enum ('ios', 'android');
create type public.embedding_facet    as enum ('self', 'need');

-- -----------------------------------------------------------------------------
-- 通用：updated_at 自动维护
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- =============================================================================
-- 用户
-- =============================================================================
create table public.profiles (
  id                  uuid primary key references auth.users (id) on delete cascade,
  display_name        text not null check (char_length(display_name) between 1 and 40),
  avatar_path         text,                         -- 只存 Storage 路径，不存完整 URL
  headline            text check (char_length(headline) <= 80),   -- "独立开发者 · 跨境电商"
  background          text check (char_length(background) <= 500),
  links               text[] not null default '{}',
  locale              text not null default 'en',   -- 界面语言，BCP-47，如 zh-Hans / en
  country_code        text check (country_code ~ '^[A-Z]{2}$'),
  city                text,
  timezone            text,
  notify_new_match    boolean not null default true,
  notify_message      boolean not null default true,
  last_active_at      timestamptz not null default now(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- 注册时自动建 profile（display_name 先取 auth 元数据，没有就用邮箱前缀）
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name, locale)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data ->> 'name',
                  nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
                  'user'), 40),
    coalesce(new.raw_user_meta_data ->> 'locale', 'en')
  );
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- =============================================================================
-- 意图
-- =============================================================================
create table public.intents (
  id                  uuid primary key default gen_random_uuid(),
  owner_id            uuid not null references public.profiles (id) on delete cascade,
  kind                public.intent_kind not null,
  body                text not null check (char_length(body) between 5 and 1000),
  lang                text,                          -- 原文语言，由 worker 识别后回填
  allow_group         boolean not null default false, -- 发布页的「多人」开关
  status              public.intent_status not null default 'active',
  moderation          public.moderation_status not null default 'pending',
  quality_score       smallint check (quality_score between 0 and 100),
  quality_hint        jsonb,                         -- {"zh-Hans": "...", "en": "..."} 补充建议
  intent_type         text,                          -- LLM 归类：activity / cofounder / advice / trade …
  slots               jsonb not null default '{}',   -- LLM 抽取：地点/时间/人数/线上线下等槽位
  derived_text        text,                          -- LLM 改写后的标准化描述，用于向量化
  country_code        text,                          -- 意图适用地区，可与用户所在地不同
  city                text,
  is_remote           boolean,
  expires_at          timestamptz not null default now() + interval '30 days',
  last_matched_at     timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index intents_owner_idx  on public.intents (owner_id, status, created_at desc);
create index intents_active_idx on public.intents (status, expires_at) where status = 'active';
create trigger intents_updated_at before update on public.intents
  for each row execute function public.set_updated_at();

-- 修改正文后需重新审核、重新匹配
create or replace function public.intents_reset_on_edit()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.body is distinct from old.body then
    new.moderation    := 'pending';
    new.quality_score := null;
    new.quality_hint  := null;
    new.lang          := null;
    new.intent_type   := null;
    new.slots         := '{}';
    new.derived_text  := null;
  end if;
  return new;
end $$;
create trigger intents_reset_on_edit before update of body on public.intents
  for each row execute function public.intents_reset_on_edit();

-- 向量单独成表：每条意图两个向量（self / need），换模型时新增行即可，不改业务表
create table public.intent_embeddings (
  intent_id           uuid not null references public.intents (id) on delete cascade,
  model               text not null,                 -- 如 'text-embedding-3-small'
  facet               public.embedding_facet not null,
  embedding           extensions.vector(1536) not null,
  created_at          timestamptz not null default now(),
  primary key (intent_id, model, facet)
);
create index intent_embeddings_self_hnsw on public.intent_embeddings
  using hnsw (embedding extensions.vector_cosine_ops) where facet = 'self';
create index intent_embeddings_need_hnsw on public.intent_embeddings
  using hnsw (embedding extensions.vector_cosine_ops) where facet = 'need';

-- 意图译文缓存（跨语言匹配时给查看者展示）
create table public.intent_translations (
  intent_id           uuid not null references public.intents (id) on delete cascade,
  lang                text not null,
  body                text not null,
  created_at          timestamptz not null default now(),
  primary key (intent_id, lang)
);

-- =============================================================================
-- 多人组
-- =============================================================================
create table public.groups (
  id                  uuid primary key default gen_random_uuid(),
  title               text not null,
  title_i18n          jsonb not null default '{}',
  status              public.group_status not null default 'forming',
  scheduled_at        timestamptz,
  location_text       text,
  country_code        text,
  city                text,
  capacity            smallint not null default 6 check (capacity between 2 and 50),
  expires_at          timestamptz not null default now() + interval '14 days',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create trigger groups_updated_at before update on public.groups
  for each row execute function public.set_updated_at();

create table public.group_members (
  group_id            uuid not null references public.groups (id) on delete cascade,
  user_id             uuid not null references public.profiles (id) on delete cascade,
  intent_id           uuid references public.intents (id) on delete set null,
  role                public.group_role not null default 'member',
  joined_at           timestamptz not null default now(),
  left_at             timestamptz,
  primary key (group_id, user_id)
);
create index group_members_user_idx on public.group_members (user_id) where left_at is null;

-- =============================================================================
-- 匹配
-- =============================================================================
create table public.matches (
  id                  uuid primary key default gen_random_uuid(),
  kind                public.match_kind not null,
  group_id            uuid references public.groups (id) on delete cascade,
  pair_key            text unique,   -- pair：两个 intent_id 排序后拼接，防止重复匹配
  score               real,
  strength            public.match_strength not null default 'weak',
  reason_i18n         jsonb not null default '{}',   -- {"zh-Hans": "你们都提到了…", "en": "..."}
  algo_version        text,                          -- 便于回溯不同版本算法的效果
  created_at          timestamptz not null default now(),
  check ((kind = 'group') = (group_id is not null)),
  check ((kind = 'pair')  = (pair_key is not null))
);
create index matches_group_idx on public.matches (group_id) where group_id is not null;

create table public.match_participants (
  match_id            uuid not null references public.matches (id) on delete cascade,
  user_id             uuid not null references public.profiles (id) on delete cascade,
  intent_id           uuid not null references public.intents (id) on delete cascade,
  status              public.participant_status not null default 'pending',
  seen_at             timestamptz,
  acted_at            timestamptz,
  created_at          timestamptz not null default now(),
  primary key (match_id, user_id)
);
create index match_participants_user_idx   on public.match_participants (user_id, status, created_at desc);
create index match_participants_intent_idx on public.match_participants (intent_id);

-- =============================================================================
-- 会话与消息
-- =============================================================================
create table public.conversations (
  id                  uuid primary key default gen_random_uuid(),
  kind                public.conversation_kind not null,
  match_id            uuid unique references public.matches (id) on delete set null,
  group_id            uuid unique references public.groups (id) on delete cascade,
  last_message_at     timestamptz,
  created_at          timestamptz not null default now(),
  check ((kind = 'group') = (group_id is not null))
);

create table public.conversation_members (
  conversation_id     uuid not null references public.conversations (id) on delete cascade,
  user_id             uuid not null references public.profiles (id) on delete cascade,
  last_read_at        timestamptz,
  muted               boolean not null default false,
  joined_at           timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
create index conversation_members_user_idx on public.conversation_members (user_id);

create table public.messages (
  id                  uuid primary key default gen_random_uuid(),
  conversation_id     uuid not null references public.conversations (id) on delete cascade,
  sender_id           uuid references public.profiles (id) on delete set null, -- 注销后显示"已注销用户"
  body                text not null check (char_length(body) between 1 and 2000),
  lang                text,
  moderation          public.moderation_status not null default 'approved',
  deleted_at          timestamptz,
  created_at          timestamptz not null default now()
);
create index messages_conv_idx on public.messages (conversation_id, created_at desc);
create index messages_sender_idx on public.messages (sender_id);

-- =============================================================================
-- 安全：拉黑 / 举报
-- =============================================================================
create table public.blocks (
  blocker_id          uuid not null references public.profiles (id) on delete cascade,
  blocked_id          uuid not null references public.profiles (id) on delete cascade,
  created_at          timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index blocks_blocked_idx on public.blocks (blocked_id);

create table public.reports (
  id                  uuid primary key default gen_random_uuid(),
  reporter_id         uuid references public.profiles (id) on delete set null,
  target_type         public.report_target not null,
  target_id           uuid not null,
  reason              text not null,                 -- 代码值：spam / harassment / inappropriate / other
  detail              text check (char_length(detail) <= 1000),
  status              public.report_status not null default 'open',
  created_at          timestamptz not null default now(),
  resolved_at         timestamptz
);
create index reports_status_idx on public.reports (status, created_at);
create index reports_reporter_idx on public.reports (reporter_id);

-- =============================================================================
-- 推送 / 功能开关 / 后台队列
-- =============================================================================
create table public.push_tokens (
  token               text primary key,
  user_id             uuid not null references public.profiles (id) on delete cascade,
  platform            public.push_platform not null,
  created_at          timestamptz not null default now(),
  last_seen_at        timestamptz not null default now()
);
create index push_tokens_user_idx on public.push_tokens (user_id);

create table public.feature_flags (
  key                 text primary key,
  enabled             boolean not null default false,
  allow_user_ids      uuid[] not null default '{}',  -- 内测白名单
  description         text,
  updated_at          timestamptz not null default now()
);
insert into public.feature_flags (key, enabled, description) values
  ('group_matching', false, '多人匹配：内测白名单先开'),
  ('intent_translation', true, '跨语言意图显示「查看翻译」');

create table public.matching_jobs (
  id                  bigint generated always as identity primary key,
  intent_id           uuid not null references public.intents (id) on delete cascade,
  reason              text not null,                 -- created / edited / reactivated / periodic
  status              public.job_status not null default 'queued',
  attempts            smallint not null default 0,
  last_error          text,
  run_after           timestamptz not null default now(),
  created_at          timestamptz not null default now(),
  finished_at         timestamptz
);
create index matching_jobs_queue_idx on public.matching_jobs (status, run_after) where status = 'queued';
create index matching_jobs_intent_idx on public.matching_jobs (intent_id);

-- 新建 / 改正文 / 重新激活 → 入队；同一意图已有排队任务时不重复入队
create or replace function public.enqueue_matching_job()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_reason text;
begin
  if new.status <> 'active' then return new; end if;
  if tg_op = 'INSERT' then
    v_reason := 'created';
  elsif new.body is distinct from old.body then
    v_reason := 'edited';
  elsif old.status <> 'active' then
    v_reason := 'reactivated';
  else
    return new;
  end if;
  if not exists (select 1 from public.matching_jobs
                 where intent_id = new.id and status = 'queued') then
    insert into public.matching_jobs (intent_id, reason) values (new.id, v_reason);
  end if;
  return new;
end $$;
create trigger intents_enqueue_matching after insert or update of body, status on public.intents
  for each row execute function public.enqueue_matching_job();

-- =============================================================================
-- 辅助函数（security definer，避免 RLS 策略互相递归，也更快）
-- =============================================================================
create or replace function public.is_match_participant(p_match_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.match_participants
                 where match_id = p_match_id and user_id = auth.uid());
$$;

create or replace function public.is_conversation_member(p_conversation_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.conversation_members
                 where conversation_id = p_conversation_id and user_id = auth.uid());
$$;

create or replace function public.can_view_group(p_group_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.group_members
                 where group_id = p_group_id and user_id = auth.uid())
      or exists (select 1 from public.matches m
                 join public.match_participants mp on mp.match_id = m.id
                 where m.group_id = p_group_id and mp.user_id = auth.uid());
$$;

-- 别人的意图：只有和我在同一个匹配里时才能看到
create or replace function public.can_view_intent(p_intent_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.match_participants theirs
    join public.match_participants mine on mine.match_id = theirs.match_id
    where theirs.intent_id = p_intent_id and mine.user_id = auth.uid());
$$;

create or replace function public.is_blocked_between(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.blocks
                 where (blocker_id = a and blocked_id = b)
                    or (blocker_id = b and blocked_id = a));
$$;

create or replace function public.feature_enabled(p_key text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select enabled or auth.uid() = any (allow_user_ids)
                   from public.feature_flags where key = p_key), false);
$$;

-- =============================================================================
-- 业务规则：消息
-- =============================================================================
-- 规则：一对一会话里，对方回复之前，发起方只能发一条
create or replace function public.enforce_first_message_rule()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_kind public.conversation_kind;
  v_mine int;
  v_theirs int;
begin
  select kind into v_kind from public.conversations where id = new.conversation_id;
  if v_kind <> 'direct' then return new; end if;

  -- 同一会话的插入串行化，防止并发绕过规则
  perform pg_advisory_xact_lock(hashtext(new.conversation_id::text));

  select count(*) filter (where sender_id = new.sender_id),
         count(*) filter (where sender_id is distinct from new.sender_id)
    into v_mine, v_theirs
  from public.messages
  where conversation_id = new.conversation_id and deleted_at is null;

  if v_theirs = 0 and v_mine >= 1 then
    raise exception 'FIRST_MESSAGE_LIMIT' using errcode = 'P0001',
      hint = 'Wait for a reply before sending another message.';
  end if;
  return new;
end $$;
create trigger messages_first_message_rule before insert on public.messages
  for each row execute function public.enforce_first_message_rule();

create or replace function public.touch_conversation()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.conversations set last_message_at = new.created_at
  where id = new.conversation_id;
  return new;
end $$;
create trigger messages_touch_conversation after insert on public.messages
  for each row execute function public.touch_conversation();

-- =============================================================================
-- RPC：客户端的状态变更都走这里
-- =============================================================================

-- 跳过一个匹配（"看看再说"之外的明确忽略）
create or replace function public.skip_match(p_match_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.match_participants
     set status = 'skipped', acted_at = now()
   where match_id = p_match_id and user_id = auth.uid() and status = 'pending';
  if not found then raise exception 'MATCH_NOT_ACTIONABLE' using errcode = 'P0001'; end if;
end $$;

-- 标记已看过（清除 NEW 角标）
create or replace function public.mark_match_seen(p_match_id uuid)
returns void language sql security definer set search_path = '' as $$
  update public.match_participants set seen_at = coalesce(seen_at, now())
  where match_id = p_match_id and user_id = auth.uid();
$$;

-- 一对一：发起会话（已存在则直接返回），之后客户端发第一条消息
create or replace function public.start_conversation(p_match_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := auth.uid();
  v_other uuid;
  v_conv uuid;
begin
  if not exists (select 1 from public.matches m
                 join public.match_participants mp on mp.match_id = m.id
                 where m.id = p_match_id and m.kind = 'pair' and mp.user_id = v_me) then
    raise exception 'MATCH_NOT_FOUND' using errcode = 'P0001';
  end if;

  select user_id into v_other from public.match_participants
   where match_id = p_match_id and user_id <> v_me;

  if public.is_blocked_between(v_me, v_other) then
    raise exception 'BLOCKED' using errcode = 'P0001';
  end if;

  select id into v_conv from public.conversations where match_id = p_match_id;
  if v_conv is null then
    insert into public.conversations (kind, match_id) values ('direct', p_match_id)
    on conflict (match_id) do nothing
    returning id into v_conv;
    if v_conv is null then
      select id into v_conv from public.conversations where match_id = p_match_id;
    end if;
    insert into public.conversation_members (conversation_id, user_id)
    values (v_conv, v_me), (v_conv, v_other)
    on conflict do nothing;
  end if;

  update public.match_participants set status = 'contacted', acted_at = now()
   where match_id = p_match_id and user_id = v_me and status in ('pending', 'skipped');
  return v_conv;
end $$;

-- 多人：加入组，返回群会话 ID
create or replace function public.join_group(p_match_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := auth.uid();
  v_group uuid;
  v_intent uuid;
  v_capacity int;
  v_count int;
  v_conv uuid;
begin
  if not public.feature_enabled('group_matching') then
    raise exception 'FEATURE_DISABLED' using errcode = 'P0001';
  end if;

  select m.group_id, mp.intent_id into v_group, v_intent
  from public.matches m
  join public.match_participants mp on mp.match_id = m.id
  where m.id = p_match_id and m.kind = 'group' and mp.user_id = v_me;
  if v_group is null then raise exception 'MATCH_NOT_FOUND' using errcode = 'P0001'; end if;

  select capacity into v_capacity from public.groups
   where id = v_group and status <> 'ended' for update;
  if v_capacity is null then raise exception 'GROUP_CLOSED' using errcode = 'P0001'; end if;

  select count(*) into v_count from public.group_members
   where group_id = v_group and left_at is null;

  if not exists (select 1 from public.group_members
                 where group_id = v_group and user_id = v_me and left_at is null) then
    if v_count >= v_capacity then raise exception 'GROUP_FULL' using errcode = 'P0001'; end if;
    insert into public.group_members (group_id, user_id, intent_id, role)
    values (v_group, v_me, v_intent, case when v_count = 0 then 'initiator' else 'member' end::public.group_role)
    on conflict (group_id, user_id) do update set left_at = null, joined_at = now();
  end if;

  insert into public.conversations (kind, group_id) values ('group', v_group)
  on conflict (group_id) do nothing;
  select id into v_conv from public.conversations where group_id = v_group;
  insert into public.conversation_members (conversation_id, user_id)
  values (v_conv, v_me) on conflict do nothing;

  update public.match_participants set status = 'joined', acted_at = now()
   where match_id = p_match_id and user_id = v_me;
  return v_conv;
end $$;

create or replace function public.leave_group(p_group_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.group_members set left_at = now()
   where group_id = p_group_id and user_id = auth.uid() and left_at is null;
  delete from public.conversation_members cm
   using public.conversations c
   where c.id = cm.conversation_id and c.group_id = p_group_id and cm.user_id = auth.uid();
  update public.match_participants mp set status = 'left', acted_at = now()
   from public.matches m
   where m.id = mp.match_id and m.group_id = p_group_id and mp.user_id = auth.uid();
end $$;

create or replace function public.mark_conversation_read(p_conversation_id uuid)
returns void language sql security definer set search_path = '' as $$
  update public.conversation_members set last_read_at = now()
  where conversation_id = p_conversation_id and user_id = auth.uid();
$$;

-- -----------------------------------------------------------------------------
-- 匹配流水线专用（只给 service_role / 后台 worker 调用）
-- -----------------------------------------------------------------------------

-- 领取一批任务（多个 worker 并发也不会重复领取）
create or replace function public.claim_matching_jobs(p_limit int default 10)
returns setof public.matching_jobs language sql security definer set search_path = '' as $$
  update public.matching_jobs j
     set status = 'running', attempts = attempts + 1
   where j.id in (select id from public.matching_jobs
                  where status = 'queued' and run_after <= now()
                  order by run_after
                  limit p_limit
                  for update skip locked)
  returning j.*;
$$;

-- 向量召回候选：用我的 need 去找别人的 self，同时算出反向分（对方的 need vs 我的 self）
-- 排除：自己、已过期、未过审、互相拉黑、已经匹配过的
create or replace function public.match_candidate_intents(
  p_intent_id uuid,
  p_model text,
  p_limit int default 50,
  p_min_similarity real default 0.3
)
returns table (intent_id uuid, owner_id uuid, kind public.intent_kind,
               forward_similarity real, backward_similarity real)
language sql stable security definer set search_path = '' as $$
  with src as (
    select i.id, i.owner_id,
           (select embedding from public.intent_embeddings
             where intent_id = i.id and model = p_model and facet = 'need') as need_vec,
           (select embedding from public.intent_embeddings
             where intent_id = i.id and model = p_model and facet = 'self') as self_vec
    from public.intents i
    where i.id = p_intent_id
  ),
  recalled as (
    select ce.intent_id,
           (1 - (ce.embedding operator(extensions.<=>) src.need_vec))::real as fwd
    from src
    join public.intent_embeddings ce
      on ce.model = p_model and ce.facet = 'self' and ce.intent_id <> src.id
    where src.need_vec is not null
    order by ce.embedding operator(extensions.<=>) src.need_vec
    limit p_limit * 4
  )
  select c.id, c.owner_id, c.kind, r.fwd,
         (1 - (cn.embedding operator(extensions.<=>) src.self_vec))::real
  from recalled r
  cross join src
  join public.intents c on c.id = r.intent_id
  left join public.intent_embeddings cn
    on cn.intent_id = c.id and cn.model = p_model and cn.facet = 'need'
  where r.fwd >= p_min_similarity
    and c.owner_id <> src.owner_id
    and c.status = 'active'
    and c.moderation = 'approved'
    and c.expires_at > now()
    and not public.is_blocked_between(c.owner_id, src.owner_id)
    and not exists (
      select 1 from public.matches m
      where m.pair_key = least(src.id::text, c.id::text) || ':' || greatest(src.id::text, c.id::text))
  order by r.fwd desc
  limit p_limit;
$$;

-- 写入一个一对一匹配（worker 生成理由后调用），返回 match_id；已存在则返回 null
create or replace function public.create_pair_match(
  p_intent_a uuid, p_intent_b uuid,
  p_score real, p_strength public.match_strength,
  p_reason_i18n jsonb, p_algo_version text
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_match uuid;
  v_key text := least(p_intent_a::text, p_intent_b::text) || ':' || greatest(p_intent_a::text, p_intent_b::text);
begin
  insert into public.matches (kind, pair_key, score, strength, reason_i18n, algo_version)
  values ('pair', v_key, p_score, p_strength, p_reason_i18n, p_algo_version)
  on conflict (pair_key) do nothing
  returning id into v_match;
  if v_match is null then return null; end if;

  insert into public.match_participants (match_id, user_id, intent_id)
  select v_match, owner_id, id from public.intents where id in (p_intent_a, p_intent_b);
  update public.intents set last_matched_at = now() where id in (p_intent_a, p_intent_b);
  return v_match;
end $$;

-- =============================================================================
-- 权限：worker 专用函数不对客户端开放
-- =============================================================================
revoke execute on function public.claim_matching_jobs(int)                       from public, anon, authenticated;
revoke execute on function public.match_candidate_intents(uuid, text, int, real) from public, anon, authenticated;
revoke execute on function public.create_pair_match(uuid, uuid, real, public.match_strength, jsonb, text) from public, anon, authenticated;
revoke execute on function public.handle_new_user()           from public, anon, authenticated;
revoke execute on function public.enqueue_matching_job()      from public, anon, authenticated;
revoke execute on function public.enforce_first_message_rule() from public, anon, authenticated;
revoke execute on function public.touch_conversation()        from public, anon, authenticated;

grant  execute on function public.claim_matching_jobs(int)                       to service_role;
grant  execute on function public.match_candidate_intents(uuid, text, int, real) to service_role;
grant  execute on function public.create_pair_match(uuid, uuid, real, public.match_strength, jsonb, text) to service_role;

-- 客户端 RPC 只给登录用户
revoke execute on function public.skip_match(uuid)             from public, anon;
revoke execute on function public.mark_match_seen(uuid)        from public, anon;
revoke execute on function public.start_conversation(uuid)     from public, anon;
revoke execute on function public.join_group(uuid)             from public, anon;
revoke execute on function public.leave_group(uuid)            from public, anon;
revoke execute on function public.mark_conversation_read(uuid) from public, anon;
grant  execute on function public.skip_match(uuid)             to authenticated;
grant  execute on function public.mark_match_seen(uuid)        to authenticated;
grant  execute on function public.start_conversation(uuid)     to authenticated;
grant  execute on function public.join_group(uuid)             to authenticated;
grant  execute on function public.leave_group(uuid)            to authenticated;
grant  execute on function public.mark_conversation_read(uuid) to authenticated;

-- =============================================================================
-- 行级安全（RLS）
-- 没写策略的表 = 客户端完全不可访问，只有 service_role 能读写
--   intent_embeddings / matching_jobs 就是这种
-- =============================================================================
alter table public.profiles             enable row level security;
alter table public.intents              enable row level security;
alter table public.intent_embeddings    enable row level security;
alter table public.intent_translations  enable row level security;
alter table public.groups               enable row level security;
alter table public.group_members        enable row level security;
alter table public.matches              enable row level security;
alter table public.match_participants   enable row level security;
alter table public.conversations        enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages             enable row level security;
alter table public.blocks               enable row level security;
alter table public.reports              enable row level security;
alter table public.push_tokens          enable row level security;
alter table public.feature_flags        enable row level security;
alter table public.matching_jobs        enable row level security;

-- profiles：登录用户可看（拉黑关系除外），只能改自己
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or not public.is_blocked_between(id, (select auth.uid())));
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- intents：自己的全权；别人的只在匹配到时可读
create policy intents_select on public.intents for select to authenticated
  using (owner_id = (select auth.uid()) or public.can_view_intent(id));
create policy intents_insert on public.intents for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy intents_update on public.intents for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy intents_delete on public.intents for delete to authenticated
  using (owner_id = (select auth.uid()));
-- 客户端不能自己改审核结果、评分、抽取结果
revoke update on public.intents from authenticated;
grant  update (body, kind, allow_group, status, country_code, city, is_remote, expires_at)
  on public.intents to authenticated;

create policy intent_translations_select on public.intent_translations for select to authenticated
  using (exists (select 1 from public.intents i where i.id = intent_id
                 and (i.owner_id = (select auth.uid()) or public.can_view_intent(i.id))));

-- groups / group_members
create policy groups_select on public.groups for select to authenticated
  using (public.can_view_group(id));
create policy group_members_select on public.group_members for select to authenticated
  using (public.can_view_group(group_id));

-- matches / match_participants：只读，状态变更走 RPC
create policy matches_select on public.matches for select to authenticated
  using (public.is_match_participant(id));
create policy match_participants_select on public.match_participants for select to authenticated
  using (public.is_match_participant(match_id));

-- 会话与消息
create policy conversations_select on public.conversations for select to authenticated
  using (public.is_conversation_member(id));
create policy conversation_members_select on public.conversation_members for select to authenticated
  using (public.is_conversation_member(conversation_id));
create policy conversation_members_update on public.conversation_members for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke update on public.conversation_members from authenticated;
grant  update (muted, last_read_at) on public.conversation_members to authenticated;

create policy messages_select on public.messages for select to authenticated
  using (public.is_conversation_member(conversation_id));
create policy messages_insert on public.messages for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and public.is_conversation_member(conversation_id)
    and not exists (
      select 1 from public.conversations c
      join public.conversation_members other
        on other.conversation_id = c.id and other.user_id <> (select auth.uid())
      where c.id = messages.conversation_id and c.kind = 'direct'
        and public.is_blocked_between((select auth.uid()), other.user_id))
  );
-- 撤回：只能软删除自己的消息
create policy messages_update on public.messages for update to authenticated
  using (sender_id = (select auth.uid())) with check (sender_id = (select auth.uid()));
revoke update on public.messages from authenticated;
grant  update (deleted_at) on public.messages to authenticated;

-- 拉黑
create policy blocks_select on public.blocks for select to authenticated
  using (blocker_id = (select auth.uid()));
create policy blocks_insert on public.blocks for insert to authenticated
  with check (blocker_id = (select auth.uid()));
create policy blocks_delete on public.blocks for delete to authenticated
  using (blocker_id = (select auth.uid()));

-- 举报：只能提交，能看自己提交过的
create policy reports_insert on public.reports for insert to authenticated
  with check (reporter_id = (select auth.uid()));
create policy reports_select on public.reports for select to authenticated
  using (reporter_id = (select auth.uid()));

-- 推送 token
create policy push_tokens_all on public.push_tokens for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- 功能开关：只读
create policy feature_flags_select on public.feature_flags for select to authenticated
  using (true);

-- =============================================================================
-- Realtime：聊天消息、新匹配实时推到客户端
-- =============================================================================
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.messages, public.match_participants, public.conversation_members;
  end if;
end $$;
