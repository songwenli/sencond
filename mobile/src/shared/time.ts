import i18n from '@/shared/i18n';

const DAY = 86_400_000;

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** 距今天数（按自然日算，昨天 23:59 也算 1 天前） */
export function daysAgo(iso: string): number {
  return Math.round((startOfDay(new Date()) - startOfDay(new Date(iso))) / DAY);
}

/** 「今天活跃」「昨天活跃」「3 天前活跃」 */
export function activeText(iso: string): string {
  const d = daysAgo(iso);
  if (d <= 0) return i18n.t('time.activeToday');
  if (d === 1) return i18n.t('time.activeYesterday');
  return i18n.t('time.activeDaysAgo', { count: d });
}

/** 会话列表的时间：今天显示时刻，昨天显示「昨天」，一周内显示星期，再早显示日期 */
export function chatTime(iso: string): string {
  const date = new Date(iso);
  const d = daysAgo(iso);
  const locale = i18n.language;
  if (d <= 0) return date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: false });
  if (d === 1) return i18n.t('time.yesterday');
  if (d < 7) return date.toLocaleDateString(locale, { weekday: 'short' });
  return date.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
}

/** 从多语言 JSON 里取当前语言，没有就退回英文 / 任意一个 */
export function pickI18n(value: unknown): string {
  if (!value || typeof value !== 'object') return '';
  const v = value as Record<string, string>;
  return v[i18n.language] || v.en || Object.values(v).find(Boolean) || '';
}
