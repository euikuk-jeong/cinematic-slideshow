import { useEffect, useRef, useState } from 'react';
import { Animated, Platform, StyleSheet, Text, View } from 'react-native';
import { BannerAd, BannerAdSize, TestIds } from 'react-native-google-mobile-ads';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ThemeColors } from '../theme/colors';
import { useAppTheme } from '../theme/ThemeContext';
import { SHOW_AD_DIAGNOSTICS } from './adDiagnostics';

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

// 광고 로드가 실패(no-fill 등)하면 이 간격(ms)으로 최대 이만큼 다시 요청한다. 한 번 실패한 뒤
// 화면을 다시 열기 전까지 영영 빈 칸으로 남던 문제 완화 — 서버가 연속 요청에 일시적으로 광고를
// 주지 않는 경우를 노린다. 너무 촘촘하면 오히려 요청 제한에 걸리므로 간격을 늘려간다.
export const AD_RETRY_DELAYS_MS = [5000, 15000, 30000];

export function AppBannerAd() {
  const { colors: c } = useAppTheme();
  const styles = createStyles(c);
  const [status, setStatus] = useState<'loading' | 'loaded' | 'failed'>('loading');
  const [lastError, setLastError] = useState<{ code: string; attempt: number } | null>(null);
  const bannerRef = useRef<BannerAd>(null);
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  // Android는 edge-to-edge가 기본이라 화면이 하단 네비게이션 바(3버튼) 밑까지 그려진다 — 배너가
  // 항상 화면 맨 아래에 붙으므로 여기서 inset만큼 띄워 배너가 네비바와 겹치지 않게 한다(배너
  // 로드 실패 시에도 이 여백은 유지해야 위 콘텐츠가 네비바에 가려지지 않는다).
  const insets = useSafeAreaInsets();

  useEffect(
    () => () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    },
    []
  );

  function handleLoadFailed(error: { code?: string; message?: string }) {
    const attempt = retryCountRef.current;
    const code = error.code ?? error.message ?? 'unknown';
    setLastError({ code, attempt });
    if (__DEV__) {
      console.warn('[AppBannerAd] failed to load', error);
    }
    if (attempt >= AD_RETRY_DELAYS_MS.length) {
      setStatus('failed');
      return;
    }
    // 재시도 대기 중에도 자리(loading minHeight)를 유지해 레이아웃이 흔들리지 않게 한다.
    retryCountRef.current = attempt + 1;
    retryTimerRef.current = setTimeout(() => bannerRef.current?.load(), AD_RETRY_DELAYS_MS[attempt]);
  }

  return (
    <View
      style={[
        styles.container,
        { paddingBottom: insets.bottom },
        // minHeight는 padding을 포함한 값이라 inset만큼 더해야 광고 자리 50dp가 그대로 확보된다
        (status === 'loading' || (SHOW_AD_DIAGNOSTICS && status === 'failed')) && {
          minHeight: LOADING_MIN_HEIGHT + insets.bottom,
        },
      ]}
      testID="banner-ad"
    >
      <Animated.View style={{ opacity }}>
        <BannerAd
          ref={bannerRef}
          unitId={BANNER_AD_UNIT_ID}
          size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
          onAdLoaded={() => {
            retryCountRef.current = 0;
            setLastError(null);
            setStatus('loaded');
            Animated.timing(opacity, {
              toValue: 1,
              duration: 250,
              useNativeDriver: true,
            }).start();
          }}
          onAdFailedToLoad={handleLoadFailed}
        />
      </Animated.View>
      {SHOW_AD_DIAGNOSTICS && lastError ? (
        <Text testID="banner-ad-diagnostic" style={styles.diagnostic} numberOfLines={2}>
          {`ad error: ${lastError.code} (${lastError.attempt}/${AD_RETRY_DELAYS_MS.length} retries)`}
        </Text>
      ) : null}
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
    diagnostic: {
      position: 'absolute',
      top: 2,
      left: 8,
      right: 8,
      fontSize: 10,
      color: c.textSecondary,
      textAlign: 'center',
    },
  });
}
