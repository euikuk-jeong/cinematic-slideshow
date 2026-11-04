import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';

import type { RootStackParamList } from '../../App';
import { AppBannerAd } from '../ads/AppBannerAd';
import { getAppSetting, setAppSetting } from '../db/client';
import { GALLERY_VIDEO_BANNER_DISMISSED_STORAGE_KEY, parseVideoBannerDismissed } from '../settings/galleryViewSettings';
import { isTrashAvailable } from '../photos/mediaTrash';
import type { ThemePreference } from '../settings/themePreference';
import { parseTrashEnabled, serializeTrashEnabled, TRASH_ENABLED_STORAGE_KEY } from '../settings/trashPreference';
import type { ThemeColors } from '../theme/colors';
import { useAppTheme } from '../theme/ThemeContext';

const THEME_OPTIONS: ReadonlyArray<{ preference: ThemePreference; labelKey: string }> = [
  { preference: 'light', labelKey: 'themeOptions.light' },
  { preference: 'dark', labelKey: 'themeOptions.dark' },
  { preference: 'system', labelKey: 'themeOptions.system' },
];

export function AppSettingsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'AppSettings'>>();
  const { colors: c, preference, setPreference } = useAppTheme();
  const { t } = useTranslation('appSettings');
  const styles = useMemo(() => createStyles(c), [c]);
  // 갤러리 상단의 "영상 접근 안내" 배너를 닫은 뒤 다시 켜는 곳. null = 아직 로드 전.
  const [bannerDismissed, setBannerDismissed] = useState<boolean | null>(null);
  // 삭제를 휴지통으로 보낼지. 휴지통을 쓸 수 없는 환경(Android 10 이하, 모듈 없는 빌드)에서는 항목 자체를 숨긴다.
  const trashAvailable = useMemo(() => isTrashAvailable(), []);
  const [trashEnabled, setTrashEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    getAppSetting(GALLERY_VIDEO_BANNER_DISMISSED_STORAGE_KEY)
      .then((raw) => {
        if (!cancelled) setBannerDismissed(parseVideoBannerDismissed(raw));
      })
      .catch((e) => {
        console.warn('[AppSettings] failed to load video banner setting', e);
        if (!cancelled) setBannerDismissed(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!trashAvailable) return;
    let cancelled = false;
    getAppSetting(TRASH_ENABLED_STORAGE_KEY)
      .then((raw) => {
        if (!cancelled) setTrashEnabled(parseTrashEnabled(raw));
      })
      .catch((e) => {
        console.warn('[AppSettings] failed to load trash setting', e);
        if (!cancelled) setTrashEnabled(parseTrashEnabled(null));
      });
    return () => {
      cancelled = true;
    };
  }, [trashAvailable]);

  function handleTrashToggle(enabled: boolean) {
    setTrashEnabled(enabled);
    setAppSetting(TRASH_ENABLED_STORAGE_KEY, serializeTrashEnabled(enabled)).catch((e) =>
      console.warn('[AppSettings] failed to save trash setting', e)
    );
  }

  function handleBannerToggle(show: boolean) {
    setBannerDismissed(!show);
    setAppSetting(GALLERY_VIDEO_BANNER_DISMISSED_STORAGE_KEY, show ? '0' : '1').catch((e) =>
      console.warn('[AppSettings] failed to save video banner setting', e)
    );
  }

  // 배너가 화면 아래를 차지하므로 설정 목록은 스크롤 가능하게 둔다(작은 화면에서 마지막 행이 가려지지 않게).
  return (
    <View style={styles.root}>
      <ScrollView style={styles.root} contentContainerStyle={styles.container}>
        <Text style={styles.sectionTitle}>{t('themeSectionTitle')}</Text>
        <View style={styles.themeRow}>
          {THEME_OPTIONS.map((option) => {
            const active = preference === option.preference;
            return (
              <Pressable
                key={option.preference}
                testID={`app-settings-theme-${option.preference}`}
                style={[styles.themeButton, active && styles.themeButtonActive]}
                onPress={() => setPreference(option.preference)}
              >
                <Text style={[styles.themeButtonText, active && styles.themeButtonTextActive]}>{t(option.labelKey)}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.sectionTitle}>{t('videoBannerSectionTitle')}</Text>
        <View style={styles.toggleRow}>
          <View style={styles.toggleText}>
            <Text style={styles.rowTitle}>{t('videoBannerToggleLabel')}</Text>
            <Text style={styles.toggleHint}>{t('videoBannerToggleHint')}</Text>
          </View>
          <Switch
            testID="app-settings-video-banner-toggle"
            accessibilityLabel={t('videoBannerToggleLabel')}
            value={bannerDismissed === false}
            disabled={bannerDismissed === null}
            onValueChange={handleBannerToggle}
            trackColor={{ true: c.accent, false: c.hairline }}
          />
        </View>

        {trashAvailable ? (
          <>
            <Text style={styles.sectionTitle}>{t('trashSectionTitle')}</Text>
            <View style={styles.toggleRow}>
              <View style={styles.toggleText}>
                <Text style={styles.rowTitle}>{t('trashToggleLabel')}</Text>
                <Text style={styles.toggleHint}>{t('trashToggleHint')}</Text>
              </View>
              <Switch
                testID="app-settings-trash-toggle"
                accessibilityLabel={t('trashToggleLabel')}
                value={trashEnabled !== false}
                disabled={trashEnabled === null}
                onValueChange={handleTrashToggle}
                trackColor={{ true: c.accent, false: c.hairline }}
              />
            </View>
          </>
        ) : null}

        <Pressable
          testID="app-settings-slideshow-defaults"
          style={styles.row}
          onPress={() => navigation.navigate('SlideshowDefaults')}
        >
          <Text style={styles.rowTitle}>{t('common:screenTitle.slideshowDefaults')}</Text>
          <Text style={styles.rowChevron}>›</Text>
        </Pressable>

        <Pressable testID="app-settings-hidden-albums" style={styles.row} onPress={() => navigation.navigate('HiddenAlbums')}>
          <Text style={styles.rowTitle}>{t('common:screenTitle.hiddenAlbums')}</Text>
          <Text style={styles.rowChevron}>›</Text>
        </Pressable>

        <Pressable testID="app-settings-invalid-albums" style={styles.row} onPress={() => navigation.navigate('InvalidAlbums')}>
          <Text style={styles.rowTitle}>{t('common:screenTitle.invalidAlbums')}</Text>
          <Text style={styles.rowChevron}>›</Text>
        </Pressable>

        <Pressable testID="app-settings-app-info" style={styles.row} onPress={() => navigation.navigate('AppInfo')}>
          <Text style={styles.rowTitle}>{t('common:screenTitle.appInfo')}</Text>
          <Text style={styles.rowChevron}>›</Text>
        </Pressable>
      </ScrollView>
      <AppBannerAd />
    </View>
  );
}

function createStyles(c: ThemeColors) {
  return StyleSheet.create({
    root: {
      flex: 1,
    },
    container: {
      paddingHorizontal: 16,
      paddingBottom: 16,
    },
    sectionTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: c.textSecondary,
      marginTop: 16,
      marginBottom: 8,
    },
    themeRow: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: 8,
    },
    themeButton: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: c.hairline,
      alignItems: 'center',
    },
    themeButtonActive: {
      borderColor: c.accent,
      backgroundColor: c.accentSoft,
    },
    themeButtonText: {
      fontSize: 14,
      color: c.ink,
    },
    themeButtonTextActive: {
      color: c.accent,
      fontWeight: '600',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 16,
      borderBottomWidth: 1,
      borderBottomColor: c.hairline,
    },
    toggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: c.hairline,
    },
    toggleText: {
      flex: 1,
      gap: 2,
    },
    toggleHint: {
      fontSize: 12,
      color: c.textSecondary,
    },
    rowTitle: {
      fontSize: 15,
      color: c.ink,
    },
    rowChevron: {
      color: c.textSecondary,
      fontSize: 18,
    },
  });
}
