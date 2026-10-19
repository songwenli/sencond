import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Avatar, Button, Divider, EmptyState, Loading, Screen, Tag, Text } from '@/shared/ui';
import { palette, radius, space } from '@/shared/theme/tokens';
import { useUserId } from '@/shared/auth/AuthProvider';
import { useProfile } from '@/features/profile/api';
import { daysLeft, useMyIntents } from '@/features/intents/api';
import { signOut } from '@/features/auth/api';

export default function MeScreen() {
  const { t } = useTranslation();
  const userId = useUserId();
  const profile = useProfile(userId);
  const intents = useMyIntents(userId);

  if (profile.isLoading || intents.isLoading) return <Loading />;

  return (
    <Screen>
      <FlatList
        data={intents.data ?? []}
        keyExtractor={(i) => i.id}
        refreshing={intents.isRefetching}
        onRefresh={() => intents.refetch()}
        ListHeaderComponent={
          <View style={styles.header}>
            <Avatar id={userId} name={profile.data?.display_name ?? '?'} size={48} />
            <View style={{ flex: 1 }}>
              <Text variant="title">{profile.data?.display_name}</Text>
              {profile.data?.headline ? <Text variant="small" tone="text2">{profile.data.headline}</Text> : null}
            </View>
            <Button variant="ghost" title={t('auth.signOut')} onPress={signOut} />
          </View>
        }
        ItemSeparatorComponent={Divider}
        ListEmptyComponent={<EmptyState title={t('intent.empty')} />}
        renderItem={({ item }) => (
          <Pressable onPress={() => router.push({ pathname: '/intent/[id]', params: { id: item.id } })} style={styles.item}>
            <View style={styles.tagRow}>
              <Tag kind={item.kind} label={t(`intent.kind_${item.kind}`)} />
              <Text variant="caption" tone="text4">{t('intent.daysLeft', { count: daysLeft(item) })}</Text>
              {item.moderation === 'pending' ? (
                <Text variant="caption" tone="text4">· {t('intent.status_pending')}</Text>
              ) : null}
            </View>
            <Text>{item.body}</Text>
          </Pressable>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.xl,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.border,
  },
  item: { paddingHorizontal: space.xl, paddingVertical: 13, borderRadius: radius.sm },
  tagRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 6 },
});
