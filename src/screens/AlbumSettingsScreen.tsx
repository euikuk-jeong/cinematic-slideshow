import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Slider from '@react-native-community/slider';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { BUNDLED_MUSIC_TRACKS } from '../../assets/music/bundled';
import {
  getAlbumByDeviceId,
  getMusicTrackById,
  getSlideshowSettingsByAlbumId,
  insertAlbum,
  updateAlbumDisplayName,
  upsertMusicTrack,
  upsertSlideshowSettings,
} from '../db/client';
import type { Album, MusicSourceType, OrderMode, RepeatMode } from '../db/types';
import type { RootStackParamList } from '../../App';
import { colors } from '../theme/colors';
import { DeviceMusicPickerModal } from './DeviceMusicPickerModal';

const TRANSITION_INTERVAL_MIN_SEC = 2;
const TRANSITION_INTERVAL_MAX_SEC = 10;

interface SelectedMusic {
  sourceType: MusicSourceType;
  sourceValue: string;
  title: string | null;
}

type AlbumSettingsScreenProps = NativeStackScreenProps<RootStackParamList, 'AlbumSettings'>;

export function AlbumSettingsScreen({ route }: AlbumSettingsScreenProps) {
  const { deviceAlbumId, displayName } = route.params;

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [musicLoadError, setMusicLoadError] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [album, setAlbum] = useState<Album | null>(null);
  const [transitionIntervalSec, setTransitionIntervalSec] = useState(4);
  const [orderMode, setOrderMode] = useState<OrderMode>('sequential');
  const [repeatMode, setRepeatMode] = useState<RepeatMode>('loop');
  const [selectedMusic, setSelectedMusic] = useState<SelectedMusic | null>(null);
  const [devicePickerVisible, setDevicePickerVisible] = useState(false);

  // 저장 요청이 겹칠 때(연타) DB에 늦게 도착한 요청이 먼저 완료돼 최신 UI 상태와
  // DB가 어긋나지 않도록, 모든 persist() 호출을 이 큐에 순서대로 이어붙여 실행한다.
  const persistQueueRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const existing = await getAlbumByDeviceId(deviceAlbumId);
        let resolvedAlbum = existing ?? (await insertAlbum(deviceAlbumId, displayName));
        if (existing && existing.displayName !== displayName) {
          await updateAlbumDisplayName(existing.id, displayName);
          resolvedAlbum = { ...existing, displayName };
        }
        const settings = await getSlideshowSettingsByAlbumId(resolvedAlbum.id);
        if (cancelled) return;

        setAlbum(resolvedAlbum);
        if (settings) {
          setTransitionIntervalSec(settings.transitionIntervalSec);
          setOrderMode(settings.orderMode);
          setRepeatMode(settings.repeatMode);
          if (settings.musicTrackId != null) {
            // 앨범/설정 로드는 이미 끝났으니, 음악 트랙 조회 실패로 전체 화면을
            // loadError로 덮어버리지 않고 이 항목만 별도로 실패를 알린다.
            try {
              const track = await getMusicTrackById(settings.musicTrackId);
              if (!cancelled && track) {
                setSelectedMusic({ sourceType: track.sourceType, sourceValue: track.sourceValue, title: track.title });
              }
            } catch {
              if (!cancelled) setMusicLoadError(true);
            }
          }
        }
      } catch {
        if (!cancelled) setLoadError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [deviceAlbumId, displayName]);

  async function persist(overrides: {
    transitionIntervalSec?: number;
    orderMode?: OrderMode;
    repeatMode?: RepeatMode;
    selectedMusic?: SelectedMusic | null;
  }) {
    if (!album) return;
    const next = {
      transitionIntervalSec,
      orderMode,
      repeatMode,
      selectedMusic,
      ...overrides,
    };
    const run = async () => {
      let musicTrackId: number | null = null;
      if (next.selectedMusic) {
        const track = await upsertMusicTrack(
          next.selectedMusic.sourceType,
          next.selectedMusic.sourceValue,
          next.selectedMusic.title
        );
        musicTrackId = track.id;
      }
      await upsertSlideshowSettings(album.id, next.transitionIntervalSec, next.orderMode, next.repeatMode, musicTrackId);
    };
    // 이전 저장이 실패해도(.catch로 흡수) 큐가 멈추지 않고 다음 저장을 이어서 시도한다.
    const queued = persistQueueRef.current.catch(() => {}).then(run);
    persistQueueRef.current = queued;
    try {
      await queued;
      setSaveError(false);
    } catch {
      setSaveError(true);
    }
  }

  if (loading || !album) {
    return (
      <View style={styles.centered}>
        {loadError ? <Text style={styles.errorText}>설정을 불러오지 못했어요</Text> : <ActivityIndicator />}
      </View>
    );
  }

  function handleOrderModeChange(mode: OrderMode) {
    setOrderMode(mode);
    persist({ orderMode: mode });
  }

  function handleRepeatModeChange(mode: RepeatMode) {
    setRepeatMode(mode);
    persist({ repeatMode: mode });
  }

  function handleSlidingComplete(value: number) {
    const rounded = Math.round(value);
    setTransitionIntervalSec(rounded);
    persist({ transitionIntervalSec: rounded });
  }

  function handleSelectMusic(music: SelectedMusic | null) {
    setSelectedMusic(music);
    persist({ selectedMusic: music });
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {saveError && <Text style={styles.errorText}>설정 저장에 실패했어요. 다시 시도해주세요</Text>}
      {musicLoadError && <Text style={styles.errorText}>저장된 배경음악 정보를 불러오지 못했어요</Text>}
      <Text style={styles.sectionTitle}>전환 간격</Text>
      <Text style={styles.sectionValue}>{transitionIntervalSec}초</Text>
      <Slider
        testID="transition-interval-slider"
        minimumValue={TRANSITION_INTERVAL_MIN_SEC}
        maximumValue={TRANSITION_INTERVAL_MAX_SEC}
        step={1}
        value={transitionIntervalSec}
        onSlidingComplete={handleSlidingComplete}
        minimumTrackTintColor={colors.accent}
        thumbTintColor={colors.accent}
        maximumTrackTintColor={colors.hairline}
      />

      <Text style={styles.sectionTitle}>순서</Text>
      <View style={styles.row}>
        <ToggleButton label="순차" active={orderMode === 'sequential'} onPress={() => handleOrderModeChange('sequential')} />
        <ToggleButton label="랜덤" active={orderMode === 'random'} onPress={() => handleOrderModeChange('random')} />
      </View>

      <Text style={styles.sectionTitle}>반복</Text>
      <View style={styles.row}>
        <ToggleButton label="1회 재생" active={repeatMode === 'once'} onPress={() => handleRepeatModeChange('once')} />
        <ToggleButton label="무한 반복" active={repeatMode === 'loop'} onPress={() => handleRepeatModeChange('loop')} />
      </View>

      <Text style={styles.sectionTitle}>배경음악</Text>
      <ToggleButton label="없음" active={selectedMusic === null} onPress={() => handleSelectMusic(null)} fullWidth />
      {BUNDLED_MUSIC_TRACKS.map((track) => (
        <ToggleButton
          key={track.category}
          label={`${track.title} (${track.artist})`}
          active={selectedMusic?.sourceType === 'bundled' && selectedMusic.sourceValue === track.category}
          onPress={() => handleSelectMusic({ sourceType: 'bundled', sourceValue: track.category, title: track.title })}
          fullWidth
        />
      ))}
      {Platform.OS === 'android' && (
        <ToggleButton
          label={
            selectedMusic?.sourceType === 'device' ? `기기 음악: ${selectedMusic.title ?? selectedMusic.sourceValue}` : '기기에서 선택'
          }
          active={selectedMusic?.sourceType === 'device'}
          onPress={() => setDevicePickerVisible(true)}
          fullWidth
        />
      )}

      {Platform.OS === 'android' && (
        <DeviceMusicPickerModal
          visible={devicePickerVisible}
          onClose={() => setDevicePickerVisible(false)}
          onSelect={(track) => handleSelectMusic({ sourceType: 'device', sourceValue: track.sourceValue, title: track.title })}
        />
      )}
    </ScrollView>
  );
}

function ToggleButton({
  label,
  active,
  onPress,
  fullWidth,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  fullWidth?: boolean;
}) {
  return (
    <Pressable
      style={[styles.toggleButton, active && styles.toggleButtonActive, fullWidth && styles.toggleButtonFullWidth]}
      onPress={onPress}
    >
      <Text style={[styles.toggleButtonText, active && styles.toggleButtonTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 20,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
    marginTop: 20,
    marginBottom: 8,
  },
  sectionValue: {
    fontSize: 16,
    color: colors.ink,
    marginBottom: 8,
  },
  errorText: {
    fontSize: 14,
    color: colors.accent,
    marginBottom: 12,
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  toggleButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.hairline,
    marginBottom: 8,
  },
  toggleButtonFullWidth: {
    alignSelf: 'stretch',
  },
  toggleButtonActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  toggleButtonText: {
    fontSize: 14,
    color: colors.ink,
    textAlign: 'center',
  },
  toggleButtonTextActive: {
    color: colors.accent,
    fontWeight: '600',
  },
});
