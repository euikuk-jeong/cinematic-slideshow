import * as Localization from 'expo-localization';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';

import commonEn from './locales/en/common.json';
import albumListEn from './locales/en/albumList.json';
import albumSettingsEn from './locales/en/albumSettings.json';
import appInfoEn from './locales/en/appInfo.json';
import appSettingsEn from './locales/en/appSettings.json';
import hiddenAlbumsEn from './locales/en/hiddenAlbums.json';
import invalidAlbumsEn from './locales/en/invalidAlbums.json';
import musicPickerEn from './locales/en/musicPicker.json';
import photoSelectionEn from './locales/en/photoSelection.json';
import slideshowDefaultsEn from './locales/en/slideshowDefaults.json';
import slideshowPlayerEn from './locales/en/slideshowPlayer.json';
import permissionsEn from './locales/en/permissions.json';

import commonKo from './locales/ko/common.json';
import albumListKo from './locales/ko/albumList.json';
import albumSettingsKo from './locales/ko/albumSettings.json';
import appInfoKo from './locales/ko/appInfo.json';
import appSettingsKo from './locales/ko/appSettings.json';
import hiddenAlbumsKo from './locales/ko/hiddenAlbums.json';
import invalidAlbumsKo from './locales/ko/invalidAlbums.json';
import musicPickerKo from './locales/ko/musicPicker.json';
import photoSelectionKo from './locales/ko/photoSelection.json';
import slideshowDefaultsKo from './locales/ko/slideshowDefaults.json';
import slideshowPlayerKo from './locales/ko/slideshowPlayer.json';
import permissionsKo from './locales/ko/permissions.json';

export const SUPPORTED_LANGUAGES = ['ko', 'en'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const resources = {
  en: {
    common: commonEn,
    albumList: albumListEn,
    albumSettings: albumSettingsEn,
    appInfo: appInfoEn,
    appSettings: appSettingsEn,
    hiddenAlbums: hiddenAlbumsEn,
    invalidAlbums: invalidAlbumsEn,
    musicPicker: musicPickerEn,
    photoSelection: photoSelectionEn,
    slideshowDefaults: slideshowDefaultsEn,
    slideshowPlayer: slideshowPlayerEn,
    permissions: permissionsEn,
  },
  ko: {
    common: commonKo,
    albumList: albumListKo,
    albumSettings: albumSettingsKo,
    appInfo: appInfoKo,
    appSettings: appSettingsKo,
    hiddenAlbums: hiddenAlbumsKo,
    invalidAlbums: invalidAlbumsKo,
    musicPicker: musicPickerKo,
    photoSelection: photoSelectionKo,
    slideshowDefaults: slideshowDefaultsKo,
    slideshowPlayer: slideshowPlayerKo,
    permissions: permissionsKo,
  },
};

/**
 * 앱 내 수동 언어 전환 UI가 없어 런타임 반응성이 필요 없음 — 기동 시 1회만 감지.
 * getLocales()는 기기의 선호 언어 목록 전체를 우선순위 순으로 반환하므로
 * 1순위(codes[0])만 봐야 함 — 목록 어딘가에 ko가 있는지가 아니라.
 * 1순위가 ko/en 외 언어면 en으로 폴백.
 */
export function detectDeviceLanguage(): SupportedLanguage {
  const primaryLanguageCode = Localization.getLocales()[0]?.languageCode;
  return primaryLanguageCode === 'ko' ? 'ko' : 'en';
}

i18next
  .use(initReactI18next)
  .init({
    resources,
    lng: detectDeviceLanguage(),
    fallbackLng: 'en',
    defaultNS: 'common',
    ns: Object.keys(resources.en),
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  });

export default i18next;
