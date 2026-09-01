import { useMemo } from 'react';
import { Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { RootStackParamList } from '../../App';
import appConfig from '../../app.json';
import type { ThemeColors } from '../theme/colors';
import { useAppTheme } from '../theme/ThemeContext';

const GITHUB_URL = 'https://github.com/euikuk-jeong/cinematic-slideshow';
const GITHUB_LINK_LABEL = 'github.com/cinematic-slideshow';

const DESCRIPTION =
  'Turn your device’s photo albums into a cinematic slideshow with Ken Burns effects, smooth transitions, and background music — all processed locally on your device.';

export function AppInfoScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'AppInfo'>>();
  const { colors: c } = useAppTheme();
  const styles = useMemo(() => createStyles(c), [c]);

  return (
    <View style={styles.container}>
      <Image testID="app-info-icon" source={require('../../assets/images/app-icon-1024.png')} style={styles.icon} />
      <Text style={styles.name}>{appConfig.expo.name}</Text>
      <Text style={styles.version}>버전 {appConfig.expo.version}</Text>
      <Text style={styles.description}>{DESCRIPTION}</Text>
      <Pressable testID="app-info-github-link" onPress={() => Linking.openURL(GITHUB_URL)}>
        <Text style={styles.link}>{GITHUB_LINK_LABEL}</Text>
      </Pressable>
      <Pressable
        testID="app-info-oss-licenses-link"
        style={styles.ossRow}
        onPress={() => navigation.navigate('OpenSourceLicenses')}
      >
        <Text style={styles.ossRowText}>오픈소스 라이선스</Text>
        <Text style={styles.rowChevron}>›</Text>
      </Pressable>
    </View>
  );
}

function createStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      gap: 8,
    },
    icon: {
      width: 96,
      height: 96,
      borderRadius: 20,
      marginBottom: 8,
    },
    name: {
      fontSize: 17,
      fontWeight: '600',
      color: c.ink,
    },
    version: {
      fontSize: 14,
      color: c.textSecondary,
    },
    link: {
      marginTop: 8,
      fontSize: 14,
      color: c.accent,
    },
    description: {
      marginTop: 8,
      fontSize: 13,
      lineHeight: 19,
      color: c.textSecondary,
      textAlign: 'center',
    },
    ossRow: {
      marginTop: 24,
      alignSelf: 'stretch',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 16,
      paddingHorizontal: 4,
      borderTopWidth: 1,
      borderTopColor: c.hairline,
    },
    ossRowText: {
      fontSize: 15,
      color: c.ink,
    },
    rowChevron: {
      color: c.textSecondary,
      fontSize: 18,
    },
  });
}
