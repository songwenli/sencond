/**
 * 匹配模块的数据层。一条匹配 = 一组参与者，这里统一转换成「我视角」的卡片数据：
 * 我的哪条意图、对方是谁、对方写了什么、为什么匹配。
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/shared/api/supabase';
import type { Enums, Json } from '@/shared/api/database.types';
import { pickI18n } from '@/shared/time';

export type MatchCard = {
  matchId: string;
  kind: Enums<'match_kind'>;
  strength: Enums<'match_strength'>;
  reason: string;
  createdAt: string;
  myStatus: Enums<'participant_status'>;
  isNew: boolean;
  myIntent: { id: string; body: string };
  other: {
    userId: string;
    name: string;
    headline: string | null;
    background: string | null;
    lastActiveAt: string;
    intentBody: string;
    intentKind: Enums<'intent_kind'>;
  };
};

/** 按「我的意图」分组，推荐页每组一个分区 */
export type MatchSection = { intentId: string; intentBody: string; cards: MatchCard[] };

type ProfileRow = { id: string; display_name: string; headline: string | null; background: string | null; last_active_at: string };
type IntentRow = { id: string; body: string; kind: Enums<'intent_kind'> };
type ParticipantRow = { user_id: string; intent_id: string; status: Enums<'participant_status'>; intent: IntentRow | null; profile: ProfileRow | null };
type Row = {
  status: Enums<'participant_status'>;
  seen_at: string | null;
  intent_id: string;
  my_intent: { id: string; body: string } | null;
  match: { id: string; kind: Enums<'match_kind'>; strength: Enums<'match_strength'>; reason_i18n: Json; created_at: string; participants: ParticipantRow[] } | null;
};

const SELECT = `status, seen_at, intent_id,
  my_intent:intents(id, body),
  match:matches!inner(id, kind, strength, reason_i18n, created_at,
    participants:match_participants(user_id, intent_id, status,
      intent:intents(id, body, kind),
      profile:profiles(id, display_name, headline, background, last_active_at)))`;

function toCard(row: Row, userId: string): MatchCard | null {
  const m = row.match;
  const other = m?.participants.find((p) => p.user_id !== userId);
  if (!m || !row.my_intent || !other?.intent || !other.profile) return null; // 对方注销 / 意图删了
  return {
    matchId: m.id,
    kind: m.kind,
    strength: m.strength,
    reason: pickI18n(m.reason_i18n),
    createdAt: m.created_at,
    myStatus: row.status,
    isNew: !row.seen_at,
    myIntent: row.my_intent,
    other: {
      userId: other.user_id,
      name: other.profile.display_name,
      headline: other.profile.headline,
      background: other.profile.background,
      lastActiveAt: other.profile.last_active_at,
      intentBody: other.intent.body,
      intentKind: other.intent.kind,
    },
  };
}

export const matchKeys = {
  all: ['matches'] as const,
  mine: (userId: string) => ['matches', 'mine', userId] as const,
  detail: (matchId: string) => ['matches', 'detail', matchId] as const,
};

/** 我的所有待处理 / 已联系的匹配（跳过的不显示） */
export function useMyMatches(userId: string) {
  return useQuery({
    queryKey: matchKeys.mine(userId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('match_participants')
        .select(SELECT)
        .eq('user_id', userId)
        .in('status', ['pending', 'contacted', 'joined'])
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data as unknown as Row[]).map((r) => toCard(r, userId)).filter((c): c is MatchCard => !!c);
    },
  });
}

export function groupByIntent(cards: MatchCard[]): MatchSection[] {
  const map = new Map<string, MatchSection>();
  for (const c of cards) {
    const s = map.get(c.myIntent.id) ?? { intentId: c.myIntent.id, intentBody: c.myIntent.body, cards: [] };
    s.cards.push(c);
    map.set(c.myIntent.id, s);
  }
  // 未处理的排在前面，强匹配排在前面
  for (const s of map.values()) {
    s.cards.sort((a, b) => Number(b.myStatus === 'pending') - Number(a.myStatus === 'pending')
      || Number(b.strength === 'strong') - Number(a.strength === 'strong'));
  }
  return [...map.values()];
}

export function useMatch(matchId: string, userId: string) {
  return useQuery({
    queryKey: matchKeys.detail(matchId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('match_participants')
        .select(SELECT)
        .eq('user_id', userId)
        .eq('match_id', matchId)
        .maybeSingle();
      if (error) throw error;
      return data ? toCard(data as unknown as Row, userId) : null;
    },
  });
}

/** 打开详情时清掉 NEW 标记 */
export async function markMatchSeen(matchId: string) {
  await supabase.rpc('mark_match_seen', { p_match_id: matchId });
}

/** 发起会话（已存在就直接返回），返回会话 ID */
export function useStartConversation(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (matchId: string) => {
      const { data, error } = await supabase.rpc('start_conversation', { p_match_id: matchId });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: matchKeys.mine(userId) });
      qc.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
}

export function useSkipMatch(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (matchId: string) => {
      const { error } = await supabase.rpc('skip_match', { p_match_id: matchId });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: matchKeys.mine(userId) }),
  });
}
