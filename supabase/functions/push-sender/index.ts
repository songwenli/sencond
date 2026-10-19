// 推送发送器：领取发件箱里的通知，按收件人语言生成文案，调用 Expo Push API。
// 由数据库在有新通知时立即唤醒（pg_net），另有每分钟一次的定时任务兜底。
// 鉴权和匹配 worker 一样：x-worker-secret 头，密钥只存在 Vault。
//
// 可选环境变量 EXPO_ACCESS_TOKEN：在 expo.dev 开启「推送安全」后需要。
import { createClient } from 'npm:@supabase/supabase-js@2';
import { buildMessages, chunk, type ExpoMessage, type PendingNotification } from './messages.ts';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

function env(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`missing env ${name}`);
  return v;
}

type Ticket = { status: 'ok' | 'error'; message?: string; details?: { error?: string } };

Deno.serve(async (req) => {
  const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });

  const provided = req.headers.get('x-worker-secret') ?? '';
  const { data: ok } = await db.rpc('verify_match_worker_secret', { p_secret: provided });
  if (!provided || ok !== true) return new Response('unauthorized', { status: 401 });

  const { data, error } = await db.rpc('claim_notifications', { p_limit: 100 });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  const pending = (data ?? []) as PendingNotification[];

  // 每条通知生成若干消息（一个用户可能有多台设备）
  const outgoing: { n: PendingNotification; msg: ExpoMessage }[] = [];
  const done: number[] = [];
  for (const n of pending) {
    const msgs = buildMessages(n);
    if (!msgs || msgs.length === 0) done.push(n.id); // 内容没了 / 用户没装推送：直接算完成
    else for (const msg of msgs) outgoing.push({ n, msg });
  }

  const failed = new Map<number, string>();
  const deadTokens: string[] = [];
  const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' };
  const expoToken = Deno.env.get('EXPO_ACCESS_TOKEN');
  if (expoToken) headers.Authorization = `Bearer ${expoToken}`;

  for (const batch of chunk(outgoing)) {
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify(batch.map((b) => b.msg)),
        signal: AbortSignal.timeout(20_000),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(`expo ${res.status}: ${JSON.stringify(body).slice(0, 300)}`);
      const tickets: Ticket[] = body.data ?? [];
      tickets.forEach((t, i) => {
        const { n, msg } = batch[i];
        if (t.status === 'ok') return;
        // 卸载了 app 或 token 失效：删掉这个 token，这条不算失败
        if (t.details?.error === 'DeviceNotRegistered') deadTokens.push(msg.to);
        else failed.set(n.id, t.message ?? t.details?.error ?? 'unknown');
      });
    } catch (e) {
      for (const { n } of batch) failed.set(n.id, e instanceof Error ? e.message : String(e));
    }
  }

  if (deadTokens.length) await db.from('push_tokens').delete().in('token', deadTokens);

  const ids = new Set([...done, ...outgoing.map((o) => o.n.id)]);
  await Promise.all(
    [...ids].map((id) => db.rpc('finish_notification', { p_id: id, p_error: failed.get(id) ?? null })),
  );

  const summary = { claimed: pending.length, sent: outgoing.length, failed: failed.size, pruned: deadTokens.length };
  console.log(JSON.stringify(summary));
  return Response.json(summary);
});
