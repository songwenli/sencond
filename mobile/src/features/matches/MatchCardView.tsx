import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Avatar, Text } from '@/shared/ui';
import { palette, radius, space } from '@/shared/theme/tokens';
import { activeText } from '@/shared/time';
import type { MatchCard } from './api';

/** 原型里的 PersonCard：头像 + 名字 + 活跃度，对方写的意图，引用框里的匹配理由，两个按钮 */
export function MatchCardView({
  card,
  onSayHi,
  onSkip,
  busy,
}: {
  card: MatchCard;
  onSayHi: () => void;
  onSkip: () => void;
  busy?: boolean;
}) {
  const { t } = useTranslation();
  const contacted = card.myStatus !== 'pending';

  return (
    <Pressable
      onPress={() => router.push({ pathname: '/match/[id]', params: { id: card.matchId } })}
      style={({ pressed }) => [styles.card, pressed && { backgroundColor: palette.sectionBg }]}
    >
      <View style={styles.header}>
        <Avatar id={card.other.userId} name={card.other.name} size={38} />
        <View style={{ flex: 1 }}>
          <View style={styles.nameRow}>
            <Text weight="600" numberOfLines={1} style={{ flexShrink: 1 }}>{card.other.name}</Text>
            {card.isNew ? <NewBadge /> : null}
          </View>
          <Text variant="caption" tone="text4">{activeText(card.other.lastActiveAt)}</Text>
        </View>
      </View>

      <Text style={{ marginTop: space.sm }} numberOfLines={3}>{card.other.intentBody}</Text>

      {card.reason ? <QuoteBox text={card.reason} /> : null}

      <View style={styles.actions}>
        <Pressable
          onPress={onSayHi}
          disabled={busy}
          accessibilityRole="button"
          style={({ pressed }) => [styles.primary, (pressed || busy) && { opacity: 0.8 }]}
        >
          <Text variant="small" weight="500" tone="onAccent">
            {contacted ? t('match.continueChat') : t('match.sayHi')}
          </Text>
        </Pressable>
        {!contacted ? (
          <Pressable onPress={onSkip} disabled={busy} accessibilityRole="button" hitSlop={8}>
            <Text variant="small" tone="text4">{t('match.skip')}</Text>
          </Pressable>
        ) : null}
      </View>
    </Pressable>
  );
}

export function QuoteBox({ text }: { text: string }) {
  return (
    <View style={styles.quote}>
      <Text variant="small" tone="text3">{text}</Text>
    </View>
  );
}

export function NewBadge() {
  const { t } = useTranslation();
  return (
    <View style={styles.badge}>
      <Text style={styles.badgeText}>{t('match.new')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: palette.bg,
    paddingHorizontal: space.xl,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.borderSoft,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  quote: {
    marginTop: space.sm,
    backgroundColor: palette.accentSoft,
    borderLeftWidth: 2,
    borderLeftColor: palette.accentLine,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  actions: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: space.md },
  primary: {
    backgroundColor: palette.accent,
    borderRadius: radius.lg,
    paddingHorizontal: space.xl,
    paddingVertical: 7,
  },
  badge: { backgroundColor: palette.accent, borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1 },
  badgeText: { color: palette.onAccent, fontSize: 9.5, fontWeight: '700', lineHeight: 13 },
});
