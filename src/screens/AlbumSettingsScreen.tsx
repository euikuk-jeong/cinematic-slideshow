import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Slider from '@react-native-community/slider';
import * as MediaLibrary from 'expo-media-library';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { NestableDraggableFlatList, NestableScrollContainer, type RenderItemParams } from 'react-native-draggable-flatlist';

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
import { resolveDeviceTrackMetadata } from '../music/resolveTrackMetadata';
import type { RootStackParamList } from '../../App';
import type { ThemeColors } from '../theme/colors';
import { useAppTheme } from '../theme/ThemeContext';
import { MusicPickerModal } from './MusicPickerModal';

const TRANSITION_INTERVAL_MIN_SEC = 2;
const TRANSITION_INTERVAL_MAX_SEC = 10;

interface SelectedMusic {
  sourceType: MusicSourceType;
  sourceValue: string;
  title: string | null;
  artist: string | null;
  coverUri: string | null;
}

function musicKey(music: SelectedMusic): string {
  return `${music.sourceType}:${music.sourceValue}`;
}

// 번들 음악 커버는 빌드 타임에 추출해둔 정적 에셋(require() 결과, number)이라 DB에 저장하지
// 않고 매번 BUNDLED_MUSIC_TRACKS에서 다시 찾는다 — 기기 음악만 캐시 파일 경로(string)를 쓴다.
function getCoverSource(music: SelectedMusic): string | number | null {
  if (music.sourceType === 'bundled') {
    return BUNDLED_MUSIC_TRACKS.find((track) => track.category === music.sourceValue)?.cover ?? null;
  }
  return music.coverUri;
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
  const [pickerVisible, setPickerVisible] = useState(false);
  const alreadySelectedKeys = useMemo(() => new Set(selectedMusicList.map(musicKey)), [selectedMusicList]);

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
                tracks.map((track) => ({
                  sourceType: track.sourceType,
                  sourceValue: track.sourceValue,
                  title: track.title,
                  artist: track.artist,
                  coverUri: track.coverUri,
                }))
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

  // 재생목록에 있는 기기 음악 중 아직 태그를 못 읽은(artist/coverUri가 둘 다 null인)
  // 트랙을 백그라운드에서 순서대로 해석해 채운다 — 픽커에서 곧바로 선택해 아직 못 읽었거나,
  // 이 기능이 생기기 전에 추가된 기존 트랙이 대상. upsertMusicTrack의 COALESCE 덕에
  // persist() 큐와 동시에 호출돼도 값을 지우는 방향으로 어긋나지 않아 별도 큐잉 없이 직접 쓴다.
  useEffect(() => {
    const unresolved = selectedMusicList.filter(
      (music) => music.sourceType === 'device' && music.artist === null && music.coverUri === null
    );
    if (unresolved.length === 0) return;
    let cancelled = false;
    (async () => {
      for (const music of unresolved) {
        if (cancelled) return;
        const uri = await new MediaLibrary.Asset(music.sourceValue).getUri().catch(() => null);
        if (!uri || cancelled) continue;
        const resolved = await resolveDeviceTrackMetadata(music.sourceValue, uri);
        if (!resolved || cancelled) continue;
        const resolvedTitle = resolved.title ?? music.title;
        setSelectedMusicList((prev) =>
          prev.map((m) =>
            m.sourceType === 'device' && m.sourceValue === music.sourceValue
              ? { ...m, title: resolvedTitle, artist: resolved.artist, coverUri: resolved.coverUri }
              : m
          )
        );
        await upsertMusicTrack('device', music.sourceValue, resolvedTitle, resolved.artist, resolved.coverUri).catch(() => {});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedMusicList]);

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
        const track = await upsertMusicTrack(music.sourceType, music.sourceValue, music.title, music.artist, music.coverUri);
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

  function removeMusicByKey(key: string) {
    const next = selectedMusicList.filter((music) => musicKey(music) !== key);
    setSelectedMusicList(next);
    persist({ selectedMusicList: next });
  }

  function handleMusicDragEnd(next: SelectedMusic[]) {
    setSelectedMusicList(next);
    persist({ selectedMusicList: next });
  }

  function renderMusicItem({ item, getIndex, drag, isActive }: RenderItemParams<SelectedMusic>) {
    const key = musicKey(item);
    const index = getIndex() ?? 0;
    const coverSource = getCoverSource(item);
    return (
      <Pressable
        testID={`music-row-${key}`}
        style={[styles.musicRow, isActive && styles.musicRowActive]}
        onLongPress={drag}
        disabled={isActive}
      >
        <Text testID={`music-drag-handle-${key}`} style={styles.musicRowAction}>
          ≡
        </Text>
        {coverSource ? (
          <Image source={typeof coverSource === 'number' ? coverSource : { uri: coverSource }} style={styles.musicRowCover} />
        ) : (
          <View style={styles.musicRowCoverPlaceholder}>
            <Text style={styles.musicRowCoverPlaceholderIcon}>♪</Text>
          </View>
        )}
        <View style={styles.musicRowTextGroup}>
          <Text style={styles.musicRowLabel} numberOfLines={1}>
            {index + 1}. {item.title ?? item.sourceValue}
          </Text>
          {item.artist && (
            <Text style={styles.musicRowSubLabel} numberOfLines={1}>
              {item.artist}
            </Text>
          )}
        </View>
        <Pressable testID={`music-remove-${key}`} onPress={() => removeMusicByKey(key)}>
          <Text style={styles.musicRowAction}>제거</Text>
        </Pressable>
      </Pressable>
    );
  }

  return (
    <NestableScrollContainer style={styles.container} contentContainerStyle={styles.content}>
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
        <Text style={styles.emptyText}>길게 눌러서 순서를 바꿀 수 있어요</Text>
      )}
      <NestableDraggableFlatList
        data={selectedMusicList}
        keyExtractor={musicKey}
        renderItem={renderMusicItem}
        onDragEnd={({ data }) => handleMusicDragEnd(data)}
      />

      <ToggleButton label="음악 추가" active={false} onPress={() => setPickerVisible(true)} fullWidth />

      <MusicPickerModal
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
        alreadySelectedKeys={alreadySelectedKeys}
        onSelectTracks={(tracks) => addMusicBatch(tracks)}
      />
    </NestableScrollContainer>
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
      backgroundColor: c.background,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.hairline,
    },
    musicRowActive: {
      backgroundColor: c.accentSoft,
    },
    musicRowCover: {
      width: 32,
      height: 32,
      borderRadius: 6,
    },
    musicRowCoverPlaceholder: {
      width: 32,
      height: 32,
      borderRadius: 6,
      backgroundColor: c.hairline,
      alignItems: 'center',
      justifyContent: 'center',
    },
    musicRowCoverPlaceholderIcon: {
      fontSize: 14,
      color: c.textSecondary,
    },
    musicRowTextGroup: {
      flex: 1,
    },
    musicRowLabel: {
      fontSize: 14,
      color: c.ink,
    },
    musicRowSubLabel: {
      fontSize: 12,
      color: c.textSecondary,
      marginTop: 1,
    },
    musicRowAction: {
      fontSize: 14,
      color: c.accent,
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
