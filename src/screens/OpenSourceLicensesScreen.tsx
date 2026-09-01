import { useMemo } from 'react';
import { FlatList, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { OPEN_SOURCE_LICENSES, type OpenSourceLicenseEntry } from '../legal/openSourceLicenses';
import type { ThemeColors } from '../theme/colors';
import { useAppTheme } from '../theme/ThemeContext';

export function OpenSourceLicensesScreen() {
  const { colors: c } = useAppTheme();
  const styles = useMemo(() => createStyles(c), [c]);

  return (
    <FlatList
      testID="oss-license-list"
      style={styles.container}
      data={OPEN_SOURCE_LICENSES}
      keyExtractor={(item) => item.name}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      renderItem={({ item }) => <LicenseRow entry={item} styles={styles} colors={c} />}
    />
  );
}

function LicenseRow({
  entry,
  styles,
  colors: c,
}: {
  entry: OpenSourceLicenseEntry;
  styles: ReturnType<typeof createStyles>;
  colors: ThemeColors;
}) {
  const content = (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <Text style={styles.name}>{entry.name}</Text>
        <Text style={styles.version}>{entry.version}</Text>
      </View>
      <Text style={styles.license}>{entry.license}</Text>
    </View>
  );

  if (!entry.homepage) return content;

  return (
    <Pressable
      testID={`oss-license-item-${entry.name}`}
      onPress={() => Linking.openURL(entry.homepage!)}
      style={({ pressed }) => pressed && { opacity: 0.6 }}
    >
      {content}
    </Pressable>
  );
}

function createStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: c.background,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 14,
      paddingHorizontal: 20,
      gap: 12,
    },
    rowText: {
      flex: 1,
    },
    name: {
      fontSize: 15,
      color: c.ink,
    },
    version: {
      fontSize: 12,
      color: c.textSecondary,
      marginTop: 2,
    },
    license: {
      fontSize: 12,
      fontWeight: '600',
      color: c.accent,
      backgroundColor: c.accentSoft,
      paddingVertical: 4,
      paddingHorizontal: 8,
      borderRadius: 6,
      overflow: 'hidden',
    },
    separator: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: c.hairline,
      marginLeft: 20,
    },
  });
}
