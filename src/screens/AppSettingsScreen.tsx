import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { RootStackParamList } from '../../App';
import type { ThemePreference } from '../settings/themePreference';
import type { ThemeColors } from '../theme/colors';
import { useAppTheme } from '../theme/ThemeContext';

const THEME_OPTIONS: ReadonlyArray<{ preference: ThemePreference; label: string }> = [
  { preference: 'light', label: '라이트' },
  { preference: 'dark', label: '다크' },
  { preference: 'system', label: '시스템 설정' },
];

export function AppSettingsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'AppSettings'>>();
  const { colors: c, preference, setPreference } = useAppTheme();
  const styles = useMemo(() => createStyles(c), [c]);

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>테마</Text>
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
              <Text style={[styles.themeButtonText, active && styles.themeButtonTextActive]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>

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

function createStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      paddingHorizontal: 16,
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
