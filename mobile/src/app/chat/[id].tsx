import { useEffect, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Send } from 'lucide-react-native';
import { DetailHeader } from '@/shared/ui/DetailHeader';
import { Avatar, Loading, Screen, Text } from '@/shared/ui';
import { palette, radius, space } from '@/shared/theme/tokens';
import { dbErrorCode } from '@/shared/api/supabase';
import { useUserId } from '@/shared/auth/AuthProvider';
import {
  chatKeys,
  isWaitingForReply,
  markConversationRead,
  useConversation,
  useMessages,
  useSendMessage,
} from '@/features/chat/api';

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const userId = useUserId();
  const qc = useQueryClient();
  const convo = useConversation(id, userId);
  const messages = useMessages(id);
  const send = useSendMessage(id, userId);
  const [draft, setDraft] = useState('');
  const listRef = useRef<FlatList>(null);

  // 打开或收到新消息时标记已读，并刷新会话列表的未读点
  const count = messages.data?.length ?? 0;
  useEffect(() => {
    markConversationRead(id).then(() => qc.invalidateQueries({ queryKey: chatKeys.list(userId) }));
  }, [id, count, userId, qc]);

  if (convo.isLoading || messages.isLoading) return <Loading />;

  const c = convo.data;
  const msgs = messages.data ?? [];
  const name = c?.other?.name ?? t('chat.deletedUser');
  const waiting = c ? isWaitingForReply(msgs, userId, c.kind) : false;
  const sendError = send.error ? (dbErrorCode(send.error) === 'FIRST_MESSAGE_LIMIT' ? t('chat.waitingForReply') : t('common.error')) : null;

  const submit = () => {
    const body = draft.trim();
    if (!body || waiting) return;
    send.mutate(body, { onSuccess: () => setDraft('') });
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <DetailHeader>
        <View style={styles.headerRow}>
          <Avatar id={c?.other?.userId ?? id} name={name} size={34} />
          <View style={{ flex: 1 }}>
            <Text weight="600" numberOfLines={1}>{name}</Text>
            {c?.sourceIntent ? (
              <Text variant="caption" tone="text4" numberOfLines={1}>{t('chat.from', { intent: c.sourceIntent })}</Text>
            ) : null}
          </View>
        </View>
      </DetailHeader>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <FlatList
          ref={listRef}
          data={msgs}
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.list}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          ListEmptyComponent={
            <Text variant="small" tone="text4" style={{ textAlign: 'center', marginTop: space.xxl }}>
              {t('chat.firstMessageHint')}
            </Text>
          }
          renderItem={({ item }) => {
            const me = item.sender_id === userId;
            return (
              <View style={{ alignItems: me ? 'flex-end' : 'flex-start' }}>
                <View style={[styles.bubble, me ? styles.mine : styles.theirs]}>
                  <Text tone={me ? 'onAccent' : 'text1'}>{item.body}</Text>
                </View>
              </View>
            );
          }}
        />

        {waiting || sendError ? (
          <Text variant="small" tone={sendError && !waiting ? 'accent' : 'text4'} style={styles.notice}>
            {waiting ? t('chat.waitingForReply') : sendError}
          </Text>
        ) : null}

        <View style={styles.inputBar}>
          <View style={[styles.inputWrap, waiting && { opacity: 0.5 }]}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              editable={!waiting}
              placeholder={t('messages.inputPlaceholder')}
              placeholderTextColor={palette.text4}
              multiline
              maxLength={2000}
              style={styles.input}
            />
          </View>
          <Pressable
            onPress={submit}
            disabled={waiting || !draft.trim() || send.isPending}
            accessibilityRole="button"
            accessibilityLabel={t('chat.send')}
            style={[styles.sendBtn, (waiting || !draft.trim() || send.isPending) && { opacity: 0.4 }]}
          >
            <Send size={16} color={palette.onAccent} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  list: { paddingHorizontal: space.xl, paddingVertical: space.md, gap: 10, flexGrow: 1 },
  bubble: { maxWidth: '78%', paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: 16 },
  mine: { backgroundColor: palette.accent },
  theirs: { backgroundColor: palette.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: palette.border },
  notice: { textAlign: 'center', paddingHorizontal: space.xl, paddingBottom: space.sm },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: space.sm,
    paddingHorizontal: space.xl,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.border,
  },
  inputWrap: { flex: 1, backgroundColor: palette.sectionBg, borderRadius: radius.lg + 6, paddingHorizontal: 14, paddingVertical: 8 },
  input: { fontSize: 14.5, color: palette.text1, maxHeight: 110, padding: 0 },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: palette.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
