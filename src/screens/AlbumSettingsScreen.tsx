import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Slider from '@react-native-community/slider';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { BUNDLED_MUSIC_TRACKS } from '../../assets/music/bundled';
import {
  getAlbumByDeviceId,
  getMusicTracksBySettingsId,
  getSlideshowSettingsByAlbumId,
  insertAlbum,
  setSlideshowMusicTracks,
  updateAlbumDisplayName,
  upsertMusicTrack,
  upsertSlideshowSettings,
} from '../db/client';
import type { Album, MusicSourceType, OrderMode, RepeatMode } from '../db/types';
import type { RootStackParamList } from '../../App';
import type { ThemeColors } from '../theme/colors';
import { useAppTheme } from '../theme/ThemeContext';
import { DeviceMusicPickerModal } from './DeviceMusicPickerModal';

const TRANSITION_INTERVAL_MIN_SEC = 2;
const TRANSITION_INTERVAL_MAX_SEC = 10;

interface SelectedMusic {
  sourceType: MusicSourceType;
  sourceValue: string;
  title: string | null;
}

function musicKey(music: SelectedMusic): string {
  return `${music.sourceType}:${music.sourceValue}`;
}

type AlbumSettingsScreenProps = NativeStackScreenProps<RootStackParamList, 'AlbumSettings'>;

export function AlbumSettingsScreen({ route }: AlbumSettingsScreenProps) {
  const { deviceAlbumId, displayName } = route.params;

  const { colors: c } = useAppTheme();
  const styles = useMemo(() => createStyles(c), [c]);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [musicLoadError, setMusicLoadError] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [album, setAlbum] = useState<Album | null>(null);
  const [transitionIntervalSec, setTransitionIntervalSec] = useState(4);
  const [orderMode, setOrderMode] = useState<OrderMode>('sequential');
  const [repeatMode, setRepeatMode] = useState<RepeatMode>('loop');
  const [selectedMusicList, setSelectedMusicList] = useState<SelectedMusic[]>([]);
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
          // 앨범/설정 로드는 이미 끝났으니, 재생목록 조회 실패로 전체 화면을
          // loadError로 덮어버리지 않고 이 항목만 별도로 실패를 알린다.
          try {
            const tracks = await getMusicTracksBySettingsId(settings.id);
            if (!cancelled) {
              setSelectedMusicList(
                tracks.map((track) => ({ sourceType: track.sourceType, sourceValue: track.sourceValue, title: track.title }))
              );
            }
          } catch {
            if (!cancelled) setMusicLoadError(true);
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
    selectedMusicList?: SelectedMusic[];
  }) {
    if (!album) return;
    const next = {
      transitionIntervalSec,
      orderMode,
      repeatMode,
      selectedMusicList,
      ...overrides,
    };
    const run = async () => {
      const settings = await upsertSlideshowSettings(album.id, next.transitionIntervalSec, next.orderMode, next.repeatMode);
      const musicTrackIds: number[] = [];
      for (const music of next.selectedMusicList) {
        const track = await upsertMusicTrack(music.sourceType, music.sourceValue, music.title);
        musicTrackIds.push(track.id);
      }
      await setSlideshowMusicTracks(settings.id, musicTrackIds);
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

  function addMusic(music: SelectedMusic) {
    addMusicBatch([music]);
  }

  function addMusicBatch(musics: readonly SelectedMusic[]) {
    // musics를 하나씩 addMusic()으로 넘기면 각 호출이 같은(리렌더 전) selectedMusicList
    // 클로저를 읽어 서로를 덮어써버린다 — 그래서 여러 곡을 한 번에 합쳐서 반영해야 한다.
    const existingKeys = new Set(selectedMusicList.map(musicKey));
    const toAdd: SelectedMusic[] = [];
    for (const music of musics) {
      const key = musicKey(music);
      if (existingKeys.has(key)) continue;
      existingKeys.add(key);
      toAdd.push(music);
    }
    if (toAdd.length === 0) return;
    const next = [...selectedMusicList, ...toAdd];
    setSelectedMusicList(next);
    persist({ selectedMusicList: next });
  }

  function removeMusicAt(index: number) {
    const next = selectedMusicList.filter((_, i) => i !== index);
    setSelectedMusicList(next);
    persist({ selectedMusicList: next });
  }

  function moveMusic(index: number, direction: -1 | 1) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= selectedMusicList.length) return;
    const next = [...selectedMusicList];
    [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
    setSelectedMusicList(next);
    persist({ selectedMusicList: next });
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
        minimumTrackTintColor={c.accent}
        thumbTintColor={c.accent}
        maximumTrackTintColor={c.hairline}
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
      {selectedMusicList.length === 0 ? (
        <Text style={styles.emptyText}>선택된 음악이 없어요</Text>
      ) : (
        selectedMusicList.map((music, index) => (
          <View key={musicKey(music)} style={styles.musicRow}>
            <Text style={styles.musicRowLabel} numberOfLines={1}>
              {index + 1}. {music.title ?? music.sourceValue}
            </Text>
            <Pressable
              testID={`music-move-up-${index}`}
              disabled={index === 0}
              onPress={() => moveMusic(index, -1)}
            >
              <Text style={[styles.musicRowAction, index === 0 && styles.musicRowActionDisabled]}>▲</Text>
            </Pressable>
            <Pressable
              testID={`music-move-down-${index}`}
              disabled={index === selectedMusicList.length - 1}
              onPress={() => moveMusic(index, 1)}
            >
              <Text style={[styles.musicRowAction, index === selectedMusicList.length - 1 && styles.musicRowActionDisabled]}>▼</Text>
            </Pressable>
            <Pressable testID={`music-remove-${index}`} onPress={() => removeMusicAt(index)}>
              <Text style={styles.musicRowAction}>제거</Text>
            </Pressable>
          </View>
        ))
      )}

      <Text style={styles.sectionSubTitle}>추가</Text>
      {BUNDLED_MUSIC_TRACKS.filter(
        (track) => !selectedMusicList.some((m) => m.sourceType === 'bundled' && m.sourceValue === track.category)
      ).map((track) => (
        <ToggleButton
          key={track.category}
          label={`${track.title} (${track.artist})`}
          active={false}
          onPress={() => addMusic({ sourceType: 'bundled', sourceValue: track.category, title: track.title })}
          fullWidth
        />
      ))}
      {Platform.OS === 'android' && (
        <ToggleButton label="기기에서 추가" active={false} onPress={() => setDevicePickerVisible(true)} fullWidth />
      )}

      {Platform.OS === 'android' && (
        <DeviceMusicPickerModal
          visible={devicePickerVisible}
          onClose={() => setDevicePickerVisible(false)}
          onSelectTracks={(tracks) =>
            addMusicBatch(tracks.map((track) => ({ sourceType: 'device', sourceValue: track.sourceValue, title: track.title })))
          }
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
  const { colors: c } = useAppTheme();
  const styles = useMemo(() => createStyles(c), [c]);
  return (
    <Pressable
      style={[styles.toggleButton, active && styles.toggleButtonActive, fullWidth && styles.toggleButtonFullWidth]}
      onPress={onPress}
    >
      <Text style={[styles.toggleButtonText, active && styles.toggleButtonTextActive]}>{label}</Text>
    </Pressable>
  );
}

function createStyles(c: ThemeColors) {
  return StyleSheet.create({
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
      color: c.textSecondary,
      marginTop: 20,
      marginBottom: 8,
    },
    sectionValue: {
      fontSize: 16,
      color: c.ink,
      marginBottom: 8,
    },
    sectionSubTitle: {
      fontSize: 12,
      fontWeight: '600',
      color: c.textSecondary,
      marginTop: 12,
      marginBottom: 8,
    },
    emptyText: {
      fontSize: 14,
      color: c.textSecondary,
      marginBottom: 8,
    },
    musicRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.hairline,
    },
    musicRowLabel: {
      flex: 1,
      fontSize: 14,
      color: c.ink,
    },
    musicRowAction: {
      fontSize: 14,
      color: c.accent,
    },
    musicRowActionDisabled: {
      color: c.hairline,
    },
    errorText: {
      fontSize: 14,
      color: c.accent,
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
      borderColor: c.hairline,
      marginBottom: 8,
    },
    toggleButtonFullWidth: {
      alignSelf: 'stretch',
    },
    toggleButtonActive: {
      borderColor: c.accent,
      backgroundColor: c.accentSoft,
    },
    toggleButtonText: {
      fontSize: 14,
      color: c.ink,
      textAlign: 'center',
    },
    toggleButtonTextActive: {
      color: c.accent,
      fontWeight: '600',
    },
  });
}
