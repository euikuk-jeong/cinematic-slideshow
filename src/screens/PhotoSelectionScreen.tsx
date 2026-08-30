import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, SectionList, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as MediaLibrary from 'expo-media-library';

import type { RootStackParamList } from '../../App';
import { BannerAdPlaceholder } from '../ads/BannerAdPlaceholder';
import { addSelectedPhoto, getSelectedPhotoIds, removeSelectedPhoto, setSelectedPhotoIds } from '../db/client';
import {
  chunkItems,
  groupPhotosByDate,
  sortPhotos,
  type PhotoMetadata,
  type PhotoSortCriterion,
  type PhotoSortDirection,
} from '../photos/photoSort';
import type { ThemeColors } from '../theme/colors';
import { useAppTheme } from '../theme/ThemeContext';

type PhotoSelectionScreenProps = NativeStackScreenProps<RootStackParamList, 'PhotoSelection'>;
type PhotoViewMode = 'grid' | 'list' | 'date';

const GRID_COLUMNS = 3;
const GRID_GAP = 3;
const GRID_PADDING = 3;

const SORT_CRITERION_OPTIONS: ReadonlyArray<{ criterion: PhotoSortCriterion; label: string }> = [
  { criterion: 'creation_time', label: '촬영 시간' },
  { criterion: 'filename', label: '파일명' },
];

const SORT_DIRECTION_OPTIONS: ReadonlyArray<{ direction: PhotoSortDirection; label: string }> = [
  { direction: 'desc', label: '내림차순' },
  { direction: 'asc', label: '오름차순' },
];

const VIEW_MODE_OPTIONS: ReadonlyArray<{ mode: PhotoViewMode; label: string }> = [
  { mode: 'grid', label: '그리드' },
  { mode: 'list', label: '리스트' },
  { mode: 'date', label: '날짜별' },
];

// 화면에 마운트된(FlatList/SectionList windowing 대상) 행만 uri를 조회하므로, 앨범
// 사진이 수천 장이어도 한 번에 조회되는 건 보이는 만큼뿐이다 — MusicPickerModal이
// 오디오 전체를 미리 getInfo()로 조회하다 겪은 문제(실기기 OOM)와 같은 경로를 피한다.
const photoUriCache = new Map<string, string>();

function usePhotoUri(id: string): string | null {
  const [uri, setUri] = useState<string | null>(photoUriCache.get(id) ?? null);
  useEffect(() => {
    const cached = photoUriCache.get(id);
    if (cached) {
      setUri(cached);
      return;
    }
    let cancelled = false;
    new MediaLibrary.Asset(id)
      .getUri()
      .then((resolved) => {
        photoUriCache.set(id, resolved);
        if (!cancelled) setUri(resolved);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [id]);
  return uri;
}

export function PhotoSelectionScreen({ route }: PhotoSelectionScreenProps) {
  const { albumId, deviceAlbumId } = route.params;
  const { colors: c } = useAppTheme();
  const styles = useMemo(() => createStyles(c), [c]);
  const { width: windowWidth } = useWindowDimensions();

  const [photos, setPhotos] = useState<PhotoMetadata[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sortCriterion, setSortCriterion] = useState<PhotoSortCriterion>('creation_time');
  const [sortDirection, setSortDirection] = useState<PhotoSortDirection>('desc');
  const [viewMode, setViewMode] = useState<PhotoViewMode>('grid');

  useEffect(() => {
    let cancelled = false;
    new MediaLibrary.Query()
      .album(new MediaLibrary.Album(deviceAlbumId))
      .eq(MediaLibrary.AssetField.MEDIA_TYPE, MediaLibrary.MediaType.IMAGE)
      .exeForMetadata()
      .then((result) => {
        if (cancelled) return;
        setPhotos(result.map((m) => ({ id: m.id, filename: m.filename, creationTime: m.creationTime })));
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [deviceAlbumId]);

  useEffect(() => {
    let cancelled = false;
    getSelectedPhotoIds(albumId).then((ids) => {
      if (!cancelled) setSelectedIds(new Set(ids));
    });
    return () => {
      cancelled = true;
    };
  }, [albumId]);

  function toggle(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        removeSelectedPhoto(albumId, id).catch(() => {});
      } else {
        next.add(id);
        addSelectedPhoto(albumId, id).catch(() => {});
      }
      return next;
    });
  }

  function selectAll() {
    if (!photos || photos.length === 0) return;
    const ids = photos.map((p) => p.id);
    setSelectedIds(new Set(ids));
    setSelectedPhotoIds(albumId, ids).catch(() => {});
  }

  // "전체 해제" = album_selected_photos row를 전부 비워 "전체 사진 재생(기본값)"으로
  // 되돌린다. 한 번 "전체 선택"을 누르면 그 순간의 사진 목록이 고정 스냅샷으로
  // 저장돼버려(이후 새로 추가된 사진이 재생에서 빠짐) 이 경로가 없으면 앨범 정렬
  // 기준 문제(todo.md 참고)와 같은 함정에 빠진다.
  function deselectAll() {
    setSelectedIds(new Set());
    setSelectedPhotoIds(albumId, []).catch(() => {});
  }

  const sortedPhotos = useMemo(() => (photos ? sortPhotos(photos, sortCriterion, sortDirection) : []), [photos, sortCriterion, sortDirection]);
  const dateSections = useMemo(
    () =>
      viewMode === 'date'
        ? groupPhotosByDate(sortedPhotos).map((section) => ({
            key: section.key,
            title: section.label,
            data: chunkItems(section.items, GRID_COLUMNS).map((row, index) => ({ rowKey: `${section.key}-${index}`, row })),
          }))
        : [],
    [viewMode, sortedPhotos]
  );

  const gridItemSize = (windowWidth - GRID_PADDING * 2 - GRID_GAP * (GRID_COLUMNS - 1)) / GRID_COLUMNS;

  function renderControlsHeader() {
    const statusText = selectedIds.size === 0 ? `전체 사진 재생 (${sortedPhotos.length}장)` : `${selectedIds.size}장 선택됨`;
    return (
      <View style={styles.controls}>
        <Text style={styles.statusText}>{statusText}</Text>
        <View style={styles.row}>
          <SmallButton testID="photo-select-all" label="전체 선택" onPress={selectAll} styles={styles} />
          <SmallButton
            testID="photo-deselect-all"
            label="전체 해제"
            onPress={deselectAll}
            disabled={selectedIds.size === 0}
            styles={styles}
          />
        </View>

        <Text style={styles.sectionTitle}>정렬 기준</Text>
        <View style={styles.row}>
          {SORT_CRITERION_OPTIONS.map((option) => (
            <ToggleButton
              key={option.criterion}
              testID={`photo-sort-criterion-${option.criterion}`}
              label={option.label}
              active={sortCriterion === option.criterion}
              onPress={() => setSortCriterion(option.criterion)}
              styles={styles}
            />
          ))}
        </View>
        <View style={styles.row}>
          {SORT_DIRECTION_OPTIONS.map((option) => (
            <ToggleButton
              key={option.direction}
              testID={`photo-sort-direction-${option.direction}`}
              label={option.label}
              active={sortDirection === option.direction}
              onPress={() => setSortDirection(option.direction)}
              styles={styles}
            />
          ))}
        </View>

        <Text style={styles.sectionTitle}>보기 방식</Text>
        <View style={styles.row}>
          {VIEW_MODE_OPTIONS.map((option) => (
            <ToggleButton
              key={option.mode}
              testID={`photo-view-mode-${option.mode}`}
              label={option.label}
              active={viewMode === option.mode}
              onPress={() => setViewMode(option.mode)}
              styles={styles}
            />
          ))}
        </View>
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>사진 목록을 불러오지 못했어요</Text>
      </View>
    );
  }

  if (photos === null) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      {viewMode === 'date' ? (
        <SectionList
          sections={dateSections}
          keyExtractor={(item) => item.rowKey}
          stickySectionHeadersEnabled={false}
          ListHeaderComponent={renderControlsHeader}
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionHeaderText}>{section.title}</Text>
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.centered}>
              <Text style={styles.emptyText}>사진이 없어요</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.gridRow}>
              {item.row.map((photo) => (
                <PhotoGridItem
                  key={photo.id}
                  item={photo}
                  size={gridItemSize}
                  selected={selectedIds.has(photo.id)}
                  onToggle={() => toggle(photo.id)}
                />
              ))}
            </View>
          )}
        />
      ) : viewMode === 'grid' ? (
        <FlatList
          key={`grid-${GRID_COLUMNS}`}
          data={sortedPhotos}
          numColumns={GRID_COLUMNS}
          keyExtractor={(item) => item.id}
          columnWrapperStyle={styles.gridRow}
          ListHeaderComponent={renderControlsHeader}
          ListEmptyComponent={
            <View style={styles.centered}>
              <Text style={styles.emptyText}>사진이 없어요</Text>
            </View>
          }
          renderItem={({ item }) => (
            <PhotoGridItem item={item} size={gridItemSize} selected={selectedIds.has(item.id)} onToggle={() => toggle(item.id)} />
          )}
        />
      ) : (
        <FlatList
          key="list"
          data={sortedPhotos}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={renderControlsHeader}
          ListEmptyComponent={
            <View style={styles.centered}>
              <Text style={styles.emptyText}>사진이 없어요</Text>
            </View>
          }
          renderItem={({ item }) => <PhotoListItem item={item} selected={selectedIds.has(item.id)} onToggle={() => toggle(item.id)} />}
        />
      )}
      <BannerAdPlaceholder />
    </View>
  );
}

function SmallButton({
  testID,
  label,
  onPress,
  disabled,
  styles,
}: {
  testID: string;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <Pressable testID={testID} style={[styles.smallButton, disabled && styles.smallButtonDisabled]} onPress={onPress} disabled={disabled}>
      <Text style={[styles.smallButtonText, disabled && styles.smallButtonTextDisabled]}>{label}</Text>
    </Pressable>
  );
}

function ToggleButton({
  testID,
  label,
  active,
  onPress,
  styles,
}: {
  testID: string;
  label: string;
  active: boolean;
  onPress: () => void;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <Pressable testID={testID} style={[styles.toggleButton, active && styles.toggleButtonActive]} onPress={onPress}>
      <Text style={[styles.toggleButtonText, active && styles.toggleButtonTextActive]}>{label}</Text>
    </Pressable>
  );
}

function PhotoGridItem({
  item,
  size,
  selected,
  onToggle,
}: {
  item: PhotoMetadata;
  size: number;
  selected: boolean;
  onToggle: () => void;
}) {
  const uri = usePhotoUri(item.id);
  const { colors: c } = useAppTheme();
  const styles = useMemo(() => createStyles(c), [c]);
  return (
    <Pressable testID={`photo-item-${item.id}`} style={[styles.gridCell, { width: size, height: size }]} onPress={onToggle}>
      {uri ? (
        <Image source={{ uri }} style={StyleSheet.absoluteFill} />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.gridCellPlaceholder]} />
      )}
      <View style={[styles.checkBadge, selected && styles.checkBadgeSelected]}>
        {selected && <Text style={styles.checkBadgeText}>✓</Text>}
      </View>
    </Pressable>
  );
}

function PhotoListItem({ item, selected, onToggle }: { item: PhotoMetadata; selected: boolean; onToggle: () => void }) {
  const uri = usePhotoUri(item.id);
  const { colors: c } = useAppTheme();
  const styles = useMemo(() => createStyles(c), [c]);
  return (
    <Pressable testID={`photo-item-${item.id}`} style={styles.listRow} onPress={onToggle}>
      {uri ? <Image source={{ uri }} style={styles.listThumbnail} /> : <View style={[styles.listThumbnail, styles.gridCellPlaceholder]} />}
      <Text style={styles.listFilename} numberOfLines={1}>
        {item.filename ?? item.id}
      </Text>
      <Text style={styles.listCheckbox}>{selected ? '☑' : '☐'}</Text>
    </Pressable>
  );
}

function createStyles(c: ThemeColors) {
  return StyleSheet.create({
    flex: {
      flex: 1,
    },
    centered: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
    },
    emptyText: {
      color: c.textSecondary,
    },
    errorText: {
      fontSize: 14,
      color: c.accent,
      textAlign: 'center',
    },
    controls: {
      padding: 16,
      gap: 8,
    },
    statusText: {
      fontSize: 15,
      fontWeight: '600',
      color: c.ink,
      marginBottom: 4,
    },
    sectionTitle: {
      fontSize: 12,
      fontWeight: '600',
      color: c.textSecondary,
      marginTop: 8,
    },
    row: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    smallButton: {
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: c.hairline,
    },
    smallButtonDisabled: {
      opacity: 0.4,
    },
    smallButtonText: {
      fontSize: 13,
      color: c.ink,
    },
    smallButtonTextDisabled: {
      color: c.textSecondary,
    },
    toggleButton: {
      paddingVertical: 8,
      paddingHorizontal: 14,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: c.hairline,
    },
    toggleButtonActive: {
      borderColor: c.accent,
      backgroundColor: c.accentSoft,
    },
    toggleButtonText: {
      fontSize: 13,
      color: c.ink,
    },
    toggleButtonTextActive: {
      color: c.accent,
      fontWeight: '600',
    },
    sectionHeader: {
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 4,
      backgroundColor: c.background,
    },
    sectionHeaderText: {
      fontSize: 13,
      fontWeight: '600',
      color: c.textSecondary,
    },
    gridRow: {
      gap: GRID_GAP,
      paddingHorizontal: GRID_PADDING,
    },
    gridCell: {
      overflow: 'hidden',
      backgroundColor: c.hairline,
      marginBottom: GRID_GAP,
    },
    gridCellPlaceholder: {
      backgroundColor: c.hairline,
    },
    checkBadge: {
      position: 'absolute',
      top: 4,
      right: 4,
      width: 20,
      height: 20,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(0,0,0,0.35)',
    },
    checkBadgeSelected: {
      backgroundColor: c.accent,
    },
    checkBadgeText: {
      color: '#fff',
      fontSize: 12,
      fontWeight: '700',
    },
    listRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 16,
      paddingVertical: 8,
    },
    listThumbnail: {
      width: 48,
      height: 48,
      borderRadius: 6,
    },
    listFilename: {
      flex: 1,
      fontSize: 14,
      color: c.ink,
    },
    listCheckbox: {
      fontSize: 18,
      color: c.accent,
    },
  });
}
