import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { RootStackParamList } from '../../App';
import { colors } from '../theme/colors';

export function AppSettingsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'AppSettings'>>();

  return (
    <View style={styles.container}>
      <Pressable
        testID="app-settings-hidden-albums"
        style={styles.row}
        onPress={() => navigation.navigate('HiddenAlbums')}
      >
        <Text style={styles.rowTitle}>제외된 폴더</Text>
        <Text style={styles.rowChevron}>›</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
  rowTitle: {
    fontSize: 15,
  },
  rowChevron: {
    color: colors.textSecondary,
    fontSize: 18,
  },
});
