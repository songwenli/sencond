import type { ColorValue } from 'react-native';
import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { MessageCircle, PenLine, Sparkles, User } from 'lucide-react-native';
import { palette } from '@/shared/theme/tokens';

// 原型里 Tab 只有图标；文字放在无障碍标签里，读屏可用
export default function TabsLayout() {
  const { t } = useTranslation();
  const icon =
    (Icon: typeof PenLine) =>
    ({ color, focused }: { color: ColorValue; focused: boolean }) => (
      <Icon size={22} color={String(color)} strokeWidth={focused ? 2.2 : 1.7} />
    );

  return (
    <Tabs
      initialRouteName="index"
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarActiveTintColor: palette.accent,
        tabBarInactiveTintColor: palette.text2,
        tabBarStyle: { backgroundColor: palette.tabBar, borderTopColor: palette.border },
      }}
    >
      <Tabs.Screen name="publish" options={{ title: t('tabs.publish'), tabBarAccessibilityLabel: t('tabs.publish'), tabBarIcon: icon(PenLine) }} />
      <Tabs.Screen name="index" options={{ title: t('tabs.recommend'), tabBarAccessibilityLabel: t('tabs.recommend'), tabBarIcon: icon(Sparkles) }} />
      <Tabs.Screen name="messages" options={{ title: t('tabs.messages'), tabBarAccessibilityLabel: t('tabs.messages'), tabBarIcon: icon(MessageCircle) }} />
      <Tabs.Screen name="me" options={{ title: t('tabs.me'), tabBarAccessibilityLabel: t('tabs.me'), tabBarIcon: icon(User) }} />
    </Tabs>
  );
}
