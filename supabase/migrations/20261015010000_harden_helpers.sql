-- =============================================================================
-- 补丁：收紧辅助函数权限（来自 Supabase 安全检查）
--   1. 未登录用户（anon）不能调用任何辅助函数
--   2. is_blocked_between 只回答「我和某人之间」的拉黑关系，
--      防止登录用户探测任意两个人之间是否拉黑；后台 worker（无 uid）不受影响
--   3. 补 group_members.intent_id 外键索引
-- =============================================================================

create or replace function public.is_blocked_between(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select (auth.uid() is null or auth.uid() in (a, b))
     and exists (select 1 from public.blocks
                 where (blocker_id = a and blocked_id = b)
                    or (blocker_id = b and blocked_id = a));
$$;

revoke execute on function public.is_match_participant(uuid)   from public, anon;
revoke execute on function public.is_conversation_member(uuid) from public, anon;
revoke execute on function public.can_view_group(uuid)         from public, anon;
revoke execute on function public.can_view_intent(uuid)        from public, anon;
revoke execute on function public.is_blocked_between(uuid, uuid) from public, anon;
revoke execute on function public.feature_enabled(text)        from public, anon;

grant execute on function public.is_match_participant(uuid)   to authenticated, service_role;
grant execute on function public.is_conversation_member(uuid) to authenticated, service_role;
grant execute on function public.can_view_group(uuid)         to authenticated, service_role;
grant execute on function public.can_view_intent(uuid)        to authenticated, service_role;
grant execute on function public.is_blocked_between(uuid, uuid) to authenticated, service_role;
grant execute on function public.feature_enabled(text)        to authenticated, service_role;

create index if not exists group_members_intent_idx on public.group_members (intent_id);
