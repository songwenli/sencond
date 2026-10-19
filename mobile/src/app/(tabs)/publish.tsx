import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Button, Screen, Text } from '@/shared/ui';
import { palette, radius, space } from '@/shared/theme/tokens';
import { useUserId } from '@/shared/auth/AuthProvider';
import { useCreateIntent, type IntentKind } from '@/features/intents/api';

export default function PublishScreen() {
  const { t } = useTranslation();
  const userId = useUserId();
  const create = useCreateIntent(userId);

  const starters = t('intent.starters', { returnObjects: true }) as string[];
  const [kind, setKind] = useState<IntentKind>('seek');
  const [body, setBody] = useState('');
  const [allowGroup, setAllowGroup] = useState(false);
  const [done, setDone] = useState(false);

  const tooShort = body.trim().length < 5;

  const submit = () =>
    create.mutate(
      { kind, body, allowGroup },
      { onSuccess: () => { setBody(''); setDone(true); } },
    );

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        {/* 我想找 / 我能给 */}
        <View style={styles.row}>
          {(['seek', 'offer'] as const).map((k) => (
            <Chip key={k} label={t(`intent.kind_${k}`)} active={kind === k} onPress={() => setKind(k)} />
          ))}
        </View>

        {/* 开头提示 */}
        <View style={[styles.row, { flexWrap: 'wrap', marginTop: space.md }]}>
          {starters.map((s) => (
            <Chip key={s} label={s} active={false} onPress={() => { setBody(s.replace('…', '')); setDone(false); }} />
          ))}
        </View>

        <View style={styles.inputBox}>
          <TextInput
            value={body}
            onChangeText={(v) => { setBody(v); setDone(false); }}
            placeholder={t('intent.placeholder')}
            placeholderTextColor={palette.text4}
            multiline
            maxLength={1000}
            style={styles.input}
          />
        </View>

        <View style={[styles.row, { justifyContent: 'space-between', marginTop: space.md }]}>
          <Text tone="text3">{t('intent.groupMode')}</Text>
          <Switch
            value={allowGroup}
            onValueChange={setAllowGroup}
            trackColor={{ true: palette.accent, false: palette.borderStrong }}
          />
        </View>

        <Button
          title={t('intent.publish')}
          disabled={tooShort}
          loading={create.isPending}
          onPress={submit}
          style={{ marginTop: space.xl }}
        />

        {done ? <Text tone="text3" style={styles.note}>{t('intent.published')}</Text> : null}
        {create.error ? <Text tone="accent" style={styles.note}>{t('common.error')}</Text> : null}
      </ScrollView>
    </Screen>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={[styles.chip, active && styles.chipActive]}
    >
      <Text variant="small" tone={active ? 'accent' : 'text3'}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { padding: space.xl },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  chip: {
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.borderStrong,
  },
  chipActive: { borderWidth: 1, borderColor: palette.accent, backgroundColor: palette.accentSoft },
  inputBox: {
    marginTop: space.lg,
    minHeight: 140,
    borderWidth: 1,
    borderColor: palette.borderStrong,
    borderRadius: radius.md,
    backgroundColor: palette.surface,
    padding: space.md,
  },
  input: { flex: 1, fontSize: 15, lineHeight: 23, color: palette.text1, textAlignVertical: 'top' },
  note: { marginTop: space.md, textAlign: 'center' },
});
