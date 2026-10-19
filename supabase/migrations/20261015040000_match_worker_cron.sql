-- =============================================================================
-- 定时触发匹配 worker（Supabase Edge Function: match-worker）
--
-- 每 30 秒检查一次队列，只有存在待处理任务时才调用 worker，空闲时不产生调用。
-- 地址和密钥存在 Vault 里，不写进迁移文件。首次部署时执行一次（地址换成实际的）：
--   select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
--   select vault.create_secret(gen_random_uuid()::text || gen_random_uuid()::text, 'match_worker_secret');
-- 密钥在数据库里随机生成，只存在 Vault 中；worker 收到请求后调用
-- verify_match_worker_secret() 核对，任何人都不需要看到或复制它。
-- =============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.verify_match_worker_secret(p_secret text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from vault.decrypted_secrets
                 where name = 'match_worker_secret' and decrypted_secret = p_secret);
$$;
revoke execute on function public.verify_match_worker_secret(text) from public, anon, authenticated;
grant  execute on function public.verify_match_worker_secret(text) to service_role;

create or replace function public.trigger_match_worker()
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_url text;
  v_secret text;
begin
  if not exists (select 1 from public.matching_jobs
                 where (status = 'queued' and run_after <= now())
                    or (status = 'running' and locked_at < now() - interval '10 minutes')) then
    return;
  end if;

  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'match_worker_secret';
  if v_url is null or v_secret is null then
    raise warning 'match worker not configured: missing vault secrets project_url / match_worker_secret';
    return;
  end if;

  perform net.http_post(
    url := v_url || '/functions/v1/match-worker',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-worker-secret', v_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  );
end $$;

revoke execute on function public.trigger_match_worker() from public, anon, authenticated;

select cron.schedule('match-worker', '30 seconds', 'select public.trigger_match_worker()');
