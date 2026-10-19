import 'i18next';
import type { Translation } from './locales/en';

// 让 t('intent.publish') 这类 key 有类型检查和自动补全
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: { translation: Translation };
  }
}
