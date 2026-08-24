import { StyleSheet, Text, View } from 'react-native';

import { colors } from '../theme/colors';

export function AppSettingsScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.message}>설정 기능은 준비 중입니다</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  message: {
    fontSize: 15,
    color: colors.textSecondary,
  },
});
