-- =============================================================================
-- 唤醒 push-sender：有新通知入箱就立即调用一次（聊天消息不用等定时任务），
-- 另有每分钟一次的定时任务兜底（上一次调用失败、或发送失败等待重试时）。
-- 复用匹配 worker 的 Vault 密钥（project_url / match_worker_secret）。
-- pg_net 的请求在事务提交后才真正发出，所以不会拖慢发消息本身。
-- =============================================================================

create or replace function public.kick_push_sender()
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_url text;
  v_secret text;
begin
  if not exists (select 1 from public.notifications
                 where status = 'queued'
                    or (status = 'sending' and locked_at < now() - interval '5 minutes')) then
    return;
  end if;
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'match_worker_secret';
  if v_url is null or v_secret is null then return; end if;

  perform net.http_post(
    url := v_url || '/functions/v1/push-sender',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-worker-secret', v_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
end $$;

create or replace function public.kick_push_sender_trigger()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.kick_push_sender();
  return null;
end $$;

-- 语句级触发：一次插入多条通知（比如一个匹配的两个参与者）只唤醒一次
create trigger notifications_kick_sender after insert on public.notifications
  for each statement execute function public.kick_push_sender_trigger();

revoke execute on function public.kick_push_sender()         from public, anon, authenticated;
revoke execute on function public.kick_push_sender_trigger() from public, anon, authenticated;

select cron.schedule('push-sender', '* * * * *', 'select public.kick_push_sender()');
