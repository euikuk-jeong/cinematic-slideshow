import { useMemo } from 'react';
import { Platform } from 'react-native';
import { DarkTheme, DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import mobileAds from 'react-native-google-mobile-ads';
import { useTranslation } from 'react-i18next';

import './src/i18n';
import { AlbumGalleryScreen } from './src/screens/AlbumGalleryScreen';
import { AlbumListScreen } from './src/screens/AlbumListScreen';
import { AlbumSettingsScreen } from './src/screens/AlbumSettingsScreen';
import { AppInfoScreen } from './src/screens/AppInfoScreen';
import { AppSettingsScreen } from './src/screens/AppSettingsScreen';
import { HiddenAlbumsScreen } from './src/screens/HiddenAlbumsScreen';
import { InvalidAlbumsScreen } from './src/screens/InvalidAlbumsScreen';
import { OpenSourceLicensesScreen } from './src/screens/OpenSourceLicensesScreen';
import { PhotoViewerScreen } from './src/screens/PhotoViewerScreen';
import { PhotoSelectionScreen } from './src/screens/PhotoSelectionScreen';
import { SlideshowDefaultsScreen } from './src/screens/SlideshowDefaultsScreen';
import { SlideshowPlayerScreen } from './src/screens/SlideshowPlayerScreen';
import type { PhotoSortCriterion, PhotoSortDirection } from './src/photos/photoSort';
import type { GalleryViewMode } from './src/settings/galleryViewSettings';
import { useAppTheme } from './src/theme/ThemeContext';
import { ThemeProvider } from './src/theme/ThemeProvider';

export type RootStackParamList = {
  AlbumList: undefined;
  AlbumGallery: { deviceAlbumId: string; displayName: string };
  PhotoViewer: {
    deviceAlbumId: string;
    displayName: string;
    initialAssetId: string;
    sortCriterion: PhotoSortCriterion;
    sortDirection: PhotoSortDirection;
    viewMode: GalleryViewMode;
    /** 갤러리에서 검색 중에 연 경우의 검색어 — 이전/다음이 검색 결과 안에서만 움직이게 한다. */
    searchQuery?: string;
  };
  AlbumSettings: { deviceAlbumId: string; displayName: string };
  PhotoSelection: { albumId: number; deviceAlbumId: string; displayName: string };
  SlideshowPlayer: { albumId: number; deviceAlbumId: string };
  AppSettings: undefined;
  SlideshowDefaults: undefined;
  HiddenAlbums: undefined;
  InvalidAlbums: undefined;
  AppInfo: undefined;
  OpenSourceLicenses: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

mobileAds()
  .initialize()
  .catch(error => {
    if (__DEV__) {
      console.warn('[AdMob] initialize failed', error);
    }
  });

function AppNavigator() {
  const { colors: c, scheme } = useAppTheme();
  const { t } = useTranslation('common');
  const insets = useSafeAreaInsets();

  const navigationTheme = useMemo(() => {
    const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: { ...base.colors, background: c.background, card: c.surface, text: c.ink, border: c.hairline, primary: c.accent },
    };
  }, [c, scheme]);

  return (
    <NavigationContainer theme={navigationTheme}>
      <Stack.Navigator
        screenOptions={{
          headerTintColor: c.accent,
          headerTitleStyle: { color: c.ink },
          headerStyle: { backgroundColor: c.surface },
          // 가로 모드에서는 3버튼 네비게이션 바가 화면 좌/우로 옮겨가므로(edge-to-edge), 하단 inset은
          // 0이 되고 콘텐츠가 옆쪽 네비바 밑으로 깔린다 — 좌우 inset은 모든 화면 공통으로 여기서 띄운다
          // (하단 inset은 배너·목록이 각자 처리, 재생 화면은 아래에서 전체화면으로 덮어씀).
          contentStyle: { backgroundColor: c.background, paddingLeft: insets.left, paddingRight: insets.right },
        }}
      >
        <Stack.Screen name="AlbumList" component={AlbumListScreen} options={{ title: t('screenTitle.albumList') }} />
        <Stack.Screen
          name="AlbumGallery"
          component={AlbumGalleryScreen}
          options={({ route }) => ({ title: route.params.displayName })}
        />
        {/* 사진 뷰어: 검정 배경 전체화면. 헤더는 화면 안의 크롬 바가 대신하고, 한 번 탭으로
            크롬과 함께 시스템 바(navigationBarHidden/statusBarHidden)를 토글한다(화면 안에서
            setOptions로 갱신). 좌우 inset 패딩은 사진을 화면 끝까지 채우려고 덮어쓴다. */}
        <Stack.Screen
          name="PhotoViewer"
          component={PhotoViewerScreen}
          options={{ headerShown: false, contentStyle: { backgroundColor: '#000' } }}
        />
        <Stack.Screen
          name="AlbumSettings"
          component={AlbumSettingsScreen}
          options={({ route }) => ({ title: route.params.displayName })}
        />
        <Stack.Screen
          name="PhotoSelection"
          component={PhotoSelectionScreen}
          options={{ title: t('screenTitle.photoSelection') }}
        />
        {/* Android는 edge-to-edge가 기본이라 하단 3버튼 네비게이션 바가 사진 위에 계속 겹쳐 보인다 —
            재생 화면에서만 상태바·네비바를 숨겨 전체화면(immersive)으로 만든다. 가장자리 스와이프 시
            잠깐 나타났다 다시 숨는다(BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE). 다른 화면으로 돌아가면
            react-native-screens가 해당 화면 기준(기본값 false)으로 다시 표시한다. statusBarHidden은
            Android에만 건다 — iOS에서 screens의 상태바 옵션은 Info.plist의
            UIViewControllerBasedStatusBarAppearance=YES가 없으면 RCTLogError를 낸다. */}
        <Stack.Screen
          name="SlideshowPlayer"
          component={SlideshowPlayerScreen}
          options={{
            headerShown: false,
            navigationBarHidden: true,
            ...(Platform.OS === 'android' && { statusBarHidden: true }),
            contentStyle: { backgroundColor: c.background },
          }}
        />
        <Stack.Screen name="AppSettings" component={AppSettingsScreen} options={{ title: t('screenTitle.appSettings') }} />
        <Stack.Screen
          name="SlideshowDefaults"
          component={SlideshowDefaultsScreen}
          options={{ title: t('screenTitle.slideshowDefaults') }}
        />
        <Stack.Screen
          name="HiddenAlbums"
          component={HiddenAlbumsScreen}
          options={{ title: t('screenTitle.hiddenAlbums') }}
        />
        <Stack.Screen
          name="InvalidAlbums"
          component={InvalidAlbumsScreen}
          options={{ title: t('screenTitle.invalidAlbums') }}
        />
        <Stack.Screen name="AppInfo" component={AppInfoScreen} options={{ title: t('screenTitle.appInfo') }} />
        <Stack.Screen
          name="OpenSourceLicenses"
          component={OpenSourceLicensesScreen}
          options={{ title: t('screenTitle.openSourceLicenses') }}
        />
      </Stack.Navigator>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <AppNavigator />
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
