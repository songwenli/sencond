/**
 * 推送：登录后注册设备 token，点击通知时跳到对应页面。
 *
 * - Expo Go 不支持推送，需要用开发版安装包（eas build --profile development）
 * - 网页版没有推送，直接跳过
 * - 安卓推送走 Google FCM，手机需要有 Google Play 服务
 */
import { useEffect } from 'react';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { supabase } from '@/shared/api/supabase';
import i18n from '@/shared/i18n';

let currentToken: string | null = null;

// App 在前台时也弹横幅（聊天页正在看的会话除外，见 setActiveChat）
let activeChatPath: string | null = null;
export function setActiveChat(conversationId: string | null) {
  activeChatPath = conversationId ? `/chat/${conversationId}` : null;
}

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async (n) => {
      const viewingThisChat = activeChatPath && n.request.content.data?.url === activeChatPath;
      return {
        shouldPlaySound: !viewingThisChat,
        shouldSetBadge: false,
        shouldShowBanner: !viewingThisChat,
        shouldShowList: !viewingThisChat,
      };
    },
  });
}

async function setupAndroidChannels() {
  if (Platform.OS !== 'android') return;
  const importance = Notifications.AndroidImportance.HIGH;
  await Notifications.setNotificationChannelAsync('default', { name: i18n.t('push.channelDefault'), importance });
  await Notifications.setNotificationChannelAsync('matches', { name: i18n.t('push.channelMatches'), importance });
  await Notifications.setNotificationChannelAsync('messages', { name: i18n.t('push.channelMessages'), importance });
}

/** 请求权限并拿到 Expo push token；失败（Expo Go、模拟器、拒绝授权）返回 null，不影响使用 */
async function getPushToken(): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  await setupAndroidChannels();

  const existing = await Notifications.getPermissionsAsync();
  let granted = existing.granted;
  if (!granted && existing.canAskAgain) granted = (await Notifications.requestPermissionsAsync()).granted;
  if (!granted) return null;

  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) {
    console.warn('[push] missing EAS projectId — run `npx eas-cli@latest init` in mobile/');
    return null;
  }
  try {
    return (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  } catch (e) {
    console.warn('[push] could not get push token (Expo Go does not support push):', e);
    return null;
  }
}

/** 登录状态下调用：注册 token，并处理点击通知跳转 */
export function usePush(userId: string | null) {
  // 注册 / 换账号时把 token 归到当前账号
  useEffect(() => {
    if (!userId || Platform.OS === 'web') return;
    let cancelled = false;
    getPushToken().then(async (token) => {
      if (!token || cancelled) return;
      currentToken = token;
      const platform = Platform.OS === 'ios' ? 'ios' : 'android';
      const { error } = await supabase.rpc('register_push_token', { p_token: token, p_platform: platform });
      if (error) console.warn('[push] register failed:', error.message);
    });
    return () => { cancelled = true; };
  }, [userId]);

  // 点击通知：冷启动时取最后一次点击，运行中监听点击
  useEffect(() => {
    if (!userId || Platform.OS === 'web') return;
    const open = (n: Notifications.Notification) => {
      const url = n.request.content.data?.url;
      if (typeof url === 'string' && url.startsWith('/')) router.push(url as never);
    };
    const last = Notifications.getLastNotificationResponse();
    if (last?.notification) {
      open(last.notification);
      Notifications.clearLastNotificationResponseAsync();
    }
    const sub = Notifications.addNotificationResponseReceivedListener((r) => open(r.notification));
    return () => sub.remove();
  }, [userId]);
}

/** 退出登录前调用：这台设备不再收到这个账号的推送 */
export async function unregisterPushToken() {
  if (!currentToken) return;
  await supabase.from('push_tokens').delete().eq('token', currentToken);
  currentToken = null;
}
