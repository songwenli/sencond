import { useEffect } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { DetailHeader } from '@/shared/ui/DetailHeader';
import { Avatar, Button, EmptyState, Loading, Screen, Text } from '@/shared/ui';
import { palette, radius, space } from '@/shared/theme/tokens';
import { activeText } from '@/shared/time';
import { useUserId } from '@/shared/auth/AuthProvider';
import { markMatchSeen, matchKeys, useMatch } from '@/features/matches/api';
import { QuoteBox } from '@/features/matches/MatchCardView';
import { useMatchActions } from '@/features/matches/useMatchActions';

export default function MatchDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const userId = useUserId();
  const qc = useQueryClient();
  const match = useMatch(id, userId);
  const actions = useMatchActions(userId);

  // 打开详情即视为已看过，清掉推荐页上的 NEW
  useEffect(() => {
    markMatchSeen(id).then(() => qc.invalidateQueries({ queryKey: matchKeys.mine(userId) }));
  }, [id, userId, qc]);

  if (match.isLoading) return <Loading />;
  const card = match.data;
  if (!card) {
    return (
      <Screen>
        <DetailHeader />
        <EmptyState title={t('match.notFound')} />
      </Screen>
    );
  }
  const contacted = card.myStatus !== 'pending';

  return (
    <Screen edges={['top', 'bottom']}>
      <DetailHeader>
        <View style={styles.headerRow}>
          <Avatar id={card.other.userId} name={card.other.name} size={40} />
          <View style={{ flex: 1 }}>
            <Text variant="title">{card.other.name}</Text>
            <Text variant="caption" tone="text4">
              {activeText(card.other.lastActiveAt)} · {t(card.strength === 'strong' ? 'match.strong' : 'match.weak')}
            </Text>
          </View>
        </View>
      </DetailHeader>

      <ScrollView contentContainerStyle={styles.body}>
        <Section label={t('match.theirIntent')}>
          <Text variant="bodyLarge">{card.other.intentBody}</Text>
        </Section>

        {card.reason ? (
          <Section label={t('match.why')}>
            <QuoteBox text={card.reason} />
          </Section>
        ) : null}

        <Section label={t('match.yourIntent')}>
          <View style={styles.mine}>
            <Text tone="text3">{card.myIntent.body}</Text>
          </View>
        </Section>

        {card.other.headline || card.other.background ? (
          <Section label={t('match.about')}>
            {card.other.headline ? <Text weight="500">{card.other.headline}</Text> : null}
            {card.other.background ? <Text tone="text3" style={{ marginTop: 4 }}>{card.other.background}</Text> : null}
          </Section>
        ) : null}

        {actions.error ? <Text tone="accent" style={{ marginTop: space.md }}>{t('common.error')}</Text> : null}
      </ScrollView>

      <View style={styles.footer}>
        <Button
          title={contacted ? t('match.continueChat') : t('match.sayHi')}
          loading={actions.busy}
          onPress={() => actions.sayHi(card.matchId)}
          style={{ flex: 1 }}
        />
        {!contacted ? (
          <Button
            variant="ghost"
            title={t('match.skip')}
            disabled={actions.busy}
            onPress={() => actions.skip(card.matchId, () => router.back())}
          />
        ) : null}
      </View>
    </Screen>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: space.xl }}>
      <Text variant="caption" tone="text4" weight="500" style={{ marginBottom: 6 }}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  body: { paddingHorizontal: space.xl, paddingBottom: space.xxl },
  mine: { backgroundColor: palette.sectionBg, borderRadius: radius.md, padding: space.md },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.xl,
    paddingVertical: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.border,
  },
});
