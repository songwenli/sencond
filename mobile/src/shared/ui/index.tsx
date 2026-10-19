/**
 * 基础组件：页面只用这些拼装，不直接写颜色和字号。
 * 组件多起来后再拆成单独文件。
 */
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text as RNText,
  View,
  type PressableProps,
  type TextProps as RNTextProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { avatarColor, font, palette, radius, space } from '@/shared/theme/tokens';

// ── Screen ────────────────────────────────────────────────────────────────────
export function Screen({
  children,
  background = palette.bg,
  edges = ['top'],
}: {
  children: ReactNode;
  background?: string;
  edges?: Edge[];
}) {
  return (
    <SafeAreaView edges={edges} style={{ flex: 1, backgroundColor: background }}>
      {children}
    </SafeAreaView>
  );
}

// ── Text ──────────────────────────────────────────────────────────────────────
type Variant = keyof typeof font;
type Tone = 'text1' | 'text2' | 'text3' | 'text4' | 'accent' | 'onAccent';

export function Text({
  variant = 'body',
  tone = 'text1',
  weight,
  style,
  ...rest
}: RNTextProps & { variant?: Variant; tone?: Tone; weight?: '400' | '500' | '600' }) {
  return (
    <RNText
      {...rest}
      style={[font[variant], { color: palette[tone] }, weight ? { fontWeight: weight } : null, style]}
    />
  );
}

// ── Button ────────────────────────────────────────────────────────────────────
export function Button({
  title,
  variant = 'primary',
  loading,
  disabled,
  style,
  ...rest
}: Omit<PressableProps, 'style'> & {
  title: string;
  variant?: 'primary' | 'ghost';
  loading?: boolean;
  style?: ViewStyle;
}) {
  const primary = variant === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        primary ? styles.buttonPrimary : styles.buttonGhost,
        (disabled || loading) && { opacity: 0.5 },
        pressed && { opacity: 0.85 },
        style,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={primary ? palette.onAccent : palette.accent} />
      ) : (
        <Text variant="body" weight="500" tone={primary ? 'onAccent' : 'accent'}>
          {title}
        </Text>
      )}
    </Pressable>
  );
}

// ── Avatar（首字母 + 稳定底色）────────────────────────────────────────────────
export function Avatar({ id, name, size = 38 }: { id: string; name: string; size?: number }) {
  const initials = name.trim().slice(0, 2).toUpperCase();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: avatarColor(id),
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text tone="onAccent" weight="600" style={{ fontSize: size * 0.31, lineHeight: size * 0.4 }}>
        {initials}
      </Text>
    </View>
  );
}

// ── Tag（我想找 / 我能给）─────────────────────────────────────────────────────
export function Tag({ label, kind }: { label: string; kind: 'seek' | 'offer' }) {
  const seek = kind === 'seek';
  return (
    <View
      style={{
        alignSelf: 'flex-start',
        paddingHorizontal: space.sm,
        paddingVertical: 2,
        borderRadius: radius.pill,
        backgroundColor: seek ? palette.tagSeekBg : palette.tagOfferBg,
      }}
    >
      <Text variant="caption" style={{ color: seek ? palette.tagSeekFg : palette.tagOfferFg }}>
        {label}
      </Text>
    </View>
  );
}

// ── 空状态 / 加载 / 错误 ─────────────────────────────────────────────────────
export function EmptyState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <View style={styles.center}>
      <Text variant="bodyLarge" weight="600" style={{ textAlign: 'center' }}>{title}</Text>
      {body ? <Text tone="text3" style={{ textAlign: 'center', marginTop: space.sm }}>{body}</Text> : null}
      {action ? <View style={{ marginTop: space.lg }}>{action}</View> : null}
    </View>
  );
}

export function Loading() {
  return (
    <View style={styles.center}>
      <ActivityIndicator color={palette.accent} />
    </View>
  );
}

export function Divider() {
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: palette.border }} />;
}

const styles = StyleSheet.create({
  button: {
    minHeight: 44,
    paddingHorizontal: space.xl,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPrimary: { backgroundColor: palette.accent },
  buttonGhost: { backgroundColor: 'transparent' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xxl },
});
