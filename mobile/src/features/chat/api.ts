/**
 * 会话与消息的数据层。消息走 Supabase Realtime：
 * 收到新消息时让对应查询失效重新拉取（RLS 保证只收到自己会话里的消息）。
 */
import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/shared/api/supabase';
import type { Enums, Tables } from '@/shared/api/database.types';

export type Message = Pick<Tables<'messages'>, 'id' | 'sender_id' | 'body' | 'created_at' | 'deleted_at'>;

export type ConversationSummary = {
  id: string;
  kind: Enums<'conversation_kind'>;
  other: { userId: string; name: string } | null;
  /** 「源自 · 我的哪条意图」 */
  sourceIntent: string | null;
  lastMessage: Message | null;
  unread: boolean;
  lastReadAt: string | null;
};

type Row = {
  conversation_id: string;
  last_read_at: string | null;
  conversation: {
    id: string;
    kind: Enums<'conversation_kind'>;
    last_message_at: string | null;
    members: { user_id: string; profile: { id: string; display_name: string } | null }[];
    match: { participants: { user_id: string; intent: { body: string } | null }[] } | null;
  } | null;
};

const SELECT = `conversation_id, last_read_at,
  conversation:conversations!inner(id, kind, last_message_at,
    members:conversation_members(user_id, profile:profiles(id, display_name)),
    match:matches(participants:match_participants(user_id, intent:intents(body))))`;

export const chatKeys = {
  list: (userId: string) => ['conversations', userId] as const,
  messages: (conversationId: string) => ['messages', conversationId] as const,
};

async function fetchConversations(userId: string, onlyId?: string): Promise<ConversationSummary[]> {
  let q = supabase.from('conversation_members').select(SELECT).eq('user_id', userId);
  if (onlyId) q = q.eq('conversation_id', onlyId);
  const { data, error } = await q;
  if (error) throw error;
  const rows = (data as unknown as Row[]).filter((r) => r.conversation);
  if (rows.length === 0) return [];

  // 每个会话的最后一条消息（一次查询拿回来再分组，会话少时足够快）
  const ids = rows.map((r) => r.conversation_id);
  const { data: msgs, error: mErr } = await supabase
    .from('messages')
    .select('id, conversation_id, sender_id, body, created_at, deleted_at')
    .in('conversation_id', ids)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(500);
  if (mErr) throw mErr;
  const last = new Map<string, Message>();
  for (const m of msgs ?? []) if (!last.has(m.conversation_id)) last.set(m.conversation_id, m);

  return rows
    .map((r): ConversationSummary => {
      const c = r.conversation!;
      const otherMember = c.members.find((m) => m.user_id !== userId);
      const mine = c.match?.participants.find((p) => p.user_id === userId);
      const lm = last.get(c.id) ?? null;
      return {
        id: c.id,
        kind: c.kind,
        other: otherMember?.profile ? { userId: otherMember.user_id, name: otherMember.profile.display_name } : null,
        sourceIntent: mine?.intent?.body ?? null,
        lastMessage: lm,
        unread: !!lm && lm.sender_id !== userId && (!r.last_read_at || r.last_read_at < lm.created_at),
        lastReadAt: r.last_read_at,
      };
    })
    .sort((a, b) => (b.lastMessage?.created_at ?? '').localeCompare(a.lastMessage?.created_at ?? ''));
}

export function useConversations(userId: string) {
  const qc = useQueryClient();
  // 任何新消息都刷新会话列表（RLS 只推送自己会话里的）
  useEffect(() => {
    const ch = supabase
      .channel(`inbox:${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () =>
        qc.invalidateQueries({ queryKey: chatKeys.list(userId) }),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [userId, qc]);

  return useQuery({ queryKey: chatKeys.list(userId), queryFn: () => fetchConversations(userId) });
}

export function useConversation(conversationId: string, userId: string) {
  return useQuery({
    queryKey: ['conversation', conversationId],
    queryFn: async () => (await fetchConversations(userId, conversationId))[0] ?? null,
  });
}

export function useMessages(conversationId: string) {
  const qc = useQueryClient();
  useEffect(() => {
    const ch = supabase
      .channel(`messages:${conversationId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
        () => qc.invalidateQueries({ queryKey: chatKeys.messages(conversationId) }),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [conversationId, qc]);

  return useQuery({
    queryKey: chatKeys.messages(conversationId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('messages')
        .select('id, sender_id, body, created_at, deleted_at')
        .eq('conversation_id', conversationId)
        .is('deleted_at', null)
        .order('created_at', { ascending: true })
        .limit(200);
      if (error) throw error;
      return data as Message[];
    },
  });
}

export function useSendMessage(conversationId: string, userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: string) => {
      const { error } = await supabase
        .from('messages')
        .insert({ conversation_id: conversationId, sender_id: userId, body: body.trim() });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: chatKeys.messages(conversationId) });
      qc.invalidateQueries({ queryKey: chatKeys.list(userId) });
    },
  });
}

export async function markConversationRead(conversationId: string) {
  await supabase.rpc('mark_conversation_read', { p_conversation_id: conversationId });
}

/** 首条消息规则（和数据库里的规则一致，前端用来提前禁用输入框） */
export function isWaitingForReply(messages: Message[], userId: string, kind: Enums<'conversation_kind'>) {
  if (kind !== 'direct') return false;
  const mine = messages.filter((m) => m.sender_id === userId).length;
  const theirs = messages.length - mine;
  return theirs === 0 && mine >= 1;
}
