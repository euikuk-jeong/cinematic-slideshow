import { useMemo } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import type { ThemeColors } from '../theme/colors';
import { useAppTheme } from '../theme/ThemeContext';

interface HeaderIconButtonProps {
  testID: string;
  glyph: string;
  accessibilityLabel: string;
  onPress: () => void;
  disabled?: boolean;
}

/** native-stack 헤더 우측에 두는 아이콘 버튼(터치 영역 48dp). */
export function HeaderIconButton({ testID, glyph, accessibilityLabel, onPress, disabled }: HeaderIconButtonProps) {
  const { colors: c } = useAppTheme();
  const styles = useMemo(() => createStyles(c), [c]);
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      style={({ pressed }) => [styles.button, pressed && styles.pressed, disabled && styles.disabled]}
      onPress={onPress}
    >
      <Text style={styles.glyph}>{glyph}</Text>
    </Pressable>
  );
}

function createStyles(c: ThemeColors) {
  return StyleSheet.create({
    button: {
      width: 48,
      height: 48,
      borderRadius: 24,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pressed: {
      backgroundColor: c.hairline,
    },
    disabled: {
      opacity: 0.4,
    },
    glyph: {
      fontSize: 22,
      color: c.accent,
    },
  });
}
