import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/shared/api/supabase';

type AuthState = {
  session: Session | null;
  userId: string | null;
  /** 首次读取本地 session 完成前为 true，用来避免登录页闪一下 */
  isLoading: boolean;
};

const AuthContext = createContext<AuthState>({ session: null, userId: null, isLoading: true });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => sub.subscription.unsubscribe();
  }, []);

  // 登录后更新「最后活跃时间」，别人看到的「今天活跃」靠它算
  const uid = session?.user.id;
  useEffect(() => {
    if (!uid) return;
    supabase.from('profiles').update({ last_active_at: new Date().toISOString() }).eq('id', uid).then(() => {});
  }, [uid]);

  return (
    <AuthContext.Provider value={{ session, userId: session?.user.id ?? null, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

/** 只在登录后的页面里用：拿到一定存在的 userId */
export function useUserId(): string {
  const { userId } = useAuth();
  if (!userId) throw new Error('useUserId() called outside a signed-in screen');
  return userId;
}
