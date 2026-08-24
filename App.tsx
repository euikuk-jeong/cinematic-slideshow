import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';

import { AlbumListScreen } from './src/screens/AlbumListScreen';
import { AppInfoScreen } from './src/screens/AppInfoScreen';
import { AppSettingsScreen } from './src/screens/AppSettingsScreen';

export type RootStackParamList = {
  AlbumList: undefined;
  AppSettings: undefined;
  AppInfo: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen name="AlbumList" component={AlbumListScreen} options={{ title: '앨범 목록' }} />
        <Stack.Screen name="AppSettings" component={AppSettingsScreen} options={{ title: '설정' }} />
        <Stack.Screen name="AppInfo" component={AppInfoScreen} options={{ title: '앱 정보' }} />
      </Stack.Navigator>
      <StatusBar style="auto" />
    </NavigationContainer>
  );
}
