import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Avatar, EmptyState, Loading, Screen, Text } from '@/shared/ui';
import { palette, space } from '@/shared/theme/tokens';
import { chatTime } from '@/shared/time';
import { useUserId } from '@/shared/auth/AuthProvider';
import { useConversations } from '@/features/chat/api';

export default function MessagesScreen() {
  const { t } = useTranslation();
  const userId = useUserId();
  const list = useConversations(userId);

  if (list.isLoading) return <Loading />;

  return (
    <Screen>
      <FlatList
        data={list.data ?? []}
        keyExtractor={(c) => c.id}
        refreshing={list.isRefetching}
        onRefresh={() => list.refetch()}
        contentContainerStyle={{ flexGrow: 1 }}
        ListEmptyComponent={<EmptyState title={t('messages.empty')} />}
        renderItem={({ item }) => {
          const name = item.other?.name ?? t('chat.deletedUser');
          const lm = item.lastMessage;
          const preview = lm ? (lm.sender_id === userId ? t('chat.you') + lm.body : lm.body) : t('chat.noMessages');
          return (
            <Pressable
              onPress={() => router.push({ pathname: '/chat/[id]', params: { id: item.id } })}
              style={({ pressed }) => [styles.row, pressed && { backgroundColor: palette.sectionBg }]}
            >
              <Avatar id={item.other?.userId ?? item.id} name={name} size={42} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={styles.line}>
                  <Text weight="500" numberOfLines={1} style={{ flex: 1 }}>{name}</Text>
                  {lm ? <Text variant="caption" tone="text2">{chatTime(lm.created_at)}</Text> : null}
                </View>
                <View style={styles.line}>
                  <Text
                    variant="small"
                    tone={item.unread ? 'text1' : 'text3'}
                    weight={item.unread ? '500' : '400'}
                    numberOfLines={1}
                    style={{ flex: 1 }}
                  >
                    {preview}
                  </Text>
                  {item.unread ? <View style={styles.dot} /> : null}
                </View>
                {item.sourceIntent ? (
                  <Text variant="caption" tone="text4" numberOfLines={1} style={{ marginTop: 4 }}>
                    {t('chat.from', { intent: item.sourceIntent })}
                  </Text>
                ) : null}
              </View>
            </Pressable>
          );
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 11,
    paddingHorizontal: space.xl,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.border,
  },
  line: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: 2 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: palette.accent },
});
