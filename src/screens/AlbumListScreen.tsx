import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as MediaLibrary from 'expo-media-library';

import type { RootStackParamList } from '../../App';
import { getAppSetting, setAppSetting } from '../db/client';
import { PermissionBlocked } from '../permissions/components/PermissionBlocked';
import { PermissionRationale } from '../permissions/components/PermissionRationale';
import { useMediaLibraryPermission } from '../permissions/useMediaLibraryPermission';
import { applyPinchDistanceDelta, GRID_COLUMNS_STORAGE_KEY, parseGridColumns } from '../settings/albumGridZoom';
import {
  HIDDEN_FOLDER_PATHS_STORAGE_KEY,
  isPathHidden,
  LEGACY_HIDDEN_ALBUM_IDS_KEY,
  migrateHiddenAlbumIdsToPaths,
  parseHiddenFolderPaths,
  parseLegacyHiddenAlbumIds,
  subscribeToHiddenFolderPathsChanged,
} from '../settings/hiddenFolders';
import { colors } from '../theme/colors';

interface AlbumListItem {
  id: string;
  title: string;
  thumbnailUri: string;
  folderPath: string;
  modifiedAt: number | null;
}

type AlbumSortCriterion = 'system' | 'title' | 'path' | 'photo_count' | 'modified';
type AlbumSortDirection = 'asc' | 'desc';
type AlbumListViewMode = 'grid' | 'list';

const SORT_CRITERION_STORAGE_KEY = 'album_list_sort_criterion';
const SORT_DIRECTION_STORAGE_KEY = 'album_list_sort_direction';
const VIEW_MODE_STORAGE_KEY = 'album_list_view_mode';
const ALBUM_THUMBNAIL_CACHE_KEY = 'album_thumbnail_cache';
const GRID_LIST_PADDING = 12;
const GRID_ITEM_GAP = 12;

const SORT_CRITERION_OPTIONS: ReadonlyArray<{ criterion: AlbumSortCriterion; label: string }> = [
  { criterion: 'system', label: '시스템 기본' },
  { criterion: 'title', label: '이름' },
  { criterion: 'path', label: '경로' },
  { criterion: 'photo_count', label: '사진 개수' },
  { criterion: 'modified', label: '최종 수정 시간' },
];

const SORT_DIRECTION_OPTIONS: ReadonlyArray<{ direction: AlbumSortDirection; label: string }> = [
  { direction: 'asc', label: '오름차순' },
  { direction: 'desc', label: '내림차순' },
];

function isAlbumSortCriterion(value: string | null): value is AlbumSortCriterion {
  return value === 'system' || value === 'title' || value === 'path' || value === 'photo_count' || value === 'modified';
}

function isAlbumSortDirection(value: string | null): value is AlbumSortDirection {
  return value === 'asc' || value === 'desc';
}

function isAlbumListViewMode(value: string | null): value is AlbumListViewMode {
  return value === 'grid' || value === 'list';
}

function getFolderPath(uri: string): string {
  const lastSlash = uri.lastIndexOf('/');
  return lastSlash === -1 ? uri : uri.slice(0, lastSlash);
}

interface AlbumCoverInfo {
  uri: string | null;
  modifiedAt: number | null;
}

async function loadAlbumCoverInfo(album: MediaLibrary.Album): Promise<AlbumCoverInfo> {
  const [latest] = await new MediaLibrary.Query()
    .album(album)
    .eq(MediaLibrary.AssetField.MEDIA_TYPE, MediaLibrary.MediaType.IMAGE)
    .orderBy({ key: MediaLibrary.AssetField.CREATION_TIME, ascending: false })
    .limit(1)
    .exe();
  if (!latest) return { uri: null, modifiedAt: null };
  const [uri, modifiedAt] = await Promise.all([latest.getUri(), latest.getModificationTime()]);
  return { uri, modifiedAt };
}

export function AlbumListScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'AlbumList'>>();
  const { state, isReady, start, confirmRationale, cancelRationale, openSettings } = useMediaLibraryPermission();
  const [albums, setAlbums] = useState<AlbumListItem[] | null>(null);
  const [query, setQuery] = useState('');
  const [sortCriterion, setSortCriterion] = useState<AlbumSortCriterion>('system');
  const [sortDirection, setSortDirection] = useState<AlbumSortDirection>('asc');
  const [viewMode, setViewMode] = useState<AlbumListViewMode>('grid');
  const [gridColumns, setGridColumns] = useState(parseGridColumns(null));
  const [hiddenPaths, setHiddenPaths] = useState<string[] | null>(null);

  useEffect(() => {
    // isReady 게이팅 없이 idle을 보고 바로 start()를 부르면, 이미 허용된 재방문
    // 사용자도 콜드스타트 조회 결과(RECHECK granted)가 도착하기 전에 rationale
    // 화면이 잠깐 떴다가 사라지는 깜빡임이 생긴다. denied는 재요청 가능(canAskAgain)
    // 상태라 rationale로 돌려보내 다시 설명 후 재요청하도록 한다.
    if (isReady && (state === 'idle' || state === 'denied')) start();
  }, [isReady, state, start]);

  useEffect(() => {
    if (state !== 'granted') return;
    let cancelled = false;

    // 콜드스타트 체감 지연(앨범 수만큼 네이티브 병렬 호출, 130개 기준 ~1s) 완화용 캐시 선반영.
    // 신선도 비교 없이 일단 보여주고, 아래 실제 조회 결과로 곧바로 덮어쓴다.
    getAppSetting(ALBUM_THUMBNAIL_CACHE_KEY).then((cached) => {
      if (cancelled || !cached) return;
      setAlbums((current) => current ?? JSON.parse(cached));
    });

    MediaLibrary.Album.getAll()
      .then((result) =>
        Promise.all(
          result.map(async (album) => {
            const { uri, modifiedAt } = await loadAlbumCoverInfo(album);
            return {
              id: album.id,
              title: await album.getTitle(),
              thumbnailUri: uri,
              folderPath: uri === null ? '' : getFolderPath(uri),
              modifiedAt,
            };
          })
        )
      )
      // 앨범 목록은 "사진 폴더" 선택 화면이라, 사진이 한 장도 없는 앨범(알림음/벨소리/통화녹음
      // 같은 오디오 전용 버킷 포함 — MediaLibrary.Album.getAll()은 미디어 타입 구분 없이
      // 기기의 모든 앨범을 반환한다)은 애초에 고를 대상이 아니므로 걸러낸다.
      .then((result) => result.filter((album): album is AlbumListItem => album.thumbnailUri !== null))
      .then((result) => {
        if (cancelled) return;
        setAlbums(result);
        setAppSetting(ALBUM_THUMBNAIL_CACHE_KEY, JSON.stringify(result));
      });
    return () => {
      cancelled = true;
    };
  }, [state]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getAppSetting(SORT_CRITERION_STORAGE_KEY),
      getAppSetting(SORT_DIRECTION_STORAGE_KEY),
      getAppSetting(VIEW_MODE_STORAGE_KEY),
      getAppSetting(GRID_COLUMNS_STORAGE_KEY),
    ]).then(([criterion, direction, viewModeSetting, gridColumnsSetting]) => {
      if (cancelled) return;
      if (isAlbumSortCriterion(criterion)) setSortCriterion(criterion);
      if (isAlbumSortDirection(direction)) setSortDirection(direction);
      if (isAlbumListViewMode(viewModeSetting)) setViewMode(viewModeSetting);
      setGridColumns(parseGridColumns(gridColumnsSetting));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    function reload() {
      getAppSetting(HIDDEN_FOLDER_PATHS_STORAGE_KEY).then((raw) => {
        if (!cancelled) setHiddenPaths(parseHiddenFolderPaths(raw));
      });
    }
    reload();
    // 설정 화면(제외된 폴더)에서 토글해도 이 화면은 native-stack에서 unmount되지 않고
    // 남아있어 focus 이벤트가 없다 — 토글 저장 직후 알림으로 재조회한다.
    const unsubscribe = subscribeToHiddenFolderPathsChanged(reload);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    // 구버전(flat id 기반) 숨김 목록을 신버전(경로 기반)으로 1회 이관한다. albums가
    // 로드돼야 id→folderPath를 알 수 있어 이 효과에 의존한다. 새 키가 이미 있으면(=이미
    // 이관됨) 아무 것도 하지 않는다.
    if (albums === null) return;
    let cancelled = false;
    Promise.all([
      getAppSetting(HIDDEN_FOLDER_PATHS_STORAGE_KEY),
      getAppSetting(LEGACY_HIDDEN_ALBUM_IDS_KEY),
    ]).then(([newRaw, legacyRaw]) => {
      if (cancelled || newRaw !== null) return;
      const legacyIds = parseLegacyHiddenAlbumIds(legacyRaw);
      if (legacyIds.length === 0) return;
      const migrated = migrateHiddenAlbumIdsToPaths(legacyIds, albums);
      if (migrated.length === 0) return;
      setHiddenPaths(migrated);
      setAppSetting(HIDDEN_FOLDER_PATHS_STORAGE_KEY, JSON.stringify(migrated));
    });
    return () => {
      cancelled = true;
    };
  }, [albums]);

  async function handleSortCriterionChange(criterion: AlbumSortCriterion) {
    setSortCriterion(criterion);
    await setAppSetting(SORT_CRITERION_STORAGE_KEY, criterion);
  }

  async function handleSortDirectionChange(direction: AlbumSortDirection) {
    setSortDirection(direction);
    await setAppSetting(SORT_DIRECTION_STORAGE_KEY, direction);
  }

  async function handleViewModeToggle() {
    const next: AlbumListViewMode = viewMode === 'grid' ? 'list' : 'grid';
    setViewMode(next);
    await setAppSetting(VIEW_MODE_STORAGE_KEY, next);
  }

  async function handleGridColumnsCommit(columns: number) {
    await setAppSetting(GRID_COLUMNS_STORAGE_KEY, String(columns));
  }

  const visibleAlbums = useMemo(
    () => (albums ?? []).filter((album) => !isPathHidden(album.folderPath, hiddenPaths ?? [])),
    [albums, hiddenPaths]
  );

  if (state === 'rationale') {
    return <PermissionRationale onConfirm={confirmRationale} onCancel={cancelRationale} />;
  }

  if (state === 'blocked') {
    return <PermissionBlocked variant="blocked" onOpenSettings={openSettings} />;
  }

  if (state === 'partial_unsupported') {
    return <PermissionBlocked variant="partial" onOpenSettings={openSettings} />;
  }

  if (state !== 'granted' || albums === null || hiddenPaths === null) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <AlbumListContent
      albums={visibleAlbums}
      query={query}
      onQueryChange={setQuery}
      sortCriterion={sortCriterion}
      sortDirection={sortDirection}
      onSortCriterionChange={handleSortCriterionChange}
      onSortDirectionChange={handleSortDirectionChange}
      viewMode={viewMode}
      onViewModeToggle={handleViewModeToggle}
      gridColumns={gridColumns}
      onGridColumnsChange={setGridColumns}
      onGridColumnsCommit={handleGridColumnsCommit}
    />
  );
}

interface AlbumListContentProps {
  albums: AlbumListItem[];
  query: string;
  onQueryChange: (query: string) => void;
  sortCriterion: AlbumSortCriterion;
  sortDirection: AlbumSortDirection;
  onSortCriterionChange: (criterion: AlbumSortCriterion) => void;
  onSortDirectionChange: (direction: AlbumSortDirection) => void;
  viewMode: AlbumListViewMode;
  onViewModeToggle: () => void;
  gridColumns: number;
  onGridColumnsChange: (columns: number) => void;
  onGridColumnsCommit: (columns: number) => void;
}

function touchDistance(touches: ReadonlyArray<{ pageX: number; pageY: number }>): number {
  const [a, b] = touches;
  return Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
}

function AlbumListContent({
  albums,
  query,
  onQueryChange,
  sortCriterion,
  sortDirection,
  onSortCriterionChange,
  onSortDirectionChange,
  viewMode,
  onViewModeToggle,
  gridColumns,
  onGridColumnsChange,
  onGridColumnsCommit,
}: AlbumListContentProps) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'AlbumList'>>();
  const [menuVisible, setMenuVisible] = useState(false);
  const [sortDialogVisible, setSortDialogVisible] = useState(false);
  const [photoCounts, setPhotoCounts] = useState<Record<string, number> | null>(null);
  const [photoCountsLoading, setPhotoCountsLoading] = useState(false);

  const filteredAlbums = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return albums;
    return albums.filter((album) => album.title.toLowerCase().includes(normalizedQuery));
  }, [albums, query]);

  useEffect(() => {
    // '사진 개수' 기준은 앨범마다 asset 목록을 다시 조회해야 해서 비용이 크므로,
    // 콜드스타트 때 미리 계산하지 않고 이 기준을 처음 고르는 시점에만 지연 계산한다.
    if (sortCriterion !== 'photo_count' || photoCounts !== null || photoCountsLoading) return;
    let cancelled = false;
    setPhotoCountsLoading(true);
    Promise.all(
      albums.map(async (album) => {
        const assets = await new MediaLibrary.Query()
          .album(new MediaLibrary.Album(album.id))
          .eq(MediaLibrary.AssetField.MEDIA_TYPE, MediaLibrary.MediaType.IMAGE)
          .exe();
        return [album.id, assets.length] as const;
      })
    ).then((entries) => {
      if (cancelled) return;
      setPhotoCounts(Object.fromEntries(entries));
      setPhotoCountsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [sortCriterion, albums, photoCounts, photoCountsLoading]);

  const sortedAlbums = useMemo(() => {
    if (sortCriterion === 'system') return filteredAlbums;
    const sorted = [...filteredAlbums];
    const dir = sortDirection === 'asc' ? 1 : -1;
    switch (sortCriterion) {
      case 'title':
        sorted.sort((a, b) => dir * a.title.localeCompare(b.title));
        break;
      case 'path':
        sorted.sort((a, b) => dir * a.folderPath.localeCompare(b.folderPath));
        break;
      case 'modified':
        sorted.sort((a, b) => dir * ((a.modifiedAt ?? 0) - (b.modifiedAt ?? 0)));
        break;
      case 'photo_count':
        if (photoCounts) {
          sorted.sort((a, b) => dir * ((photoCounts[a.id] ?? 0) - (photoCounts[b.id] ?? 0)));
        }
        break;
    }
    return sorted;
  }, [filteredAlbums, sortCriterion, sortDirection, photoCounts]);

  const isGrid = viewMode === 'grid';

  const { width: windowWidth } = useWindowDimensions();
  const cardWidth =
    (windowWidth - GRID_LIST_PADDING * 2 - GRID_ITEM_GAP * (gridColumns - 1)) / gridColumns;

  const gridColumnsRef = useRef(gridColumns);
  gridColumnsRef.current = gridColumns;
  const pinchStateRef = useRef({ lastDistance: 0, accumulated: 0 });

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponderCapture: (evt) => evt.nativeEvent.touches.length === 2,
      onMoveShouldSetPanResponderCapture: (evt) => evt.nativeEvent.touches.length === 2,
      onPanResponderGrant: (evt) => {
        pinchStateRef.current = { lastDistance: touchDistance(evt.nativeEvent.touches), accumulated: 0 };
      },
      onPanResponderMove: (evt) => {
        const touches = evt.nativeEvent.touches;
        if (touches.length !== 2) return;
        const distance = touchDistance(touches);
        const delta = distance - pinchStateRef.current.lastDistance;
        pinchStateRef.current.lastDistance = distance;
        const { columns, remainder } = applyPinchDistanceDelta(
          gridColumnsRef.current,
          pinchStateRef.current.accumulated + delta
        );
        pinchStateRef.current.accumulated = remainder;
        if (columns !== gridColumnsRef.current) {
          gridColumnsRef.current = columns;
          onGridColumnsChange(columns);
        }
      },
      onPanResponderRelease: () => onGridColumnsCommit(gridColumnsRef.current),
      onPanResponderTerminate: () => onGridColumnsCommit(gridColumnsRef.current),
    })
  ).current;

  return (
    <View style={styles.flex} {...(isGrid ? panResponder.panHandlers : null)}>
      <FlatList
        key={isGrid ? `grid-${gridColumns}` : 'list'}
        contentContainerStyle={styles.listContent}
        columnWrapperStyle={isGrid && gridColumns > 1 ? styles.columnWrapper : undefined}
        numColumns={isGrid ? gridColumns : 1}
        data={sortedAlbums}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <View style={styles.searchBar}>
            <TextInput
              testID="album-search-input"
              style={styles.searchInput}
              value={query}
              onChangeText={onQueryChange}
              placeholder="앨범 검색"
              placeholderTextColor={colors.textSecondary}
              autoCorrect={false}
              autoCapitalize="none"
            />
            {query.length > 0 && (
              <Pressable testID="album-search-clear" onPress={() => onQueryChange('')} hitSlop={8}>
                <Text style={styles.searchClear}>✕</Text>
              </Pressable>
            )}
            <View style={styles.searchBarActions}>
              <Pressable
                testID="album-view-mode-toggle"
                onPress={onViewModeToggle}
                style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]}
                hitSlop={8}
              >
                <Text style={styles.iconButtonText}>{isGrid ? '☰' : '▦'}</Text>
              </Pressable>
              <Pressable
                testID="album-menu-button"
                onPress={() => setMenuVisible(true)}
                style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]}
                hitSlop={8}
              >
                <Text style={styles.iconButtonText}>⋮</Text>
              </Pressable>
            </View>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.centered}>
            <Text>{query.length > 0 ? '검색 결과가 없어요' : '사진 앨범이 없어요'}</Text>
          </View>
        }
        renderItem={({ item }) =>
          isGrid ? (
            <Pressable
              testID={`album-card-${item.id}`}
              style={[styles.card, { width: cardWidth }]}
              onPress={() => navigation.navigate('AlbumSettings', { deviceAlbumId: item.id, displayName: item.title })}
            >
              <Image
                testID={`album-thumbnail-${item.id}`}
                source={{ uri: item.thumbnailUri }}
                style={styles.thumbnail}
              />
              <View style={styles.scrim}>
                <Text style={styles.cardTitle} numberOfLines={1}>
                  {item.title}
                </Text>
              </View>
            </Pressable>
          ) : (
            <Pressable
              testID={`album-card-${item.id}`}
              style={styles.row}
              onPress={() => navigation.navigate('AlbumSettings', { deviceAlbumId: item.id, displayName: item.title })}
            >
              <Image
                testID={`album-thumbnail-${item.id}`}
                source={{ uri: item.thumbnailUri }}
                style={styles.rowThumbnail}
              />
              <Text style={styles.rowTitle} numberOfLines={1}>
                {item.title}
              </Text>
            </Pressable>
          )
        }
      />

      <Modal visible={menuVisible} transparent animationType="fade" onRequestClose={() => setMenuVisible(false)}>
        <Pressable style={styles.menuBackdrop} onPress={() => setMenuVisible(false)}>
          <Pressable style={styles.menuCard} onPress={() => {}}>
            <Pressable
              testID="album-menu-sort"
              style={styles.menuItem}
              onPress={() => {
                setMenuVisible(false);
                setSortDialogVisible(true);
              }}
            >
              <Text style={styles.menuItemText}>정렬 방식</Text>
            </Pressable>
            <Pressable
              testID="album-menu-settings"
              style={styles.menuItem}
              onPress={() => {
                setMenuVisible(false);
                navigation.navigate('AppSettings');
              }}
            >
              <Text style={styles.menuItemText}>설정</Text>
            </Pressable>
            <Pressable
              testID="album-menu-appinfo"
              style={styles.menuItem}
              onPress={() => {
                setMenuVisible(false);
                navigation.navigate('AppInfo');
              }}
            >
              <Text style={styles.menuItemText}>앱 정보</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={sortDialogVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setSortDialogVisible(false)}
      >
        <Pressable style={styles.dialogBackdrop} onPress={() => setSortDialogVisible(false)}>
          <Pressable style={styles.sortDialogCard} onPress={() => {}}>
            <Text style={styles.sortDialogTitle}>정렬 방식</Text>
            <Text style={styles.sortDialogSectionLabel}>기준</Text>
            {SORT_CRITERION_OPTIONS.map((option) => (
              <Pressable
                key={option.criterion}
                testID={`album-sort-criterion-${option.criterion}`}
                style={styles.sortOptionRow}
                onPress={() => onSortCriterionChange(option.criterion)}
              >
                <Text style={styles.sortOptionText}>{option.label}</Text>
                <View style={styles.sortOptionTrailing}>
                  {option.criterion === 'photo_count' && photoCountsLoading && (
                    <ActivityIndicator testID="album-sort-photo-count-loading" size="small" />
                  )}
                  {sortCriterion === option.criterion && <Text style={styles.sortOptionCheck}>✓</Text>}
                </View>
              </Pressable>
            ))}

            {sortCriterion !== 'system' && (
              <>
                <Text style={styles.sortDialogSectionLabel}>순서</Text>
                {SORT_DIRECTION_OPTIONS.map((option) => (
                  <Pressable
                    key={option.direction}
                    testID={`album-sort-direction-${option.direction}`}
                    style={styles.sortOptionRow}
                    onPress={() => onSortDirectionChange(option.direction)}
                  >
                    <Text style={styles.sortOptionText}>{option.label}</Text>
                    {sortDirection === option.direction && <Text style={styles.sortOptionCheck}>✓</Text>}
                  </Pressable>
                ))}
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    padding: 12,
    gap: 12,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
  },
  searchClear: {
    marginLeft: 8,
    color: colors.textSecondary,
    fontSize: 15,
  },
  searchBarActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
    gap: 6,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.hairline,
  },
  iconButtonPressed: {
    opacity: 0.6,
  },
  iconButtonText: {
    color: colors.textSecondary,
    fontSize: 18,
    fontWeight: '700',
  },
  menuBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.25)',
    alignItems: 'flex-end',
    padding: 16,
  },
  menuCard: {
    minWidth: 160,
    borderRadius: 12,
    backgroundColor: '#fff',
    paddingVertical: 4,
    overflow: 'hidden',
  },
  dialogBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  menuItem: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  menuItemText: {
    fontSize: 15,
  },
  sortDialogCard: {
    width: '85%',
    maxWidth: 340,
    borderRadius: 12,
    backgroundColor: '#fff',
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  sortDialogTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  sortDialogSectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  sortOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  sortOptionText: {
    fontSize: 15,
  },
  sortOptionTrailing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sortOptionCheck: {
    color: colors.accent,
    fontSize: 15,
    fontWeight: '700',
  },
  columnWrapper: {
    gap: 12,
  },
  card: {
    aspectRatio: 1,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: colors.hairline,
  },
  thumbnail: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  scrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: colors.scrim,
  },
  cardTitle: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  rowThumbnail: {
    width: 56,
    height: 56,
    borderRadius: 8,
    backgroundColor: colors.hairline,
  },
  rowTitle: {
    flex: 1,
    fontSize: 15,
  },
});
