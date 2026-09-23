import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './en.json';
import th from './th.json';

export const LANGUAGES = ['th', 'en'] as const;
export type Language = (typeof LANGUAGES)[number];

const STORAGE_KEY = 'mnm.lang';

function readStoredLanguage(): Language | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return LANGUAGES.find((lang) => lang === value) ?? null;
  } catch {
    return null;
  }
}

/** First visit: Thai unless the browser clearly prefers English. */
function detectLanguage(): Language {
  const preferred = navigator.languages.length ? navigator.languages : [navigator.language];
  const first = preferred.find((tag) => /^(th|en)\b/i.test(tag));
  return first?.toLowerCase().startsWith('en') ? 'en' : 'th';
}

export function setLanguage(lang: Language): void {
  void i18n.changeLanguage(lang);
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // Storage may be unavailable (private mode); the choice just won't persist.
  }
}

i18n.on('languageChanged', (lang) => {
  document.documentElement.lang = lang;
});

void i18n.use(initReactI18next).init({
  resources: { th: { translation: th }, en: { translation: en } },
  lng: readStoredLanguage() ?? detectLanguage(),
  fallbackLng: 'th',
  interpolation: { escapeValue: false }, // React already escapes
});

export default i18n;
