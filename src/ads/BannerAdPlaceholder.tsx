import { StyleSheet, Text, View } from 'react-native';

import type { ThemeColors } from '../theme/colors';
import { useAppTheme } from '../theme/ThemeContext';

// AdMob 배너(Anchored Adaptive Banner) 실제 높이는 SDK가 런타임에 기기 폭 기준으로 계산한다
// (기기별 약 50~100dp) — 이 상수는 실제 SDK 연동 전까지 레이아웃 자리만 예약해두는 최소값이다.
// SDK 연동 시 이 컴포넌트 내부만 교체하면 되고, 사용하는 화면 쪽 레이아웃은 바뀌지 않는다.
const PLACEHOLDER_HEIGHT = 50;

export function BannerAdPlaceholder() {
  const { colors: c } = useAppTheme();
  const styles = createStyles(c);
  return (
    <View style={styles.container} testID="banner-ad-placeholder">
      {__DEV__ && <Text style={styles.label}>광고 영역</Text>}
    </View>
  );
}

function createStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: {
      height: PLACEHOLDER_HEIGHT,
      alignItems: 'center',
      justifyContent: 'center',
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.hairline,
      backgroundColor: c.surface,
    },
    label: {
      fontSize: 12,
      color: c.textSecondary,
    },
  });
}
