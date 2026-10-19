import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Button, Screen, Text } from '@/shared/ui';
import { palette, radius, space } from '@/shared/theme/tokens';
import { useSendEmailCode, useSkipSignIn, useVerifyEmailCode } from '@/features/auth/api';

export default function SignInScreen() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const send = useSendEmailCode();
  const verify = useVerifyEmailCode();
  const skip = useSkipSignIn();
  const error = send.error ?? verify.error ?? skip.error;

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.container}>
        <Text variant="display">{t('auth.title')}</Text>
        <Text tone="text3" style={{ marginTop: space.sm }}>
          {step === 'email' ? t('auth.subtitle') : t('auth.codeSent', { email })}
        </Text>

        {step === 'email' ? (
          <>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder={t('auth.emailPlaceholder')}
              placeholderTextColor={palette.text4}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              style={styles.input}
            />
            <Button
              title={t('auth.sendCode')}
              loading={send.isPending}
              disabled={!email.includes('@')}
              onPress={() => send.mutate(email, { onSuccess: () => setStep('code') })}
            />
          </>
        ) : (
          <>
            <TextInput
              value={code}
              onChangeText={setCode}
              placeholder={t('auth.codePlaceholder')}
              placeholderTextColor={palette.text4}
              keyboardType="number-pad"
              autoComplete="one-time-code"
              maxLength={6}
              style={styles.input}
            />
            <Button
              title={t('auth.verify')}
              loading={verify.isPending}
              disabled={code.length < 6}
              onPress={() => verify.mutate({ email, code })}
            />
            <Button
              variant="ghost"
              title={t('auth.changeEmail')}
              onPress={() => { setStep('email'); setCode(''); }}
              style={{ marginTop: space.sm }}
            />
          </>
        )}

        {error ? (
          <Text variant="small" tone="accent" style={{ marginTop: space.md }}>
            {error.message || t('common.error')}
          </Text>
        ) : null}
        {/* 登录成功后，_layout 里的 Stack.Protected 会自动切到 Tab 页 */}
        <View style={{ flex: 1 }} />

        {/* 开发专用：匿名登录直接进入。正式包（__DEV__ = false）不显示 */}
        {__DEV__ ? (
          <Button
            variant="ghost"
            title={t('auth.skip')}
            loading={skip.isPending}
            onPress={() => skip.mutate()}
          />
        ) : null}
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: space.xl, paddingTop: space.xxl * 2 },
  input: {
    marginTop: space.xl,
    marginBottom: space.md,
    borderWidth: 1,
    borderColor: palette.borderStrong,
    borderRadius: radius.md,
    backgroundColor: palette.surface,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    fontSize: 16,
    color: palette.text1,
  },
});
