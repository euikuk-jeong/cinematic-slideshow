import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { ThemeColors } from '../theme/colors';
import { useAppTheme } from '../theme/ThemeContext';

/** 선택된 앨범 카드 위에 겹쳐 그리는 테두리 + 체크 표시(갤러리 타일의 선택 표시와 같은 모양). */
export function SelectMark({ testID }: { testID: string }) {
  const { colors: c } = useAppTheme();
  const styles = useMemo(() => createStyles(c), [c]);
  return (
    <>
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.overlay]} />
      <View testID={testID} style={styles.check}>
        <Text style={styles.checkText}>✓</Text>
      </View>
    </>
  );
}

function createStyles(c: ThemeColors) {
  return StyleSheet.create({
    overlay: {
      borderWidth: 3,
      borderColor: c.accent,
      backgroundColor: 'rgba(252,131,109,0.25)',
    },
    check: {
      position: 'absolute',
      right: 4,
      top: 4,
      width: 22,
      height: 22,
      borderRadius: 11,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.accent,
    },
    checkText: {
      color: '#fff',
      fontSize: 13,
      fontWeight: '700',
    },
  });
}
