import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import Slider from '@react-native-community/slider';
import * as MediaLibrary from 'expo-media-library';
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import { NestableDraggableFlatList, NestableScrollContainer, type RenderItemParams } from 'react-native-draggable-flatlist';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';

import { BUNDLED_MUSIC_TRACKS } from '../../assets/music/bundled';
import { AppBannerAd } from '../ads/AppBannerAd';
import {
  getAlbumByDeviceId,
  getMusicTracksBySettingsId,
  getSelectedPhotoCount,
  getSlideshowDefaults,
  getSlideshowSettingsByAlbumId,
  insertAlbum,
  setSlideshowMusicTracks,
  updateAlbumDisplayName,
  upsertMusicTrack,
  upsertSlideshowSettings,
} from '../db/client';
import type { Album, MusicSourceType, OrderMode, RepeatMode } from '../db/types';
import { resolveDeviceTrackMetadata } from '../music/resolveTrackMetadata';
import type { PhotoSortCriterion, PhotoSortDirection } from '../photos/photoSort';
import {
  FALLBACK_ORDER_MODE,
  FALLBACK_REPEAT_MODE,
  FALLBACK_SORT_CRITERION,
  FALLBACK_SORT_DIRECTION,
  FALLBACK_TRANSITION_INTERVAL_SEC,
  TRANSITION_INTERVAL_MAX_SEC,
  TRANSITION_INTERVAL_MIN_SEC,
} from '../settings/slideshowDefaults';
import type { RootStackParamList } from '../../App';
import type { ThemeColors } from '../theme/colors';
import { useAppTheme } from '../theme/ThemeContext';
import { MusicPickerModal } from './MusicPickerModal';

const SORT_CRITERION_OPTIONS: ReadonlyArray<{ criterion: PhotoSortCriterion; labelKey: string }> = [
  { criterion: 'creation_time', labelKey: 'common:sortCriterion.captureTime' },
  { criterion: 'filename', labelKey: 'common:sortCriterion.filename' },
];

const SORT_DIRECTION_OPTIONS: ReadonlyArray<{ direction: PhotoSortDirection; labelKey: string }> = [
  { direction: 'desc', labelKey: 'common:sortDirection.descending' },
  { direction: 'asc', labelKey: 'common:sortDirection.ascending' },
];

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

// 60초 미만은 초 단위, 1시간 미만은 분+초("5초 × 13장 = 65초" → "1분 5초"), 1시간 이상은
// 시간+분(초는 생략, "3665초" → "1시간 1분")으로 표시한다. 분으로만 반올림하면(구버전)
// 60초 미만 나머지가 사라져 65초/119초가 똑같이 "1분"·"2분"으로 뭉개지는 문제가 있었고,
// 1시간을 넘겨도 "61분"처럼 분 단위로만 커지면 가독성이 떨어져 시간 단위를 별도로 뗀다.
function formatEstimatedDuration(totalSeconds: number, t: TFunction): string {
  if (totalSeconds < 60) return t('common:seconds', { count: totalSeconds });
  if (totalSeconds < 3600) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return seconds === 0
      ? t('common:durationMinutes', { count: minutes })
      : `${t('common:durationMinutes', { count: minutes })} ${t('common:seconds', { count: seconds })}`;
  }
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  return minutes === 0
    ? t('common:durationHours', { count: hours })
    : `${t('common:durationHours', { count: hours })} ${t('common:durationMinutes', { count: minutes })}`;
}

// 번들 음악 커버는 빌드 타임에 추출해둔 정적 에셋(require() 결과, number)이라 DB에 저장하지
// 않고 매번 BUNDLED_MUSIC_TRACKS에서 다시 찾는다 — 기기 음악만 캐시 파일 경로(string)를 쓴다.
function getCoverSource(music: SelectedMusic): string | number | null {
  if (music.sourceType === 'bundled') {
    return BUNDLED_MUSIC_TRACKS.find((track) => track.id === music.sourceValue)?.cover ?? null;
  }
  return music.coverUri;
}

type AlbumSettingsScreenProps = NativeStackScreenProps<RootStackParamList, 'AlbumSettings'>;

export function AlbumSettingsScreen({ route }: AlbumSettingsScreenProps) {
  const { deviceAlbumId, displayName } = route.params;
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'AlbumSettings'>>();

  const { colors: c } = useAppTheme();
  const { t } = useTranslation('albumSettings');
  const styles = useMemo(() => createStyles(c), [c]);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [musicLoadError, setMusicLoadError] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [album, setAlbum] = useState<Album | null>(null);
  const [totalPhotoCount, setTotalPhotoCount] = useState<number | null>(null);
  const [selectedPhotoCount, setSelectedPhotoCount] = useState<number | null>(null);
  const [transitionIntervalSec, setTransitionIntervalSec] = useState(FALLBACK_TRANSITION_INTERVAL_SEC);
  const [orderMode, setOrderMode] = useState<OrderMode>(FALLBACK_ORDER_MODE);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>(FALLBACK_REPEAT_MODE);
  const [sortCriterion, setSortCriterion] = useState<PhotoSortCriterion>(FALLBACK_SORT_CRITERION);
  const [sortDirection, setSortDirection] = useState<PhotoSortDirection>(FALLBACK_SORT_DIRECTION);
  const [selectedMusicList, setSelectedMusicList] = useState<SelectedMusic[]>([]);
  const [pickerVisible, setPickerVisible] = useState(false);
  const alreadySelectedKeys = useMemo(() => new Set(selectedMusicList.map(musicKey)), [selectedMusicList]);
  // "재생할 사진" 섹션과 동일한 규칙 — 개별 선택된 사진이 있으면 그 수, 없으면 앨범 전체 수.
  const effectivePhotoCount = selectedPhotoCount && selectedPhotoCount > 0 ? selectedPhotoCount : totalPhotoCount;

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
          setSortCriterion(settings.sortCriterion);
          setSortDirection(settings.sortDirection);
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
        } else {
          // 컨트롤을 한 번도 안 건드린 신규 앨범 — 앱 설정(SlideshowDefaultsScreen)에서
          // 사용자가 지정해둔 기본값을 초기 상태로 반영한다.
          const defaults = await getSlideshowDefaults();
          if (cancelled) return;
          setTransitionIntervalSec(defaults.transitionIntervalSec);
          setOrderMode(defaults.orderMode);
          setRepeatMode(defaults.repeatMode);
          setSortCriterion(defaults.sortCriterion);
          setSortDirection(defaults.sortDirection);
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

  useEffect(() => {
    let cancelled = false;
    new MediaLibrary.Query()
      .album(new MediaLibrary.Album(deviceAlbumId))
      .eq(MediaLibrary.AssetField.MEDIA_TYPE, MediaLibrary.MediaType.IMAGE)
      .exeForMetadata()
      .then((result) => {
        if (!cancelled) setTotalPhotoCount(result.length);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [deviceAlbumId]);

  // native-stack은 사진 선택 화면에서 이 화면으로 되돌아와도 이 화면을 unmount하지
  // 않는다(AlbumListScreen이 숨김 폴더 pub/sub을 쓰는 것과 같은 이유, 그쪽 주석 참고) —
  // mount 시 이펙트만으로는 사진 선택 화면에서 바뀐 선택 개수가 반영되지 않으므로
  // focus 시점마다 다시 조회한다.
  useFocusEffect(
    useCallback(() => {
      if (!album) return;
      let cancelled = false;
      getSelectedPhotoCount(album.id).then((count) => {
        if (!cancelled) setSelectedPhotoCount(count);
      });
      return () => {
        cancelled = true;
      };
    }, [album])
  );

  async function persist(overrides: {
    transitionIntervalSec?: number;
    orderMode?: OrderMode;
    repeatMode?: RepeatMode;
    sortCriterion?: PhotoSortCriterion;
    sortDirection?: PhotoSortDirection;
    selectedMusicList?: SelectedMusic[];
  }) {
    if (!album) return;
    const next = {
      transitionIntervalSec,
      orderMode,
      repeatMode,
      sortCriterion,
      sortDirection,
      selectedMusicList,
      ...overrides,
    };
    const run = async () => {
      const settings = await upsertSlideshowSettings(
        album.id,
        next.transitionIntervalSec,
        next.orderMode,
        next.repeatMode,
        next.sortCriterion,
        next.sortDirection
      );
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
        {loadError ? <Text style={styles.errorText}>{t('loadError')}</Text> : <ActivityIndicator />}
      </View>
    );
  }

  function handleOrderModeChange(mode: OrderMode) {
    setOrderMode(mode);
    persist({ orderMode: mode });
  }

  function handleSortCriterionChange(criterion: PhotoSortCriterion) {
    setSortCriterion(criterion);
    persist({ sortCriterion: criterion });
  }

  function handleSortDirectionChange(direction: PhotoSortDirection) {
    setSortDirection(direction);
    persist({ sortDirection: direction });
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
          <Text style={styles.musicRowAction}>{t('removeButtonLabel')}</Text>
        </Pressable>
      </Pressable>
    );
  }

  return (
    <View style={styles.container}>
      <NestableScrollContainer style={styles.scroll} contentContainerStyle={styles.content}>
      {saveError && <Text style={styles.errorText}>{t('saveError')}</Text>}
      {musicLoadError && <Text style={styles.errorText}>{t('musicLoadError')}</Text>}

      <Pressable
        testID="slideshow-start-button"
        style={styles.startButton}
        onPress={() => navigation.navigate('SlideshowPlayer', { albumId: album.id, deviceAlbumId })}
      >
        <Text style={styles.startButtonText}>{t('startButton')}</Text>
      </Pressable>

      <Text style={styles.sectionTitle}>{t('selectedPhotosSectionTitle')}</Text>
      <Text style={styles.sectionValue}>
        {selectedPhotoCount === null || selectedPhotoCount === 0
          ? totalPhotoCount !== null
            ? t('totalPhotosWithCount', { count: totalPhotoCount })
            : t('totalPhotosLabel')
          : t('common:photoSelectedCount', { count: selectedPhotoCount })}
      </Text>
      <ToggleButton
        label={t('common:screenTitle.photoSelection')}
        active={false}
        onPress={() => album && navigation.navigate('PhotoSelection', { albumId: album.id, deviceAlbumId, displayName })}
        fullWidth
      />

      <Text style={styles.sectionTitle}>{t('common:transitionIntervalLabel')}</Text>
      <Text style={styles.sectionValue}>
        {t('common:seconds', { count: transitionIntervalSec })}
        {effectivePhotoCount !== null && effectivePhotoCount > 0
          ? t('estimatedDurationSuffix', { duration: formatEstimatedDuration(transitionIntervalSec * effectivePhotoCount, t) })
          : ''}
      </Text>
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

      <Text style={styles.sectionTitle}>{t('common:sortCriterionSectionLabel')}</Text>
      {orderMode === 'random' && <Text style={styles.emptyText}>{t('common:randomOrderHint')}</Text>}
      <View style={styles.row}>
        {SORT_CRITERION_OPTIONS.map((option) => (
          <ToggleButton
            key={option.criterion}
            testID={`sort-criterion-${option.criterion}`}
            label={t(option.labelKey)}
            active={sortCriterion === option.criterion}
            disabled={orderMode === 'random'}
            onPress={() => handleSortCriterionChange(option.criterion)}
          />
        ))}
      </View>
      <View style={styles.row}>
        {SORT_DIRECTION_OPTIONS.map((option) => (
          <ToggleButton
            key={option.direction}
            testID={`sort-direction-${option.direction}`}
            label={t(option.labelKey)}
            active={sortDirection === option.direction}
            disabled={orderMode === 'random'}
            onPress={() => handleSortDirectionChange(option.direction)}
          />
        ))}
      </View>

      <Text style={styles.sectionTitle}>{t('common:orderMode.label')}</Text>
      <View style={styles.row}>
        <ToggleButton
          label={t('common:orderMode.sequential')}
          active={orderMode === 'sequential'}
          onPress={() => handleOrderModeChange('sequential')}
        />
        <ToggleButton
          label={t('common:orderMode.random')}
          active={orderMode === 'random'}
          onPress={() => handleOrderModeChange('random')}
        />
      </View>

      <Text style={styles.sectionTitle}>{t('common:repeatMode.label')}</Text>
      <View style={styles.row}>
        <ToggleButton
          label={t('common:repeatMode.once')}
          active={repeatMode === 'once'}
          onPress={() => handleRepeatModeChange('once')}
        />
        <ToggleButton
          label={t('common:repeatMode.loop')}
          active={repeatMode === 'loop'}
          onPress={() => handleRepeatModeChange('loop')}
        />
      </View>

      <Text style={styles.sectionTitle}>{t('musicSectionTitle')}</Text>
      {selectedMusicList.length === 0 ? (
        <Text style={styles.emptyText}>{t('noMusicSelected')}</Text>
      ) : (
        <Text style={styles.emptyText}>{t('reorderHint')}</Text>
      )}
      <NestableDraggableFlatList
        data={selectedMusicList}
        keyExtractor={musicKey}
        renderItem={renderMusicItem}
        onDragEnd={({ data }) => handleMusicDragEnd(data)}
      />

      <ToggleButton label={t('common:musicAddLabel')} active={false} onPress={() => setPickerVisible(true)} fullWidth />

      <MusicPickerModal
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
        alreadySelectedKeys={alreadySelectedKeys}
        onSelectTracks={(tracks) => addMusicBatch(tracks)}
      />
      </NestableScrollContainer>
      <AppBannerAd />
    </View>
  );
}

function ToggleButton({
  label,
  active,
  onPress,
  fullWidth,
  disabled,
  testID,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  fullWidth?: boolean;
  disabled?: boolean;
  testID?: string;
}) {
  const { colors: c } = useAppTheme();
  const styles = useMemo(() => createStyles(c), [c]);
  return (
    <Pressable
      testID={testID}
      style={[
        styles.toggleButton,
        active && styles.toggleButtonActive,
        fullWidth && styles.toggleButtonFullWidth,
        disabled && styles.toggleButtonDisabled,
      ]}
      onPress={onPress}
      disabled={disabled}
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
    scroll: {
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
    toggleButtonDisabled: {
      opacity: 0.4,
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
    startButton: {
      marginBottom: 24,
      paddingVertical: 14,
      borderRadius: 8,
      backgroundColor: c.accent,
      alignItems: 'center',
    },
    startButtonText: {
      fontSize: 16,
      fontWeight: '700',
      color: '#fff',
    },
  });
}
