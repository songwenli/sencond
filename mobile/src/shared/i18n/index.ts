import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';
import en from './locales/en';
import zhHans from './locales/zh-Hans';

export const resources = {
  en: { translation: en },
  'zh-Hans': { translation: zhHans },
} as const;

export type AppLanguage = keyof typeof resources;

/** 把系统语言映射到我们支持的语言；不支持的一律回退英文 */
export function detectLanguage(): AppLanguage {
  const [primary] = getLocales();
  if (primary?.languageCode === 'zh') {
    // 繁体（zh-Hant / 台港澳）暂时也用简体，等繁体文案准备好再加 'zh-Hant'
    return 'zh-Hans';
  }
  return 'en';
}

i18n.use(initReactI18next).init({
  resources,
  lng: detectLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false }, // React 已防注入
  returnObjects: true,
});

export default i18n;
