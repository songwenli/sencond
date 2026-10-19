import { Pressable, SectionList, StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, EmptyState, Loading, Screen, Text } from '@/shared/ui';
import { palette, space } from '@/shared/theme/tokens';
import { useUserId } from '@/shared/auth/AuthProvider';
import { groupByIntent, useMyMatches } from '@/features/matches/api';
import { MatchCardView } from '@/features/matches/MatchCardView';
import { useMatchActions } from '@/features/matches/useMatchActions';

/** 每个分区最多显示几张卡，其余点「查看全部」进意图详情 */
const PER_SECTION = 3;

export default function RecommendScreen() {
  const { t } = useTranslation();
  const userId = useUserId();
  const matches = useMyMatches(userId);
  const actions = useMatchActions(userId);

  // 切回这个 Tab 时刷新（worker 可能刚产生了新匹配）
  useFocusEffect(useCallback(() => { matches.refetch(); }, [matches.refetch]));

  if (matches.isLoading) return <Loading />;

  const sections = groupByIntent(matches.data ?? []).map((s) => ({
    ...s,
    total: s.cards.length,
    data: s.cards.slice(0, PER_SECTION),
  }));

  if (sections.length === 0) {
    return (
      <Screen background={palette.pageBg}>
        <EmptyState
          title={t('recommend.emptyTitle')}
          body={t('recommend.emptyBody')}
          action={<Button title={t('intent.publish')} onPress={() => router.navigate('/publish')} />}
        />
      </Screen>
    );
  }

  return (
    <Screen background={palette.pageBg}>
      <SectionList
        sections={sections}
        keyExtractor={(c) => c.matchId}
        stickySectionHeadersEnabled={false}
        refreshing={matches.isRefetching}
        onRefresh={() => matches.refetch()}
        renderSectionHeader={({ section }) => (
          <Pressable
            onPress={() => router.push({ pathname: '/intent/[id]', params: { id: section.intentId } })}
            style={styles.sectionHeader}
          >
            <Text variant="small" tone="text3" weight="500" numberOfLines={1} style={{ flex: 1 }}>
              {t('match.respondedTo', { intent: section.intentBody })}
            </Text>
            <Text variant="small" tone="accent" weight="500">{section.total} ›</Text>
          </Pressable>
        )}
        renderItem={({ item }) => (
          <MatchCardView
            card={item}
            busy={actions.busy}
            onSayHi={() => actions.sayHi(item.matchId)}
            onSkip={() => actions.skip(item.matchId)}
          />
        )}
        renderSectionFooter={({ section }) =>
          section.total > PER_SECTION ? (
            <Pressable
              onPress={() => router.push({ pathname: '/intent/[id]', params: { id: section.intentId } })}
              style={styles.viewAll}
            >
              <Text variant="small" tone="accent">{t('match.viewAll', { count: section.total })} ›</Text>
            </Pressable>
          ) : null
        }
        ListFooterComponent={<View style={{ height: space.xl }} />}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.xl,
    paddingTop: space.lg,
    paddingBottom: space.sm,
  },
  viewAll: { alignItems: 'center', paddingVertical: 10 },
});
