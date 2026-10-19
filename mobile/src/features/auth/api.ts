import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/shared/api/supabase';
import i18n from '@/shared/i18n';
import { unregisterPushToken } from '@/shared/push/usePush';

/**
 * 开发阶段先用「邮箱 + 6 位验证码」登录，Supabase 开箱即用。
 * 上架前再补 Sign in with Apple / Google（iOS 审核要求两者同时提供）。
 */
export function useSendEmailCode() {
  return useMutation({
    mutationFn: async (email: string) => {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        // 新用户注册时把界面语言带过去，数据库触发器会写进 profiles.locale
        options: { shouldCreateUser: true, data: { locale: i18n.language } },
      });
      if (error) throw error;
    },
  });
}

export function useVerifyEmailCode() {
  return useMutation({
    mutationFn: async ({ email, code }: { email: string; code: string }) => {
      const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' });
      if (error) throw error;
    },
  });
}

/**
 * 开发用：匿名登录，跳过邮箱验证直接进 app。
 * 需要在 Supabase 后台开启 Authentication → Sign In / Providers → Allow anonymous sign-ins。
 * 只在 __DEV__ 下显示入口，正式包里看不到；上线前记得在后台关掉这个开关。
 */
export function useSkipSignIn() {
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.auth.signInAnonymously({
        // 每个测试账号一个不同的名字，方便区分（Tester 4821）
        options: { data: { name: `Tester ${Math.floor(1000 + Math.random() * 9000)}`, locale: i18n.language } },
      });
      if (error) throw error;
    },
  });
}

export async function signOut() {
  await unregisterPushToken(); // 退出后这台设备不再收到这个账号的推送
  await supabase.auth.signOut();
}
