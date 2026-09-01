import { StyleSheet, View } from 'react-native';
import { BannerAd, BannerAdSize, TestIds } from 'react-native-google-mobile-ads';

import type { ThemeColors } from '../theme/colors';
import { useAppTheme } from '../theme/ThemeContext';

// AdMob 계정 승인 전이라 Google 공식 테스트 광고단위ID로 연동한다 — 계정 승인 후
// 이 상수만 실제 배너 광고단위ID로 교체하면 된다. App ID는 app.json의
// react-native-google-mobile-ads 플러그인 설정(현재도 Google 공식 테스트 App ID)에서 관리.
const BANNER_AD_UNIT_ID = TestIds.BANNER;

export function AppBannerAd() {
  const { colors: c } = useAppTheme();
  const styles = createStyles(c);
  return (
    <View style={styles.container} testID="banner-ad">
      <BannerAd
        unitId={BANNER_AD_UNIT_ID}
        size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
        onAdFailedToLoad={error => {
          if (__DEV__) {
            console.warn('[AppBannerAd] failed to load', error);
          }
        }}
      />
    </View>
  );
}

function createStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: {
      alignItems: 'center',
      justifyContent: 'center',
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.hairline,
      backgroundColor: c.surface,
    },
  });
}
