import { FlatList, StyleSheet, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { DetailHeader } from '@/shared/ui/DetailHeader';
import { EmptyState, Loading, Screen, Text } from '@/shared/ui';
import { palette, space } from '@/shared/theme/tokens';
import { useUserId } from '@/shared/auth/AuthProvider';
import { pickI18n } from '@/shared/time';
import { daysLeft, useIntent } from '@/features/intents/api';
import { useMyMatches } from '@/features/matches/api';
import { MatchCardView } from '@/features/matches/MatchCardView';
import { useMatchActions } from '@/features/matches/useMatchActions';

/** 意图详情：这条意图收到的全部匹配 */
export default function IntentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const userId = useUserId();
  const intent = useIntent(id);
  const matches = useMyMatches(userId);
  const actions = useMatchActions(userId);

  if (intent.isLoading || matches.isLoading) return <Loading />;
  if (!intent.data) return <Screen><DetailHeader /><EmptyState title={t('common.error')} /></Screen>;

  const cards = (matches.data ?? []).filter((c) => c.myIntent.id === id);

  return (
    <Screen>
      <DetailHeader>
        <Text variant="caption" tone="text4">
          {t('intent.yourIntent')} · {t('intent.daysLeft', { count: daysLeft(intent.data) })}
          {intent.data.moderation === 'pending' ? ` · ${t('intent.status_pending')}` : ''}
        </Text>
        <Text variant="bodyLarge" weight="500" style={{ marginTop: 4 }}>{intent.data.body}</Text>
      </DetailHeader>

      <FlatList
        data={cards}
        keyExtractor={(c) => c.matchId}
        refreshing={matches.isRefetching}
        onRefresh={() => matches.refetch()}
        ListHeaderComponent={
          intent.data.quality_hint ? (
            <View style={styles.hint}>
              <Text variant="small" tone="text3">💡 {pickI18n(intent.data.quality_hint)}</Text>
            </View>
          ) : null
        }
        ListEmptyComponent={<EmptyState title={t('recommend.emptyTitle')} body={t('recommend.emptyBody')} />}
        renderItem={({ item }) => (
          <MatchCardView
            card={item}
            busy={actions.busy}
            onSayHi={() => actions.sayHi(item.matchId)}
            onSkip={() => actions.skip(item.matchId)}
          />
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  hint: {
    margin: space.lg,
    padding: space.md,
    borderRadius: 10,
    backgroundColor: palette.sectionBg,
  },
});
