import { useRef, useState } from 'react';
import { Animated, Platform, StyleSheet, View } from 'react-native';
import { BannerAd, BannerAdSize, TestIds } from 'react-native-google-mobile-ads';

import type { ThemeColors } from '../theme/colors';
import { useAppTheme } from '../theme/ThemeContext';

// adaptive 배너 실제 높이는 로드 후에야 SDK가 기기 폭 기준으로 정하므로, 로딩 중
// 레이아웃이 0→광고높이로 점프하지 않도록 표준 배너 높이(50dp)만큼 미리 자리 확보
const LOADING_MIN_HEIGHT = 50;

// AdMob 실제 배너 광고단위ID(Android, 계정 발급 완료). iOS는 아직 앱 미등록이라
// app.json 플러그인 설정도 iosAppId는 Google 테스트 App ID로 남아있음 — 실제 iOS
// 광고단위ID가 생기기 전까지 iOS는 TestIds.BANNER로 폴백.
const ANDROID_BANNER_AD_UNIT_ID = 'ca-app-pub-3457289202492836/1505717963';

// __DEV__(EAS development client)에서 실제ID를 그대로 쓰면 개발자 본인의 반복 실행·실수
// 클릭이 AdMob에 유효하지 않은 트래픽으로 잡혀 계정 정지 리스크가 있다(Google 정책)
// — 개발 중엔 테스트ID, preview/production 빌드에서만 실제ID를 요청한다.
const BANNER_AD_UNIT_ID =
  __DEV__ || Platform.OS !== 'android' ? TestIds.BANNER : ANDROID_BANNER_AD_UNIT_ID;

export function AppBannerAd() {
  const { colors: c } = useAppTheme();
  const styles = createStyles(c);
  const [status, setStatus] = useState<'loading' | 'loaded' | 'failed'>('loading');
  const opacity = useRef(new Animated.Value(0)).current;

  return (
    <View
      style={[styles.container, status === 'loading' && styles.loadingContainer]}
      testID="banner-ad"
    >
      <Animated.View style={{ opacity }}>
        <BannerAd
          unitId={BANNER_AD_UNIT_ID}
          size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
          onAdLoaded={() => {
            setStatus('loaded');
            Animated.timing(opacity, {
              toValue: 1,
              duration: 250,
              useNativeDriver: true,
            }).start();
          }}
          onAdFailedToLoad={error => {
            setStatus('failed');
            if (__DEV__) {
              console.warn('[AppBannerAd] failed to load', error);
            }
          }}
        />
      </Animated.View>
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
    loadingContainer: {
      minHeight: LOADING_MIN_HEIGHT,
    },
  });
}
