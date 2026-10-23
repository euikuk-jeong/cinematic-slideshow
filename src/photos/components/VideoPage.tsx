import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useTranslation } from 'react-i18next';

import { formatDuration } from '../mediaFormat';

export const VIDEO_SKIP_SECONDS = 10;
const TIME_UPDATE_INTERVAL_SEC = 0.25;

// 사진 뷰어와 같은 이유로 영상 컨트롤도 테마와 무관한 흰 글씨 + 반투명 검정으로 고정한다.
const CONTROL_BACKGROUND = 'rgba(0,0,0,0.55)';
const CONTROL_TEXT = '#fff';
const TRACK_BACKGROUND = 'rgba(255,255,255,0.3)';

export interface VideoPageProps {
  testIdPrefix: string;
  uri: string;
  /** 메타데이터상의 영상 길이(ms). 플레이어가 길이를 알려주기 전의 초기값으로 쓴다. */
  durationMs: number | null;
  viewport: { width: number; height: number };
  /** 현재 보이는 페이지인지. false가 되면 일시정지한다(재생 위치는 유지). */
  active: boolean;
  controlsVisible: boolean;
  /** 컨트롤이 하단 크롬 바와 겹치지 않도록 띄우는 높이. */
  controlsBottomOffset: number;
  onTap: () => void;
  onRetry: () => void;
}

/**
 * 뷰어 안의 영상 페이지. 자동재생·반복은 하지 않고(사용자가 재생을 눌러 시작), 페이지가
 * 화면에서 벗어나면 일시정지한다. 플레이어는 useVideoPlayer가 언마운트 시 해제한다 —
 * 뷰어가 ±2 범위 밖 페이지를 언마운트하므로 멀어진 영상의 디코더는 함께 정리된다.
 */
export function VideoPage({
  testIdPrefix,
  uri,
  durationMs,
  viewport,
  active,
  controlsVisible,
  controlsBottomOffset,
  onTap,
  onRetry,
}: VideoPageProps) {
  const { t } = useTranslation('gallery');
  const player = useVideoPlayer(uri, (p) => {
    p.loop = false;
    p.timeUpdateEventInterval = TIME_UPDATE_INTERVAL_SEC;
  });
  const [playing, setPlaying] = useState(false);
  const [currentSec, setCurrentSec] = useState(0);
  const [durationSec, setDurationSec] = useState(durationMs ? durationMs / 1000 : 0);
  const [failed, setFailed] = useState(false);
  const [barWidth, setBarWidth] = useState(0);

  useEffect(() => {
    const subscriptions = [
      player.addListener('playingChange', ({ isPlaying }) => setPlaying(isPlaying)),
      player.addListener('timeUpdate', ({ currentTime }) => setCurrentSec(currentTime)),
      player.addListener('statusChange', ({ status }) => {
        if (status === 'error') {
          console.warn(`[VideoPage] playback error for ${testIdPrefix}`);
          setFailed(true);
        } else if (status === 'readyToPlay' && player.duration > 0) {
          setDurationSec(player.duration);
        }
      }),
      player.addListener('playToEnd', () => setPlaying(false)),
    ];
    return () => subscriptions.forEach((subscription) => subscription.remove());
  }, [player, testIdPrefix]);

  useEffect(() => {
    if (!active) player.pause();
  }, [active, player]);

  function togglePlay() {
    if (playing) player.pause();
    else player.play();
  }

  function skip(seconds: number) {
    player.seekBy(seconds);
    setCurrentSec(player.currentTime);
  }

  function seekToFraction(fraction: number) {
    if (durationSec <= 0) return;
    const clamped = Math.min(1, Math.max(0, fraction));
    player.currentTime = clamped * durationSec;
    setCurrentSec(player.currentTime);
  }

  const pageStyle = { width: viewport.width, height: viewport.height };

  if (failed) {
    return (
      <View testID={`${testIdPrefix}-video-error`} style={[pageStyle, styles.centered]}>
        <Text style={styles.message}>{t('pageError')}</Text>
        <Pressable testID={`${testIdPrefix}-video-retry`} accessibilityRole="button" style={styles.retryButton} onPress={onRetry}>
          <Text style={styles.retryButtonText}>{t('retry')}</Text>
        </Pressable>
      </View>
    );
  }

  const progress = durationSec > 0 ? Math.min(1, currentSec / durationSec) : 0;

  return (
    <View testID={`${testIdPrefix}-video`} style={pageStyle}>
      <Pressable testID={`${testIdPrefix}-video-surface`} style={StyleSheet.absoluteFill} onPress={onTap}>
        <VideoView
          testID={`${testIdPrefix}-video-view`}
          player={player}
          style={StyleSheet.absoluteFill}
          contentFit="contain"
          nativeControls={false}
          allowsPictureInPicture={false}
        />
      </Pressable>

      {controlsVisible ? (
        <View style={[styles.controls, { bottom: controlsBottomOffset }]}>
          <Pressable
            testID={`${testIdPrefix}-video-seekbar`}
            accessibilityRole="adjustable"
            accessibilityLabel={t('videoSeekBar')}
            style={styles.track}
            onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}
            onPress={(e) => {
              if (barWidth > 0) seekToFraction(e.nativeEvent.locationX / barWidth);
            }}
          >
            <View style={styles.trackLine}>
              <View style={[styles.trackFill, { width: `${progress * 100}%` }]} />
            </View>
          </Pressable>
          <View style={styles.buttonRow}>
            <Text testID={`${testIdPrefix}-video-time`} style={styles.timeText}>
              {`${formatDuration(currentSec * 1000) ?? '0:00'} / ${formatDuration(durationSec * 1000) ?? '0:00'}`}
            </Text>
            <View style={styles.buttons}>
              <Pressable
                testID={`${testIdPrefix}-video-back10`}
                accessibilityRole="button"
                accessibilityLabel={t('videoBack10')}
                style={styles.controlButton}
                onPress={() => skip(-VIDEO_SKIP_SECONDS)}
              >
                <Text style={styles.controlButtonText}>⏪ 10</Text>
              </Pressable>
              <Pressable
                testID={`${testIdPrefix}-video-toggle`}
                accessibilityRole="button"
                accessibilityLabel={playing ? t('videoPause') : t('videoPlay')}
                style={styles.controlButton}
                onPress={togglePlay}
              >
                <Text style={styles.controlButtonText}>{playing ? '❙❙' : '▶'}</Text>
              </Pressable>
              <Pressable
                testID={`${testIdPrefix}-video-forward10`}
                accessibilityRole="button"
                accessibilityLabel={t('videoForward10')}
                style={styles.controlButton}
                onPress={() => skip(VIDEO_SKIP_SECONDS)}
              >
                <Text style={styles.controlButtonText}>10 ⏩</Text>
              </Pressable>
            </View>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    gap: 12,
  },
  message: {
    color: CONTROL_TEXT,
    textAlign: 'center',
    fontSize: 14,
  },
  retryButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: CONTROL_TEXT,
  },
  retryButtonText: {
    color: CONTROL_TEXT,
    fontWeight: '600',
  },
  controls: {
    position: 'absolute',
    left: 12,
    right: 12,
    padding: 12,
    gap: 10,
    borderRadius: 12,
    backgroundColor: CONTROL_BACKGROUND,
  },
  track: {
    height: 24,
    justifyContent: 'center',
  },
  trackLine: {
    height: 4,
    borderRadius: 2,
    backgroundColor: TRACK_BACKGROUND,
    overflow: 'hidden',
  },
  trackFill: {
    height: 4,
    backgroundColor: CONTROL_TEXT,
  },
  buttonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  timeText: {
    color: CONTROL_TEXT,
    fontSize: 13,
  },
  buttons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  controlButton: {
    minWidth: 44,
    minHeight: 44,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlButtonText: {
    color: CONTROL_TEXT,
    fontSize: 16,
  },
});
