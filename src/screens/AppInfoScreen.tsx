import { Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import appConfig from '../../app.json';
import { colors } from '../theme/colors';

const GITHUB_URL = 'https://github.com/euikuk-jeong/cinematic-slideshow';

export function AppInfoScreen() {
  return (
    <View style={styles.container}>
      <Image testID="app-info-icon" source={require('../../assets/images/app-icon-1024.png')} style={styles.icon} />
      <Text style={styles.name}>{appConfig.expo.name}</Text>
      <Text style={styles.version}>버전 {appConfig.expo.version}</Text>
      <Pressable testID="app-info-github-link" onPress={() => Linking.openURL(GITHUB_URL)}>
        <Text style={styles.link}>{GITHUB_URL}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
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
  },
  version: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  link: {
    marginTop: 8,
    fontSize: 14,
    color: colors.accent,
  },
});
