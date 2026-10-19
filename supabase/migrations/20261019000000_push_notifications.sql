-- =============================================================================
-- 推送通知
--
-- 流程：业务事件（新匹配 / 新消息）→ 触发器写入 notifications 发件箱
--       → 立即用 pg_net 唤醒 push-sender（定时任务每分钟兜底一次）
--       → push-sender 按收件人语言拼文案，调用 Expo Push API 发到手机
--
-- 发件箱的好处：发送失败可重试、可查记录，业务写入不会因为推送慢而变慢。
-- 文案在 Edge Function 里按收件人 profiles.locale 生成，数据库只存事件。
-- =============================================================================

-- ── 1. 推送 token 注册：同一台设备换账号登录时，token 归属转给新账号 ────────
create or replace function public.register_push_token(p_token text, p_platform public.push_platform)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001'; end if;
  if p_token is null or length(p_token) > 300 then raise exception 'INVALID_TOKEN' using errcode = 'P0001'; end if;
  insert into public.push_tokens (token, user_id, platform, last_seen_at)
  values (p_token, auth.uid(), p_platform, now())
  on conflict (token) do update
    set user_id = excluded.user_id, platform = excluded.platform, last_seen_at = now();
end $$;

revoke execute on function public.register_push_token(text, public.push_platform) from public, anon;
grant  execute on function public.register_push_token(text, public.push_platform) to authenticated;

-- ── 2. 发件箱 ────────────────────────────────────────────────────────────────
create type public.notification_kind   as enum ('new_match', 'new_message');
create type public.notification_status as enum ('queued', 'sending', 'sent', 'failed');

create table public.notifications (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references public.profiles (id) on delete cascade,
  kind          public.notification_kind not null,
  payload       jsonb not null,               -- {match_id} 或 {conversation_id, message_id}
  status        public.notification_status not null default 'queued',
  attempts      smallint not null default 0,
  last_error    text,
  locked_at     timestamptz,
  created_at    timestamptz not null default now(),
  sent_at       timestamptz
);
create index notifications_queue_idx on public.notifications (status, created_at) where status in ('queued', 'sending');
create index notifications_user_idx on public.notifications (user_id, created_at desc);

-- 只有服务端（service_role）能读写；客户端看不到发件箱
alter table public.notifications enable row level security;
grant select, insert, update, delete on public.notifications to service_role;

-- ── 3. 触发器：新匹配 → 通知这个参与者 ───────────────────────────────────────
create or replace function public.notify_new_match()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.profiles where id = new.user_id and notify_new_match) then
    insert into public.notifications (user_id, kind, payload)
    values (new.user_id, 'new_match', jsonb_build_object('match_id', new.match_id));
  end if;
  return new;
end $$;
create trigger match_participants_notify after insert on public.match_participants
  for each row execute function public.notify_new_match();

-- ── 4. 触发器：新消息 → 通知会话里的其他人（开着消息通知、没静音的）────────
create or replace function public.notify_new_message()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.notifications (user_id, kind, payload)
  select cm.user_id, 'new_message',
         jsonb_build_object('conversation_id', new.conversation_id, 'message_id', new.id)
  from public.conversation_members cm
  join public.profiles p on p.id = cm.user_id
  where cm.conversation_id = new.conversation_id
    and cm.user_id is distinct from new.sender_id
    and not cm.muted
    and p.notify_message;
  return new;
end $$;
create trigger messages_notify after insert on public.messages
  for each row execute function public.notify_new_message();

-- ── 5. push-sender 领取一批待发通知，内容在这里一次查好 ─────────────────────
create or replace function public.claim_notifications(p_limit int default 100)
returns table (
  id bigint,
  kind public.notification_kind,
  user_id uuid,
  locale text,
  tokens text[],
  match_id uuid,
  match_reason jsonb,
  other_intent text,
  conversation_id uuid,
  sender_name text,
  message_body text
)
language sql security definer set search_path = '' as $$
  with claimed as (
    update public.notifications n
       set status = 'sending', attempts = attempts + 1, locked_at = now()
     where n.id in (select id from public.notifications
                    where status = 'queued'
                       or (status = 'sending' and locked_at < now() - interval '5 minutes')
                    order by created_at
                    limit p_limit
                    for update skip locked)
    returning n.*
  )
  select c.id, c.kind, c.user_id, p.locale,
         coalesce((select array_agg(t.token) from public.push_tokens t where t.user_id = c.user_id), '{}'),
         m.id, m.reason_i18n,
         (select i.body from public.match_participants op join public.intents i on i.id = op.intent_id
           where op.match_id = m.id and op.user_id <> c.user_id limit 1),
         msg.conversation_id,
         sp.display_name,
         msg.body
  from claimed c
  join public.profiles p on p.id = c.user_id
  left join public.matches m on c.kind = 'new_match' and m.id = (c.payload->>'match_id')::uuid
  left join public.messages msg on c.kind = 'new_message' and msg.id = (c.payload->>'message_id')::uuid
  left join public.profiles sp on sp.id = msg.sender_id;
$$;

create or replace function public.finish_notification(p_id bigint, p_error text default null)
returns void language sql security definer set search_path = '' as $$
  update public.notifications
     set status = case when p_error is null then 'sent'::public.notification_status
                       when attempts >= 3 then 'failed'::public.notification_status
                       else 'queued'::public.notification_status end,
         sent_at = case when p_error is null then now() end,
         last_error = p_error,
         locked_at = null
   where id = p_id;
$$;

revoke execute on function public.claim_notifications(int)          from public, anon, authenticated;
revoke execute on function public.finish_notification(bigint, text) from public, anon, authenticated;
revoke execute on function public.notify_new_match()                from public, anon, authenticated;
revoke execute on function public.notify_new_message()              from public, anon, authenticated;
grant  execute on function public.claim_notifications(int)          to service_role;
grant  execute on function public.finish_notification(bigint, text) to service_role;

-- ── 6. 修复：对方已注销（参与者被级联删除）时，发起会话返回明确错误而不是崩溃 ──
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
  if v_other is null then
    raise exception 'MATCH_NOT_FOUND' using errcode = 'P0001';
  end if;

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
