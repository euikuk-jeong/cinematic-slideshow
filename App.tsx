import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';

import { AlbumListScreen } from './src/screens/AlbumListScreen';
import { AlbumSettingsScreen } from './src/screens/AlbumSettingsScreen';
import { AppInfoScreen } from './src/screens/AppInfoScreen';
import { AppSettingsScreen } from './src/screens/AppSettingsScreen';
import { HiddenAlbumsScreen } from './src/screens/HiddenAlbumsScreen';
import { colors } from './src/theme/colors';

export type RootStackParamList = {
  AlbumList: undefined;
  AlbumSettings: { deviceAlbumId: string; displayName: string };
  AppSettings: undefined;
  HiddenAlbums: undefined;
  AppInfo: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{ headerTintColor: colors.accent, headerTitleStyle: { color: colors.ink } }}
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
      <StatusBar style="auto" />
    </NavigationContainer>
  );
}
