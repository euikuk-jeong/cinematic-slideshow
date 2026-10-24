import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  type ImageStyle,
  Pressable,
  SectionList,
  type StyleProp,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type ViewStyle,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as MediaLibrary from 'expo-media-library';
import { useTranslation } from 'react-i18next';

import type { RootStackParamList } from '../../App';
import { AppBannerAd } from '../ads/AppBannerAd';
import { getAppSetting, reconcileAlbumReferenceValidity, setAppSetting } from '../db/client';
import {
  albumDateBasis,
  groupAlbumsByMonth,
  isAlbumSortCriterion,
  isAlbumSortDirection,
  sortAlbums,
  type AlbumMonthFormatter,
  type AlbumSortCriterion,
  type AlbumSortDirection,
} from '../library/albumList';
import { HeaderIconButton } from '../library/HeaderIconButton';
import { LibrarySortDialog } from '../library/LibrarySortDialog';
import { LibraryToolbar } from '../library/LibraryToolbar';
import { PermissionBlocked } from '../permissions/components/PermissionBlocked';
import { PermissionRationale } from '../permissions/components/PermissionRationale';
import { useMediaLibraryPermission } from '../permissions/useMediaLibraryPermission';
import { chunkItems } from '../photos/photoSort';
import { usePinchColumns } from '../photos/usePinchColumns';
import {
  GRID_COLUMNS_STORAGE_KEY,
  MAX_GRID_COLUMNS,
  MIN_GRID_COLUMNS,
  parseGridColumns,
} from '../settings/albumGridZoom';
import { getFolderPath } from '../settings/folderTree';
import { nextLibraryViewMode, parseLibraryViewMode, type LibraryViewMode } from '../settings/libraryViewMode';
import {
  HIDDEN_FOLDER_PATHS_STORAGE_KEY,
  isPathHidden,
  LEGACY_HIDDEN_ALBUM_IDS_KEY,
  migrateHiddenAlbumIdsToPaths,
  parseHiddenFolderPaths,
  parseLegacyHiddenAlbumIds,
  subscribeToHiddenFolderPathsChanged,
} from '../settings/hiddenFolders';
import type { ThemeColors } from '../theme/colors';
import { useAppTheme } from '../theme/ThemeContext';

interface AlbumListItem {
  id: string;
  title: string;
  thumbnailUri: string;
  folderPath: string;
  modifiedAt: number | null;
  // 앨범 대표 항목의 촬영일시(MediaStore DATE_TAKEN = 스캔 시 EXIF 촬영일). 값이 없으면 null이고
  // 정렬·날짜별 보기는 modifiedAt으로 대체한다(albumCapturedAt). 캐시에 저장된 구버전 항목엔 이 필드가
  // 없지만 albumCapturedAt이 undefined도 null과 똑같이 "없음"으로 다루므로 그대로 읽어도 된다.
  capturedAt: number | null;
  // 'video': 사진이 한 장도 없고 영상만 있는 폴더 — 영상 uri가 썸네일로 그려지는지 보장할 수 없어
  // (미검증) 커버는 이미지 대신 아이콘으로 표시한다. 캐시에 저장된 구버전 항목엔 이 필드가 없지만 'video'와 엄격 비교하므로 사진 커버로 취급된다.
  coverKind: 'image' | 'video';
}

const SORT_CRITERION_STORAGE_KEY = 'album_list_sort_criterion';
const SORT_DIRECTION_STORAGE_KEY = 'album_list_sort_direction';
const VIEW_MODE_STORAGE_KEY = 'album_list_view_mode';
const ALBUM_THUMBNAIL_CACHE_KEY = 'album_thumbnail_cache';
const GRID_LIST_PADDING = 12;
const GRID_ITEM_GAP = 12;
const ALBUM_COLUMN_RANGE = { min: MIN_GRID_COLUMNS, max: MAX_GRID_COLUMNS };

const SORT_CRITERION_OPTIONS: ReadonlyArray<{ criterion: AlbumSortCriterion; labelKey: string }> = [
  { criterion: 'system', labelKey: 'sortCriterionOptions.system' },
  { criterion: 'title', labelKey: 'sortCriterionOptions.title' },
  { criterion: 'path', labelKey: 'sortCriterionOptions.path' },
  { criterion: 'photo_count', labelKey: 'sortCriterionOptions.photoCount' },
  { criterion: 'modified', labelKey: 'sortCriterionOptions.modified' },
  { criterion: 'captured', labelKey: 'sortCriterionOptions.captured' },
];

// 영상 전용 폴더가 목록에 나타나려면 영상 권한이 필요하다. 권한 변경 감지에만 쓰는 조회용 상수.
const VIDEO_GRANULAR_PERMISSIONS: MediaLibrary.GranularPermission[] = ['video'];

interface AlbumCoverInfo {
  uri: string | null;
  modifiedAt: number | null;
  capturedAt: number | null;
  coverKind: 'image' | 'video';
}

async function loadAlbumCoverInfo(album: MediaLibrary.Album): Promise<AlbumCoverInfo> {
  const [latest] = await new MediaLibrary.Query()
    .album(album)
    .eq(MediaLibrary.AssetField.MEDIA_TYPE, MediaLibrary.MediaType.IMAGE)
    .orderBy({ key: MediaLibrary.AssetField.CREATION_TIME, ascending: false })
    .limit(1)
    .exe();
  if (latest) {
    // 촬영일시는 이미 MediaStore에 있는 DATE_TAKEN을 읽을 뿐이다 — 파일마다 EXIF를 파싱하지 않는다.
    const [uri, modifiedAt, capturedAt] = await Promise.all([
      latest.getUri(),
      latest.getModificationTime(),
      latest.getCreationTime(),
    ]);
    return { uri, modifiedAt, capturedAt, coverKind: 'image' };
  }
  // 사진이 없으면 영상만 있는 폴더인지 확인한다. 영상 권한이 없으면 MediaStore가 영상 행을
  // 돌려주지 않아 결과가 비므로, 권한이 허용된 경우에만 영상 전용 폴더가 목록에 나타난다.
  const [latestVideo] = await new MediaLibrary.Query()
    .album(album)
    .eq(MediaLibrary.AssetField.MEDIA_TYPE, MediaLibrary.MediaType.VIDEO)
    .orderBy({ key: MediaLibrary.AssetField.CREATION_TIME, ascending: false })
    .limit(1)
    .exe();
  if (!latestVideo) return { uri: null, modifiedAt: null, capturedAt: null, coverKind: 'image' };
  const [videoUri, videoModifiedAt, videoCapturedAt] = await Promise.all([
    latestVideo.getUri(),
    latestVideo.getModificationTime(),
    latestVideo.getCreationTime(),
  ]);
  return { uri: videoUri, modifiedAt: videoModifiedAt, capturedAt: videoCapturedAt, coverKind: 'video' };
}

// 영상만 있는 폴더의 커버: 영상 파일의 한 프레임을 Image가 그려준다(갤러리 그리드의 영상 타일과 같은
// 방식). 프레임을 못 그리는 영상이면 이전처럼 아이콘으로 대체한다.
function VideoAlbumCover({ id, uri, style }: { id: string; uri: string; style: StyleProp<ImageStyle> }) {
  const { colors: c } = useAppTheme();
  const styles = useMemo(() => createStyles(c), [c]);
  const [failed, setFailed] = useState(false);
  return (
    <View testID={`album-video-cover-${id}`} style={[style as StyleProp<ViewStyle>, styles.videoCover]}>
      {failed ? (
        <Text style={styles.videoCoverIcon}>🎞</Text>
      ) : (
        <Image
          testID={`album-video-frame-${id}`}
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          onError={() => setFailed(true)}
        />
      )}
    </View>
  );
}

export function AlbumListScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'AlbumList'>>();
  const { colors: c } = useAppTheme();
  const styles = useMemo(() => createStyles(c), [c]);
  const { state, isReady, start, confirmRationale, cancelRationale, openSettings } = useMediaLibraryPermission();
  const [albums, setAlbums] = useState<AlbumListItem[] | null>(null);
  const [query, setQuery] = useState('');
  const [sortCriterion, setSortCriterion] = useState<AlbumSortCriterion>('system');
  const [sortDirection, setSortDirection] = useState<AlbumSortDirection>('asc');
  const [viewMode, setViewMode] = useState<LibraryViewMode>('grid');
  const [gridColumns, setGridColumns] = useState(parseGridColumns(null));
  const [hiddenPaths, setHiddenPaths] = useState<string[] | null>(null);
  // 갤러리 화면에서 영상 권한을 허용하고 돌아오면(이 화면은 unmount되지 않고 남아 있다) 영상 전용
  // 폴더가 목록에 없다 — 포커스 복귀 시 영상 권한이 바뀌었으면 목록을 다시 조회한다.
  const lastVideoGrantedRef = useRef<boolean | null>(null);
  const [albumReloadToken, setAlbumReloadToken] = useState(0);

  // 앱 설정은 헤더 우측에 항상 보인다(스크롤해도, 권한 안내 화면에서도 접근 가능).
  const { t: tHeader } = useTranslation('albumList');
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <HeaderIconButton
          testID="album-menu-settings"
          glyph="⚙"
          accessibilityLabel={tHeader('settingsButtonLabel')}
          onPress={() => navigation.navigate('AppSettings')}
        />
      ),
    });
  }, [navigation, tHeader]);

  useEffect(() => {
    // isReady 게이팅 없이 idle을 보고 바로 start()를 부르면, 이미 허용된 재방문
    // 사용자도 콜드스타트 조회 결과(RECHECK granted)가 도착하기 전에 rationale
    // 화면이 잠깐 떴다가 사라지는 깜빡임이 생긴다. denied는 재요청 가능(canAskAgain)
    // 상태라 rationale로 돌려보내 다시 설명 후 재요청하도록 한다.
    if (isReady && (state === 'idle' || state === 'denied')) start();
  }, [isReady, state, start]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      MediaLibrary.getPermissionsAsync(false, VIDEO_GRANULAR_PERMISSIONS)
        .then((response) => {
          if (cancelled) return;
          const previous = lastVideoGrantedRef.current;
          lastVideoGrantedRef.current = response.granted;
          if (previous !== null && previous !== response.granted) setAlbumReloadToken((token) => token + 1);
        })
        .catch((e) => {
          console.warn('[AlbumListScreen] 영상 권한 조회 실패', e);
        });
      return () => {
        cancelled = true;
      };
    }, [])
  );

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
      .then((result) => {
        // 저장된 앨범(설정 화면 방문 이력 있는 것) 중 기기에서 사라진/다시 나타난
        // 폴더의 is_reference_valid를 갱신 — 화면에 보여줄 목록(사진 있는 앨범만)이
        // 아니라 기기에 실제 존재하는 전체 폴더 id 기준으로 판단해야 한다.
        reconcileAlbumReferenceValidity(result.map((album) => album.id));
        return result;
      })
      .then((result) =>
        Promise.allSettled(
          result.map(async (album) => {
            const { uri, modifiedAt, capturedAt, coverKind } = await loadAlbumCoverInfo(album);
            return {
              id: album.id,
              title: await album.getTitle(),
              thumbnailUri: uri,
              folderPath: uri === null ? '' : getFolderPath(uri),
              modifiedAt,
              capturedAt,
              coverKind,
            };
          })
        )
      )
      // 앨범 하나(예: bucket_display_name=NULL인 깨진 MediaStore 버킷)가 실패해도
      // Promise.all이면 전체가 reject돼 목록이 무한 로딩에 빠진다 — 실패한 앨범만
      // 건너뛰고 나머지는 정상 표시한다.
      .then((settled) =>
        settled.flatMap((outcome) => {
          if (outcome.status === 'fulfilled') return [outcome.value];
          console.warn('[AlbumListScreen] 앨범 조회 실패, 목록에서 제외', outcome.reason);
          return [];
        })
      )
      // 앨범 목록은 사진/영상 폴더 선택 화면이라, 사진도 영상도 없는 앨범(알림음/벨소리/통화녹음
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
  }, [state, albumReloadToken]);

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
      setViewMode(parseLibraryViewMode(viewModeSetting));
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

  async function handleViewModeCycle() {
    const next = nextLibraryViewMode(viewMode);
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
      onViewModeCycle={handleViewModeCycle}
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
  viewMode: LibraryViewMode;
  onViewModeCycle: () => void;
  gridColumns: number;
  onGridColumnsChange: (columns: number) => void;
  onGridColumnsCommit: (columns: number) => void;
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
  onViewModeCycle,
  gridColumns,
  onGridColumnsChange,
  onGridColumnsCommit,
}: AlbumListContentProps) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'AlbumList'>>();
  const { colors: c } = useAppTheme();
  const { t } = useTranslation('albumList');
  const styles = useMemo(() => createStyles(c), [c]);
  const [searchActive, setSearchActive] = useState(false);
  const [sortDialogVisible, setSortDialogVisible] = useState(false);
  const [photoCounts, setPhotoCounts] = useState<Record<string, number> | null>(null);
  const [photoCountsLoading, setPhotoCountsLoading] = useState(false);

  // 검색을 닫으면 검색어도 함께 비운다 — 입력창이 안 보이는데 필터만 남는 일이 없게.
  const activeQuery = searchActive ? query : '';
  function closeSearch() {
    setSearchActive(false);
    onQueryChange('');
  }

  const filteredAlbums = useMemo(() => {
    const normalizedQuery = activeQuery.trim().toLowerCase();
    if (!normalizedQuery) return albums;
    return albums.filter((album) => album.title.toLowerCase().includes(normalizedQuery));
  }, [albums, activeQuery]);

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

  const sortedAlbums = useMemo(
    () => sortAlbums(filteredAlbums, sortCriterion, sortDirection, photoCounts),
    [filteredAlbums, sortCriterion, sortDirection, photoCounts]
  );

  const monthFormatter: AlbumMonthFormatter = useMemo(
    () => ({
      unknownDate: t('noDateLabel'),
      formatMonth: (year, month) => t('monthLabel', { year, month }),
    }),
    [t]
  );
  const dateSections = useMemo(() => {
    if (viewMode !== 'date') return [];
    return groupAlbumsByMonth(sortedAlbums, albumDateBasis(sortCriterion), monthFormatter).map((section) => ({
      key: section.key,
      title: section.label,
      data: chunkItems(section.items, gridColumns).map((row, index) => ({ rowKey: `${section.key}-${index}`, row })),
    }));
  }, [viewMode, sortedAlbums, sortCriterion, monthFormatter, gridColumns]);

  const { width: windowWidth } = useWindowDimensions();
  const cardWidth =
    (windowWidth - GRID_LIST_PADDING * 2 - GRID_ITEM_GAP * (gridColumns - 1)) / gridColumns;

  // 열 수는 카드(그리드·날짜별)에만 의미가 있다. 훅은 항상 호출하되, 목록 보기에서는 핸들러를 붙이지
  // 않는다 — 붙이면 보이지 않는 열 수가 바뀌어 저장되고 두 손가락 터치를 가로챈다.
  const pinchHandlers = usePinchColumns(gridColumns, ALBUM_COLUMN_RANGE, onGridColumnsChange, onGridColumnsCommit);

  function openAlbum(item: AlbumListItem) {
    navigation.navigate('AlbumGallery', { deviceAlbumId: item.id, displayName: item.title });
  }

  function renderCover(item: AlbumListItem, style: StyleProp<ImageStyle>) {
    return item.coverKind === 'video' ? (
      <VideoAlbumCover id={item.id} uri={item.thumbnailUri} style={style} />
    ) : (
      <Image testID={`album-thumbnail-${item.id}`} source={{ uri: item.thumbnailUri }} style={style} />
    );
  }

  function renderCard(item: AlbumListItem) {
    return (
      <Pressable
        key={item.id}
        testID={`album-card-${item.id}`}
        style={[styles.card, { width: cardWidth }]}
        onPress={() => openAlbum(item)}
      >
        {renderCover(item, styles.thumbnail)}
        <View style={styles.scrim}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {item.title}
          </Text>
        </View>
      </Pressable>
    );
  }

  function renderRow(item: AlbumListItem) {
    return (
      <Pressable testID={`album-card-${item.id}`} style={styles.row} onPress={() => openAlbum(item)}>
        {renderCover(item, styles.rowThumbnail)}
        <Text style={styles.rowTitle} numberOfLines={1}>
          {item.title}
        </Text>
      </Pressable>
    );
  }

  const emptyComponent = (
    <View style={styles.centered}>
      <Text style={styles.emptyText}>
        {activeQuery.length > 0 ? t('common:emptyState.noSearchResults') : t('noAlbums')}
      </Text>
    </View>
  );

  function renderBody() {
    if (viewMode === 'date') {
      return (
        <SectionList
          contentContainerStyle={styles.listContent}
          sections={dateSections}
          keyExtractor={(row) => row.rowKey}
          stickySectionHeadersEnabled={false}
          ListEmptyComponent={emptyComponent}
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionHeaderText}>{section.title}</Text>
            </View>
          )}
          renderItem={({ item: row }) => <View style={styles.cardRow}>{row.row.map(renderCard)}</View>}
        />
      );
    }
    if (viewMode === 'list') {
      return (
        <FlatList
          key="list"
          contentContainerStyle={styles.listContent}
          data={sortedAlbums}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={emptyComponent}
          renderItem={({ item }) => renderRow(item)}
        />
      );
    }
    return (
      <FlatList
        key={`grid-${gridColumns}`}
        contentContainerStyle={styles.listContent}
        columnWrapperStyle={gridColumns > 1 ? styles.columnWrapper : undefined}
        numColumns={gridColumns}
        data={sortedAlbums}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={emptyComponent}
        renderItem={({ item }) => renderCard(item)}
      />
    );
  }

  return (
    <View style={styles.flex} {...(viewMode !== 'list' ? pinchHandlers : null)}>
      <LibraryToolbar
        testIDPrefix="album"
        summary={t('albumCount', { count: filteredAlbums.length })}
        searchPlaceholder={t('searchPlaceholder')}
        searchActive={searchActive}
        query={query}
        onQueryChange={onQueryChange}
        onSearchOpen={() => setSearchActive(true)}
        onSearchClose={closeSearch}
        viewMode={viewMode}
        onViewModeCycle={onViewModeCycle}
        onSortPress={() => setSortDialogVisible(true)}
      />
      <View style={styles.flex}>{renderBody()}</View>

      <LibrarySortDialog
        visible={sortDialogVisible}
        onClose={() => setSortDialogVisible(false)}
        testIDPrefix="album"
        criteria={SORT_CRITERION_OPTIONS.map((option) => ({
          value: option.criterion,
          label: t(option.labelKey),
          loading: option.criterion === 'photo_count' && photoCountsLoading,
          loadingTestID: option.criterion === 'photo_count' ? 'album-sort-photo-count-loading' : undefined,
        }))}
        criterion={sortCriterion}
        onCriterionChange={onSortCriterionChange}
        direction={sortDirection}
        onDirectionChange={onSortDirectionChange}
        showDirection={sortCriterion !== 'system'}
        footnote={viewMode === 'date' ? t('sortDateBasisNote') : undefined}
      />

      <AppBannerAd />
    </View>
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
    },
    emptyText: {
      color: c.textSecondary,
    },
    listContent: {
      padding: 12,
      gap: 12,
    },
    sectionHeader: {
      paddingTop: 4,
      paddingBottom: 8,
    },
    sectionHeaderText: {
      fontSize: 13,
      fontWeight: '600',
      color: c.textSecondary,
    },
    cardRow: {
      flexDirection: 'row',
      gap: 12,
      marginBottom: 12,
    },
    columnWrapper: {
      gap: 12,
    },
    card: {
      aspectRatio: 1,
      borderRadius: 16,
      overflow: 'hidden',
      backgroundColor: c.hairline,
    },
    thumbnail: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
    },
    videoCover: {
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      backgroundColor: c.hairline,
    },
    videoCoverIcon: {
      fontSize: 28,
    },
    scrim: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      paddingHorizontal: 10,
      paddingVertical: 8,
      backgroundColor: c.scrim,
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
      backgroundColor: c.hairline,
    },
    rowTitle: {
      flex: 1,
      fontSize: 15,
      color: c.ink,
    },
  });
}
