import '@/shared/i18n';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from '@/shared/auth/AuthProvider';
import { Loading } from '@/shared/ui';
import { palette } from '@/shared/theme/tokens';
import { usePush } from '@/shared/push/usePush';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <StatusBar style="dark" />
        <RootNavigator />
      </AuthProvider>
    </QueryClientProvider>
  );
}

function RootNavigator() {
  const { session, isLoading, userId } = useAuth();
  // 登录后注册推送 token、处理点击通知跳转（Expo Go 和网页版里会自动跳过）
  usePush(isLoading ? null : userId);
  if (isLoading) return <Loading />;

  const signedIn = !!session;
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: palette.bg },
      }}
    >
      {/* 未登录只能看到登录页；登录后自动跳到 Tab 页 */}
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="sign-in" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="intent/[id]" />
        <Stack.Screen name="match/[id]" />
        <Stack.Screen name="chat/[id]" />
      </Stack.Protected>
    </Stack>
  );
}
