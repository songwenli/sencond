// 把发件箱里的一条通知变成一条（或多条，按设备）Expo 推送消息。
// 纯函数，不访问网络和数据库，方便单测。

export type PendingNotification = {
  id: number;
  kind: 'new_match' | 'new_message';
  user_id: string;
  locale: string | null;
  tokens: string[];
  match_id: string | null;
  match_reason: Record<string, string> | null;
  other_intent: string | null;
  conversation_id: string | null;
  sender_name: string | null;
  message_body: string | null;
};

export type ExpoMessage = {
  to: string;
  title: string;
  body: string;
  data: { url: string; notificationId: number };
  sound: 'default';
  channelId: string;
  priority: 'high';
};

type Lang = 'zh-Hans' | 'en';
const lang = (locale: string | null): Lang => (locale?.startsWith('zh') ? 'zh-Hans' : 'en');

const TEXT = {
  newMatchTitle: { 'zh-Hans': '有人和你同频', en: 'New match' },
  newMatchFallback: { 'zh-Hans': '打开看看 TA 写了什么', en: 'Open to see what they wrote' },
  deletedUser: { 'zh-Hans': '已注销用户', en: 'Deleted user' },
} as const;

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

/** 返回 null 表示这条通知已经没有可发的内容（匹配或消息被删了），直接标记完成即可 */
export function buildMessages(n: PendingNotification): ExpoMessage[] | null {
  const l = lang(n.locale);
  const base = { sound: 'default' as const, priority: 'high' as const };

  if (n.kind === 'new_match') {
    if (!n.match_id) return null;
    const reason = n.match_reason?.[l] || n.match_reason?.en || '';
    const body = reason || (n.other_intent ? clip(n.other_intent, 80) : TEXT.newMatchFallback[l]);
    return n.tokens.map((to) => ({
      ...base,
      to,
      title: TEXT.newMatchTitle[l],
      body: clip(body, 120),
      channelId: 'matches',
      data: { url: `/match/${n.match_id}`, notificationId: n.id },
    }));
  }

  if (!n.conversation_id || !n.message_body) return null;
  return n.tokens.map((to) => ({
    ...base,
    to,
    title: n.sender_name || TEXT.deletedUser[l],
    body: clip(n.message_body!, 120),
    channelId: 'messages',
    data: { url: `/chat/${n.conversation_id}`, notificationId: n.id },
  }));
}

/** Expo Push API 每次最多 100 条 */
export function chunk<T>(items: T[], size = 100): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
