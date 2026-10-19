import { router } from 'expo-router';
import { useSkipMatch, useStartConversation } from './api';

/** 卡片和详情页共用：打招呼（发起会话后跳到聊天）、看看再说（跳过） */
export function useMatchActions(userId: string) {
  const start = useStartConversation(userId);
  const skip = useSkipMatch(userId);

  return {
    busy: start.isPending || skip.isPending,
    error: start.error ?? skip.error,
    sayHi: (matchId: string) =>
      start.mutate(matchId, {
        onSuccess: (conversationId) => router.push({ pathname: '/chat/[id]', params: { id: conversationId } }),
      }),
    skip: (matchId: string, onDone?: () => void) => skip.mutate(matchId, { onSuccess: onDone }),
  };
}
