import { useMemo } from 'react';
import { DarkTheme, DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import mobileAds from 'react-native-google-mobile-ads';
import { useTranslation } from 'react-i18next';

import './src/i18n';
import { AlbumListScreen } from './src/screens/AlbumListScreen';
import { AlbumSettingsScreen } from './src/screens/AlbumSettingsScreen';
import { AppInfoScreen } from './src/screens/AppInfoScreen';
import { AppSettingsScreen } from './src/screens/AppSettingsScreen';
import { HiddenAlbumsScreen } from './src/screens/HiddenAlbumsScreen';
import { InvalidAlbumsScreen } from './src/screens/InvalidAlbumsScreen';
import { OpenSourceLicensesScreen } from './src/screens/OpenSourceLicensesScreen';
import { PhotoSelectionScreen } from './src/screens/PhotoSelectionScreen';
import { SlideshowDefaultsScreen } from './src/screens/SlideshowDefaultsScreen';
import { SlideshowPlayerScreen } from './src/screens/SlideshowPlayerScreen';
import { useAppTheme } from './src/theme/ThemeContext';
import { ThemeProvider } from './src/theme/ThemeProvider';

export type RootStackParamList = {
  AlbumList: undefined;
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
          contentStyle: { backgroundColor: c.background },
        }}
      >
        <Stack.Screen name="AlbumList" component={AlbumListScreen} options={{ title: t('screenTitle.albumList') }} />
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
        <Stack.Screen name="SlideshowPlayer" component={SlideshowPlayerScreen} options={{ headerShown: false }} />
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
      <ThemeProvider>
        <AppNavigator />
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
