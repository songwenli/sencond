/**
 * 设计 Token —— 颜色、字号、间距、圆角的唯一来源。
 * 取自 Figma Make 原型（myapp）。页面里不要写死颜色值，一律引用这里。
 * 以后做多主题 / 深色模式，只需新增一套同结构的 palette。
 */

export const palette = {
  // 背景
  bg: '#FDFCF8',          // 主背景（卡片、页面）
  pageBg: '#F0EDE6',      // 分组页面底色（推荐页）
  surface: '#FFFFFF',     // 输入框、对方气泡
  sectionBg: '#F5F2E9',   // 次级块：统计卡、搜索框、质量条
  tabBar: '#FAF8F3',

  // 品牌色（绛紫）
  accent: '#8C4356',
  accentSoft: '#F7EFF1',  // 选中 chip、引用框底色
  accentLine: '#C08A9B',  // 引用框左边线
  onAccent: '#FFFFFF',

  // 文字（由深到浅）
  text1: '#2B2A27',
  text2: '#8A857B',
  text3: '#6E6A62',
  text4: '#A09A8E',

  // 线条
  border: '#E8E2D6',
  borderSoft: '#EDE8E0',
  borderStrong: '#DDD6C8',

  // 语义
  success: '#5A9E6F',     // 「持续比对中」绿点
  tagSeekBg: '#F7EFF1',
  tagSeekFg: '#8C4356',
  tagOfferBg: '#EFF1EC',
  tagOfferFg: '#5E6B4C',
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 } as const;

export const radius = { sm: 8, md: 11, lg: 14, pill: 999 } as const;

export const font = {
  caption: { fontSize: 11.5, lineHeight: 16 },
  small: { fontSize: 12.5, lineHeight: 18 },
  body: { fontSize: 14, lineHeight: 21 },
  bodyLarge: { fontSize: 15.5, lineHeight: 22 },
  title: { fontSize: 17, lineHeight: 24, fontWeight: '600' as const },
  display: { fontSize: 22, lineHeight: 30, fontWeight: '600' as const },
} as const;

/** 头像底色：按用户 ID 稳定取色，不存数据库 */
const avatarColors = ['#7A8C9B', '#8A7B6E', '#A0748C', '#7D8471', '#B8895F'];
export function avatarColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return avatarColors[h % avatarColors.length];
}

export const theme = { palette, space, radius, font } as const;
export type Theme = typeof theme;
