import 'expo-sqlite/localStorage/install';
import { AppState } from 'react-native';
import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
  throw new Error('Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY. Copy .env.example to .env.local.');
}

/**
 * 全 app 唯一的 Supabase 客户端。
 * 页面里不要直接 import 它——统一走 src/features/<模块>/api.ts，
 * 以后换实现（自托管、国内版）只改 api 层。
 */
export const supabase = createClient<Database>(url, key, {
  auth: {
    storage: localStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// App 在前台时才刷新 token，省电也避免后台无效请求
AppState.addEventListener('change', (state) => {
  if (state === 'active') supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});

/** 数据库 RPC 抛出的业务错误码（见迁移文件里的 raise exception） */
export type DbErrorCode =
  | 'FIRST_MESSAGE_LIMIT'
  | 'MATCH_NOT_FOUND'
  | 'MATCH_NOT_ACTIONABLE'
  | 'BLOCKED'
  | 'FEATURE_DISABLED'
  | 'GROUP_FULL'
  | 'GROUP_CLOSED';

export function dbErrorCode(error: unknown): DbErrorCode | null {
  const message = (error as { message?: string } | null)?.message ?? '';
  const codes: DbErrorCode[] = [
    'FIRST_MESSAGE_LIMIT', 'MATCH_NOT_FOUND', 'MATCH_NOT_ACTIONABLE',
    'BLOCKED', 'FEATURE_DISABLED', 'GROUP_FULL', 'GROUP_CLOSED',
  ];
  return codes.find((c) => message.includes(c)) ?? null;
}
