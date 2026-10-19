-- =============================================================================
-- 补丁：显式授予 API 角色的表权限
--
-- 这个 Supabase 项目关闭了「新表自动暴露给 Data API」，新建表默认对
-- authenticated / service_role 没有 SELECT/INSERT/UPDATE/DELETE 权限，
-- 导致 app 发布意图时返回 403。这里按「最小权限」逐表授权：
--   - RLS 决定「能动哪些行」，GRANT 决定「能动哪些表 / 列」，两层都要有
--   - 客户端能写的列逐一列出，审核状态、评分等由后台写的列不开放
--   - intent_embeddings / matching_jobs / intents_legacy 不给客户端任何权限
--   - anon（未登录）不给任何表权限
-- =============================================================================

grant usage on schema public to authenticated, service_role;

-- 后台 worker（service_role 本身绕过 RLS）
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

-- ── profiles ────────────────────────────────────────────────────────────────
grant select on public.profiles to authenticated;
grant update (display_name, avatar_path, headline, background, links, locale,
              country_code, city, timezone, notify_new_match, notify_message, last_active_at)
  on public.profiles to authenticated;

-- ── intents：插入只能写用户填的字段，审核/评分/抽取结果由后台写 ─────────────
grant select, delete on public.intents to authenticated;
grant insert (owner_id, kind, body, allow_group, country_code, city, is_remote, expires_at)
  on public.intents to authenticated;
grant update (body, kind, allow_group, status, country_code, city, is_remote, expires_at)
  on public.intents to authenticated;

grant select on public.intent_translations to authenticated;

-- ── 匹配 / 群组：只读，状态变更走 RPC ───────────────────────────────────────
grant select on public.groups, public.group_members,
                public.matches, public.match_participants to authenticated;

-- ── 会话与消息 ───────────────────────────────────────────────────────────────
grant select on public.conversations to authenticated;
grant select on public.conversation_members to authenticated;
grant update (muted, last_read_at) on public.conversation_members to authenticated;

grant select on public.messages to authenticated;
grant insert (conversation_id, sender_id, body) on public.messages to authenticated;
grant update (deleted_at) on public.messages to authenticated;

-- ── 安全 ─────────────────────────────────────────────────────────────────────
grant select, delete on public.blocks to authenticated;
grant insert (blocker_id, blocked_id) on public.blocks to authenticated;

grant select on public.reports to authenticated;
grant insert (reporter_id, target_type, target_id, reason, detail) on public.reports to authenticated;

-- ── 推送 / 开关 ──────────────────────────────────────────────────────────────
grant select, delete on public.push_tokens to authenticated;
grant insert (token, user_id, platform, last_seen_at) on public.push_tokens to authenticated;
grant update (last_seen_at, platform) on public.push_tokens to authenticated;

grant select on public.feature_flags to authenticated;
