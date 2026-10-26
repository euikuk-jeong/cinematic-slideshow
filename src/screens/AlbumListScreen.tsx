import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
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
import { AllFilesAccessModal } from '../library/AllFilesAccessModal';
import { parentDirectory, directoryName } from '../library/folderLocation';
import { HeaderIconButton } from '../library/HeaderIconButton';
import { LibrarySortDialog } from '../library/LibrarySortDialog';
import { LibraryToolbar } from '../library/LibraryToolbar';
import { MoveTargetModal } from '../library/MoveTargetModal';
import { decideNewFolderMove, decideTargetMove, type MoveDecision, type MoveMode } from '../library/moveDecisions';
import { RenameAlbumModal } from '../library/RenameAlbumModal';
import { SelectionBar } from '../library/SelectionBar';
import { SelectMark } from '../library/SelectMark';
import { useDirectMoveGate } from '../library/useDirectMoveGate';
import { PermissionBlocked } from '../permissions/components/PermissionBlocked';
import { PermissionRationale } from '../permissions/components/PermissionRationale';
import { useMediaLibraryPermission } from '../permissions/useMediaLibraryPermission';
import { folderPathToDirectory } from '../photos/directMove';
import {
  mutationOutcome,
  nothingDoneNotice,
  toggleSelection,
} from '../photos/gallerySelection';
import {
  isCopyMutation,
  isFileManagementAvailable,
  movesToTrash,
  runAlbumsMutation,
  type MediaMutation,
} from '../photos/mediaMutations';
import { isTrashAvailable } from '../photos/mediaTrash';
import { chunkItems } from '../photos/photoSort';
import { captureRenameContext, migrateRenamedAlbum } from '../photos/renameMigration';
import { VideoOpsPermissionModals } from '../permissions/components/VideoOpsPermissionModals';
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
import { subscribeToAlbumContentsChanged } from '../library/albumContentsEvents';
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

/** 이름 변경 요청: 어느 앨범을 어디(상위 폴더 + 새 이름)로 바꾸는지. */
interface RenameRequest {
  oldDeviceAlbumId: string;
  newTitle: string;
  newDirectory: string;
}

/** 권한 안내를 거쳐 나중에 실행할 수 있는 앨범 작업 한 건. */
interface AlbumOperation {
  mutation: MediaMutation;
  rename?: RenameRequest;
}

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
  const trashAvailable = useMemo(() => isTrashAvailable(), []);
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {trashAvailable ? (
            <HeaderIconButton
              testID="album-menu-trash"
              glyph="🗑"
              accessibilityLabel={tHeader('trashButtonLabel')}
              onPress={() => navigation.navigate('Trash')}
            />
          ) : null}
          <HeaderIconButton
            testID="album-menu-settings"
            glyph="⚙"
            accessibilityLabel={tHeader('settingsButtonLabel')}
            onPress={() => navigation.navigate('AppSettings')}
          />
        </View>
      ),
    });
  }, [navigation, tHeader, trashAvailable]);

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

  // 갤러리·뷰어에서 사진을 삭제·이동하면 이 화면은 백그라운드에 남아 있어 focus 재조회가 없으므로
  // 알림으로 앨범 목록(커버·개수)을 다시 조회한다.
  useEffect(
    () => subscribeToAlbumContentsChanged(() => setAlbumReloadToken((token) => token + 1)),
    []
  );

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

  // --- 앨범 단위 파일 관리(삭제·이동·복사·이름 변경): 길게 눌러 선택 모드. Android 11+에서만 켠다. ---
  const { t: tg } = useTranslation('gallery');
  const fileManagement = useMemo(() => isFileManagementAvailable(), []);
  const [selected, setSelected] = useState<ReadonlySet<string> | null>(null);
  const [mutating, setMutating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [moveDialogVisible, setMoveDialogVisible] = useState(false);
  const [moveMode, setMoveMode] = useState<MoveMode>('move');
  const [renameVisible, setRenameVisible] = useState(false);
  // 모든 파일 접근 권한 안내를 거쳐 실행해야 하는 작업은 작업(mutation)과 이름 변경 문맥을 함께 들고 간다.
  const directMoveGate = useDirectMoveGate<AlbumOperation>(
    (operation) => applyMutation(operation.mutation, operation.rename),
    () => setNotice(tg('allFilesAccess.denied'))
  );
  const selecting = selected !== null;

  // 영상 권한이 없으면 앨범 단위 작업이 영상을 건드리지 못한다 — 작업 전에 알리고 권한을 받을 기회를 준다.
  const videoPermission = useMediaLibraryPermission(VIDEO_GRANULAR_PERMISSIONS);
  const [videoPromptVisible, setVideoPromptVisible] = useState(false);
  const [videoBlockedVisible, setVideoBlockedVisible] = useState(false);
  const videoAcknowledgedRef = useRef(false);
  const afterVideoPromptRef = useRef<(() => void) | null>(null);

  function guardVideoAccess(action: () => void) {
    if (!videoPermission.isReady || videoPermission.state === 'granted' || videoAcknowledgedRef.current) {
      action();
      return;
    }
    afterVideoPromptRef.current = action;
    setVideoPromptVisible(true);
  }

  function allowVideoAccess() {
    setVideoPromptVisible(false);
    if (videoPermission.state === 'blocked' || videoPermission.state === 'partial_unsupported') {
      setVideoBlockedVisible(true);
    } else {
      videoPermission.start();
    }
  }

  function proceedWithoutVideos() {
    videoAcknowledgedRef.current = true;
    setVideoPromptVisible(false);
    const action = afterVideoPromptRef.current;
    afterVideoPromptRef.current = null;
    action?.();
  }

  function cancelVideoPrompt() {
    afterVideoPromptRef.current = null;
    setVideoPromptVisible(false);
  }

  // 영상 권한을 받고 돌아오면 멈춰 있던 작업을 이어서 한다.
  useEffect(() => {
    if (videoPermission.state !== 'granted' || !afterVideoPromptRef.current) return;
    const action = afterVideoPromptRef.current;
    afterVideoPromptRef.current = null;
    setVideoBlockedVisible(false);
    action();
  }, [videoPermission.state]);

  function exitSelection() {
    setSelected(null);
  }

  // 선택 모드에서 하드웨어 뒤로가기는 앱을 닫지 않고 선택 모드부터 끈다(이 화면은 스택의 루트다).
  useEffect(() => {
    if (!selecting) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      setSelected(null);
      return true;
    });
    return () => subscription.remove();
  }, [selecting]);

  // 목록이 바뀌어(삭제·이동·이름 변경으로 앨범이 사라짐) 선택한 앨범이 없어지면 선택에서 뺀다.
  useEffect(() => {
    setSelected((current) => {
      if (current === null) return current;
      const alive = new Set(albums.map((album) => album.id));
      const kept = [...current].filter((id) => alive.has(id));
      return kept.length === current.size ? current : new Set(kept);
    });
  }, [albums]);

  function openMoveDialog(mode: MoveMode) {
    setMoveMode(mode);
    setMoveDialogVisible(true);
  }

  function runDecision(decision: MoveDecision, rename?: RenameRequest) {
    setMoveDialogVisible(false);
    setRenameVisible(false);
    if (decision.type === 'mutation') applyMutation(decision.mutation, rename);
    else directMoveGate.request({ mutation: decision.mutation, rename }, decision.title);
  }

  async function applyMutation(mutation: MediaMutation, rename?: RenameRequest) {
    if (!selected || selected.size === 0 || mutating) return;
    setMutating(true);
    setNotice(null);
    try {
      // 이름 변경은 작업이 끝난 뒤 옛 앨범의 설정을 새 앨범으로 옮겨야 하므로, 옮기기 전 항목을 먼저 기억해 둔다.
      const renameContext = rename
        ? await captureRenameContext(rename.oldDeviceAlbumId, rename.newTitle, rename.newDirectory)
        : null;
      const result = await runAlbumsMutation([...selected], mutation, { keepSelectedPhotos: renameContext !== null });
      const outcome = mutationOutcome(result.summary);
      if (outcome === 'success') {
        if (renameContext) await migrateRenamedAlbum(renameContext);
        exitSelection();
        if (isCopyMutation(mutation)) setNotice(tg('mutationCopied', { count: result.summary.removedIds.length }));
        else if (movesToTrash(mutation)) setNotice(tg('mutationTrashed', { count: result.summary.removedIds.length }));
      } else if (outcome === 'partial') {
        setNotice(
          tg('mutationPartial', { done: result.summary.removedIds.length, left: result.summary.remainingIds.length })
        );
      } else {
        const failure = nothingDoneNotice(result.error);
        setNotice('values' in failure ? tg(failure.key, failure.values) : tg(failure.key));
      }
    } catch (e) {
      console.warn('[AlbumList] album mutation failed', e);
      setNotice(tg('mutationNothingDone'));
    } finally {
      setMutating(false);
    }
  }

  // 이름 변경은 앨범 1개를 "같은 상위 폴더의 새 이름 폴더"로 옮기는 것이다. 상위 폴더를 알아야 하므로
  // 앨범의 폴더 경로(앨범 캐시에 저장된 값)가 없으면 할 수 없다.
  const renameTarget = useMemo(() => {
    if (!selected || selected.size !== 1) return null;
    const album = albums.find((item) => item.id === [...selected][0]);
    const directory = folderPathToDirectory(album?.folderPath);
    const parent = directory ? parentDirectory(directory) : null;
    return album && directory && parent ? { album, parent } : null;
  }, [selected, albums]);
  const renameSiblingNames = useMemo(() => {
    if (!renameTarget) return [];
    return albums.flatMap((album) => {
      const directory = folderPathToDirectory(album.folderPath);
      return directory && parentDirectory(directory) === renameTarget.parent ? [directoryName(directory)] : [];
    });
  }, [albums, renameTarget]);

  function toggleAlbum(item: AlbumListItem) {
    if (mutating) return;
    setSelected((current) => toggleSelection(current ?? new Set<string>(), item.id));
  }

  function handleAlbumLongPress(item: AlbumListItem) {
    if (!fileManagement) return;
    toggleAlbum(item);
  }

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

  // 선택 모드에서는 탭이 열기가 아니라 선택 토글이다.
  function openAlbum(item: AlbumListItem) {
    if (selecting) {
      toggleAlbum(item);
      return;
    }
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
        onLongPress={() => handleAlbumLongPress(item)}
      >
        {renderCover(item, styles.thumbnail)}
        <View style={styles.scrim}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {item.title}
          </Text>
        </View>
        {selected?.has(item.id) ? <SelectMark testID={`album-select-check-${item.id}`} /> : null}
      </Pressable>
    );
  }

  function renderRow(item: AlbumListItem) {
    return (
      <Pressable
        testID={`album-card-${item.id}`}
        style={[styles.row, selected?.has(item.id) && styles.rowSelected]}
        onPress={() => openAlbum(item)}
        onLongPress={() => handleAlbumLongPress(item)}
      >
        {renderCover(item, styles.rowThumbnail)}
        <Text style={styles.rowTitle} numberOfLines={1}>
          {item.title}
        </Text>
        {selected?.has(item.id) ? <Text testID={`album-select-check-${item.id}`} style={styles.rowCheck}>✓</Text> : null}
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
          extraData={selected}
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
          extraData={selected}
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
        extraData={selected}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={emptyComponent}
        renderItem={({ item }) => renderCard(item)}
      />
    );
  }

  return (
    <View style={styles.flex} {...(viewMode !== 'list' ? pinchHandlers : null)}>
      {selected !== null ? (
        <SelectionBar
          count={selected.size}
          busy={mutating}
          onCancel={exitSelection}
          onSelectAll={() => setSelected(new Set(sortedAlbums.map((album) => album.id)))}
          onMove={() => guardVideoAccess(() => openMoveDialog('move'))}
          onCopy={() => guardVideoAccess(() => openMoveDialog('copy'))}
          onDelete={() => guardVideoAccess(() => applyMutation({ kind: 'delete' }))}
          onRename={
            selected.size === 1
              ? () =>
                  renameTarget
                    ? guardVideoAccess(() => setRenameVisible(true))
                    : setNotice(tg('renameUnavailable'))
              : undefined
          }
        />
      ) : (
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
      )}
      {notice ? (
        <Text testID="album-mutation-notice" style={styles.notice}>
          {notice}
        </Text>
      ) : null}
      <View style={styles.flex}>{renderBody()}</View>

      <MoveTargetModal
        visible={moveDialogVisible}
        mode={moveMode}
        excludeDeviceAlbumIds={selected ? [...selected] : []}
        onClose={() => setMoveDialogVisible(false)}
        onSelect={(target) => runDecision(decideTargetMove(moveMode, target))}
        onCreateFolder={(folderName, parentDir) => runDecision(decideNewFolderMove(moveMode, parentDir, folderName))}
      />
      <RenameAlbumModal
        visible={renameVisible}
        currentName={renameTarget?.album.title ?? ''}
        siblingNames={renameSiblingNames}
        onClose={() => setRenameVisible(false)}
        onConfirm={(newName) => {
          if (!renameTarget) return;
          runDecision(decideNewFolderMove('move', renameTarget.parent, newName), {
            oldDeviceAlbumId: renameTarget.album.id,
            newTitle: newName,
            newDirectory: `${renameTarget.parent}/${newName}`,
          });
        }}
      />
      <AllFilesAccessModal {...directMoveGate.rationale} />
      <VideoOpsPermissionModals
        videoPermission={videoPermission}
        promptVisible={videoPromptVisible}
        onAllow={allowVideoAccess}
        onProceedWithoutVideos={proceedWithoutVideos}
        onCancelPrompt={cancelVideoPrompt}
        blockedVisible={videoBlockedVisible}
        onCloseBlocked={() => {
          setVideoBlockedVisible(false);
          afterVideoPromptRef.current = null;
        }}
      />

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
    rowSelected: {
      backgroundColor: c.accentSoft,
    },
    rowCheck: {
      fontSize: 16,
      fontWeight: '700',
      color: c.accent,
      paddingRight: 8,
    },
    notice: {
      fontSize: 13,
      color: c.textSecondary,
      paddingHorizontal: 16,
      paddingVertical: 8,
      backgroundColor: c.accentSoft,
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
