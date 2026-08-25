import { useMemo } from 'react';
import { DarkTheme, DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';

import { AlbumListScreen } from './src/screens/AlbumListScreen';
import { AlbumSettingsScreen } from './src/screens/AlbumSettingsScreen';
import { AppInfoScreen } from './src/screens/AppInfoScreen';
import { AppSettingsScreen } from './src/screens/AppSettingsScreen';
import { HiddenAlbumsScreen } from './src/screens/HiddenAlbumsScreen';
import { useAppTheme } from './src/theme/ThemeContext';
import { ThemeProvider } from './src/theme/ThemeProvider';

export type RootStackParamList = {
  AlbumList: undefined;
  AlbumSettings: { deviceAlbumId: string; displayName: string };
  AppSettings: undefined;
  HiddenAlbums: undefined;
  AppInfo: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

function AppNavigator() {
  const { colors: c, scheme } = useAppTheme();

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
        <Stack.Screen name="AlbumList" component={AlbumListScreen} options={{ title: '앨범 목록' }} />
        <Stack.Screen
          name="AlbumSettings"
          component={AlbumSettingsScreen}
          options={({ route }) => ({ title: route.params.displayName })}
        />
        <Stack.Screen name="AppSettings" component={AppSettingsScreen} options={{ title: '앱 설정' }} />
        <Stack.Screen name="HiddenAlbums" component={HiddenAlbumsScreen} options={{ title: '제외된 폴더' }} />
        <Stack.Screen name="AppInfo" component={AppInfoScreen} options={{ title: '앱 정보' }} />
      </Stack.Navigator>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AppNavigator />
    </ThemeProvider>
  );
}
