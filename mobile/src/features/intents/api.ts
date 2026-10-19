/**
 * 意图模块的数据层：页面只调用这里的 hooks，不直接碰 supabase。
 * 这就是「换后端只改一层」的那一层。
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/shared/api/supabase';
import type { Enums, Tables } from '@/shared/api/database.types';

export type Intent = Tables<'intents'>;
export type IntentKind = Enums<'intent_kind'>;

export const intentKeys = {
  all: ['intents'] as const,
  mine: (userId: string) => ['intents', 'mine', userId] as const,
  detail: (id: string) => ['intents', 'detail', id] as const,
};

export function useMyIntents(userId: string) {
  return useQuery({
    queryKey: intentKeys.mine(userId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('intents')
        .select('*')
        .eq('owner_id', userId)
        .in('status', ['active', 'paused'])
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useIntent(id: string) {
  return useQuery({
    queryKey: intentKeys.detail(id),
    queryFn: async () => {
      const { data, error } = await supabase.from('intents').select('*').eq('id', id).single();
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateIntent(userId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { kind: IntentKind; body: string; allowGroup: boolean }) => {
      const { data, error } = await supabase
        .from('intents')
        .insert({ owner_id: userId, kind: input.kind, body: input.body.trim(), allow_group: input.allowGroup })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: intentKeys.mine(userId) }),
  });
}

/** 剩余天数（客户端计算，不存数据库） */
export function daysLeft(intent: Pick<Intent, 'expires_at'>): number {
  return Math.max(0, Math.ceil((new Date(intent.expires_at).getTime() - Date.now()) / 86_400_000));
}
