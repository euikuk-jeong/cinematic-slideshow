import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Modal, Pressable, SectionList, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { GranularPermission } from 'expo-media-library';
import { useTranslation } from 'react-i18next';

import type { RootStackParamList } from '../../App';
import { AppBannerAd } from '../ads/AppBannerAd';
import { getAppSetting, setAppSetting } from '../db/client';
import { HeaderIconButton } from '../library/HeaderIconButton';
import { LibrarySortDialog } from '../library/LibrarySortDialog';
import { LibraryToolbar } from '../library/LibraryToolbar';
import { PermissionBlocked } from '../permissions/components/PermissionBlocked';
import { PermissionRationale } from '../permissions/components/PermissionRationale';
import { VideoAccessBanner } from '../permissions/components/VideoAccessBanner';
import { useMediaLibraryPermission } from '../permissions/useMediaLibraryPermission';
import { openVideoInExternalPlayer } from '../photos/externalPlayer';
import { buildGalleryOrder, countImages, type GalleryItem } from '../photos/galleryItem';
import { formatDuration } from '../photos/mediaFormat';
import {
  chunkItems,
  groupPhotosByDate,
  type DateSectionLabelFormatter,
  type PhotoSortCriterion,
  type PhotoSortDirection,
} from '../photos/photoSort';
import { queryAlbumItems } from '../photos/queryAlbumItems';
import { usePhotoUri } from '../photos/usePhotoUri';
import { usePinchColumns } from '../photos/usePinchColumns';
import { prepareAlbumForPlayback } from '../slideshow/albumSetup';
import {
  DEFAULT_GALLERY_COLUMNS,
  DEFAULT_GALLERY_SORT_CRITERION,
  DEFAULT_GALLERY_SORT_DIRECTION,
  DEFAULT_GALLERY_VIEW_MODE,
  GALLERY_COLUMN_RANGE,
  GALLERY_GRID_COLUMNS_STORAGE_KEY,
  GALLERY_SORT_CRITERION_STORAGE_KEY,
  GALLERY_SORT_DIRECTION_STORAGE_KEY,
  GALLERY_VIDEO_BANNER_DISMISSED_STORAGE_KEY,
  GALLERY_VIEW_MODE_STORAGE_KEY,
  parseGalleryColumns,
  parseGallerySortCriterion,
  parseGallerySortDirection,
  parseGalleryViewMode,
  parseVideoBannerDismissed,
  type GalleryViewMode,
} from '../settings/galleryViewSettings';
import { nextLibraryViewMode } from '../settings/libraryViewMode';
import type { ThemeColors } from '../theme/colors';
import { useAppTheme } from '../theme/ThemeContext';

type AlbumGalleryScreenProps = NativeStackScreenProps<RootStackParamList, 'AlbumGallery'>;

// useMediaLibraryPermission은 인자를 deps에 넣지 않으므로 반드시 안정적인 모듈 상수를 넘긴다.
// 영상은 사진 권한 훅과 분리된 별도 인스턴스로 요청한다 — 사진만 허용하고 영상을 거부한 사용자의
// 통합 상태가 granted가 아니게 되어 사진까지 막히는 일을 피한다(NFR-P2).
const VIDEO_GRANULAR_PERMISSIONS: GranularPermission[] = ['video'];

const GRID_GAP = 3;
const GRID_PADDING = 3;
// 이 열 수 이하에서만 타일에 파일명을 얹는다(4열부터는 타일이 작아 글자가 읽히지 않는다).
const MAX_COLUMNS_WITH_FILENAME = 3;
const LIST_THUMBNAIL_SIZE = 56;

const SORT_CRITERION_OPTIONS: ReadonlyArray<{ criterion: PhotoSortCriterion; labelKey: string }> = [
  { criterion: 'creation_time', labelKey: 'common:sortCriterion.captureTime' },
  { criterion: 'filename', labelKey: 'common:sortCriterion.filename' },
];

interface LoadedSettings {
  sortCriterion: PhotoSortCriterion;
  sortDirection: PhotoSortDirection;
  viewMode: GalleryViewMode;
  columns: number;
  videoBannerDismissed: boolean;
}

type LoadState = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; items: GalleryItem[] };

export function AlbumGalleryScreen({ route, navigation }: AlbumGalleryScreenProps) {
  const { deviceAlbumId, displayName } = route.params;
  const { colors: c } = useAppTheme();
  const { t } = useTranslation('gallery');
  const styles = useMemo(() => createStyles(c), [c]);
  const { width: windowWidth } = useWindowDimensions();

  const [settings, setSettings] = useState<LoadedSettings | null>(null);
  const [load, setLoad] = useState<LoadState>({ kind: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  const [searchActive, setSearchActive] = useState(false);
  const [query, setQuery] = useState('');
  const [sortDialogVisible, setSortDialogVisible] = useState(false);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState(false);

  const dateSectionFormatter: DateSectionLabelFormatter = useMemo(
    () => ({
      unknownDate: t('noDateLabel'),
      formatDate: (year, month, day) => t('dateLabel', { year, month, day }),
    }),
    [t]
  );

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getAppSetting(GALLERY_SORT_CRITERION_STORAGE_KEY),
      getAppSetting(GALLERY_SORT_DIRECTION_STORAGE_KEY),
      getAppSetting(GALLERY_VIEW_MODE_STORAGE_KEY),
      getAppSetting(GALLERY_GRID_COLUMNS_STORAGE_KEY),
      getAppSetting(GALLERY_VIDEO_BANNER_DISMISSED_STORAGE_KEY),
    ])
      .then(([criterion, direction, viewMode, columns, bannerDismissed]) => {
        if (cancelled) return;
        setSettings({
          sortCriterion: parseGallerySortCriterion(criterion),
          sortDirection: parseGallerySortDirection(direction),
          viewMode: parseGalleryViewMode(viewMode),
          columns: parseGalleryColumns(columns),
          videoBannerDismissed: parseVideoBannerDismissed(bannerDismissed),
        });
      })
      .catch((e) => {
        console.warn('[AlbumGallery] failed to load view settings', e);
        if (cancelled) return;
        setSettings({
          sortCriterion: DEFAULT_GALLERY_SORT_CRITERION,
          sortDirection: DEFAULT_GALLERY_SORT_DIRECTION,
          viewMode: DEFAULT_GALLERY_VIEW_MODE,
          columns: DEFAULT_GALLERY_COLUMNS,
          videoBannerDismissed: false,
        });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 화면에 (다시) 포커스될 때마다 재조회해 카메라로 찍은 사진·삭제된 사진을 반영한다.
  // 마운트 시 최초 포커스 한 번이 최초 조회를 겸한다.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      queryAlbumItems(deviceAlbumId)
        .then((items) => {
          if (!cancelled) setLoad({ kind: 'ready', items });
        })
        .catch((e) => {
          console.warn('[AlbumGallery] failed to load album items', e);
          if (!cancelled) setLoad({ kind: 'error' });
        });
      return () => {
        cancelled = true;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [deviceAlbumId, reloadKey])
  );

  const videoPermission = useMediaLibraryPermission(VIDEO_GRANULAR_PERMISSIONS);
  const [videoBlockedVisible, setVideoBlockedVisible] = useState(false);
  // 영상 권한이 (조회 시점 이후에) 새로 허용되면 영상 행이 보이도록 재조회한다. 최초 상태 확인
  // 결과(이미 허용)로는 재조회하지 않는다 — 최초 조회가 이미 영상을 포함한다.
  const previousVideoStateRef = useRef<string | null>(null);
  useEffect(() => {
    if (!videoPermission.isReady) return;
    const previous = previousVideoStateRef.current;
    previousVideoStateRef.current = videoPermission.state;
    if (previous !== null && previous !== 'granted' && videoPermission.state === 'granted') {
      setVideoBlockedVisible(false);
      setReloadKey((k) => k + 1);
    }
  }, [videoPermission.isReady, videoPermission.state]);

  const showVideoBanner =
    !!settings && !settings.videoBannerDismissed && videoPermission.isReady && videoPermission.state !== 'granted';

  function handleVideoBannerPress() {
    if (videoPermission.state === 'blocked' || videoPermission.state === 'partial_unsupported') {
      setVideoBlockedVisible(true);
    } else {
      videoPermission.start();
    }
  }

  function dismissVideoBanner() {
    setSettings((prev) => (prev ? { ...prev, videoBannerDismissed: true } : prev));
    setAppSetting(GALLERY_VIDEO_BANNER_DISMISSED_STORAGE_KEY, '1').catch((e) =>
      console.warn('[AlbumGallery] failed to save video banner dismissal', e)
    );
  }

  function retry() {
    setLoad({ kind: 'loading' });
    setReloadKey((k) => k + 1);
  }

  function updateSettings(patch: Partial<LoadedSettings>, storageKey: string, value: string) {
    setSettings((prev) => (prev ? { ...prev, ...patch } : prev));
    setAppSetting(storageKey, value).catch((e) => console.warn(`[AlbumGallery] failed to save ${storageKey}`, e));
  }

  const columns = settings?.columns ?? DEFAULT_GALLERY_COLUMNS;
  const pinchHandlers = usePinchColumns(
    columns,
    GALLERY_COLUMN_RANGE,
    (next) => setSettings((prev) => (prev ? { ...prev, columns: next } : prev)),
    (next) => {
      setAppSetting(GALLERY_GRID_COLUMNS_STORAGE_KEY, String(next)).catch((e) =>
        console.warn('[AlbumGallery] failed to save grid columns', e)
      );
    }
  );

  const items = load.kind === 'ready' ? load.items : null;
  // 검색을 닫으면 검색어도 함께 비운다 — 입력창이 안 보이는데 필터만 남는 일이 없게.
  const activeQuery = searchActive ? query : '';
  const order = useMemo(
    () =>
      items && settings
        ? buildGalleryOrder(
            items,
            settings.sortCriterion,
            settings.sortDirection,
            settings.viewMode,
            dateSectionFormatter,
            activeQuery
          )
        : [],
    [items, settings, dateSectionFormatter, activeQuery]
  );
  const dateSections = useMemo(() => {
    if (!settings || settings.viewMode !== 'date' || !items) return [];
    return groupPhotosByDate(
      // buildGalleryOrder와 같은 정렬 결과를 섹션으로 다시 묶는다(섹션 내부 순서는 입력 순서 보존).
      order,
      dateSectionFormatter
    ).map((section) => ({
      key: section.key,
      title: section.label,
      data: chunkItems(section.items, columns).map((row, index) => ({ rowKey: `${section.key}-${index}`, row })),
    }));
  }, [settings, items, order, dateSectionFormatter, columns]);

  const itemSize = (windowWidth - GRID_PADDING * 2 - GRID_GAP * (columns - 1)) / columns;
  // 슬라이드쇼 가능 여부는 검색 결과가 아니라 앨범 전체 기준이다(재생은 앨범 전체/선택 사진을 쓴다).
  const imageCount = items ? countImages(items) : 0;
  const slideshowDisabled = !items || imageCount === 0 || starting;

  // 설정을 거치지 않고 바로 재생한다. 신규 앨범이면 설정 화면 첫 진입과 똑같이 앨범 row와 기본
  // 배경음악을 먼저 저장해 두어야 재생 화면이 음악을 재생한다(prepareAlbumForPlayback).
  const startSlideshow = useCallback(async () => {
    setStartError(false);
    setStarting(true);
    try {
      const album = await prepareAlbumForPlayback(deviceAlbumId, displayName);
      navigation.navigate('SlideshowPlayer', { albumId: album.id, deviceAlbumId });
    } catch (e) {
      console.warn('[AlbumGallery] failed to prepare slideshow', e);
      setStartError(true);
    } finally {
      setStarting(false);
    }
  }, [navigation, deviceAlbumId, displayName]);

  // 슬라이드쇼 재생과 앨범 설정 진입은 헤더 우측에 둔다(스크롤해도 항상 보이도록). 사진이 없으면 재생은 비활성.
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={styles.headerActions}>
          <Pressable
            testID="gallery-slideshow-button"
            accessibilityRole="button"
            accessibilityState={{ disabled: slideshowDisabled }}
            disabled={slideshowDisabled}
            hitSlop={8}
            style={[styles.headerButton, slideshowDisabled && styles.headerButtonDisabled]}
            onPress={startSlideshow}
          >
            <Text style={styles.headerButtonText}>{t('slideshowButton')}</Text>
          </Pressable>
          <HeaderIconButton
            testID="gallery-album-settings-button"
            glyph="⚙"
            accessibilityLabel={t('albumSettingsButtonLabel')}
            onPress={() => navigation.navigate('AlbumSettings', { deviceAlbumId, displayName })}
          />
        </View>
      ),
    });
  }, [navigation, slideshowDisabled, startSlideshow, styles, t, deviceAlbumId, displayName]);

  // 영상 타일은 뷰어(내장 플레이어)를 거치지 않고 바로 다른 플레이어 앱으로 연다. 내장 플레이어는
  // 기능이 제한적이라 뷰어에서 다시 "다른 앱"을 누르는 한 단계가 불필요하다는 피드백 반영. 열 수 있는
  // 앱이 없거나(실패) Android가 아니면 기존처럼 뷰어로 간다 — 뷰어에서는 내장 플레이어로 볼 수 있다.
  async function openItem(item: GalleryItem) {
    if (item.mediaKind === 'video') {
      const result = await openVideoInExternalPlayer(item.id);
      if (result === 'opened') return;
    }
    openViewer(item);
  }

  function openViewer(item: GalleryItem) {
    if (!settings) return;
    navigation.navigate('PhotoViewer', {
      deviceAlbumId,
      displayName,
      initialAssetId: item.id,
      sortCriterion: settings.sortCriterion,
      sortDirection: settings.sortDirection,
      viewMode: settings.viewMode,
      searchQuery: activeQuery,
    });
  }

  function closeSearch() {
    setSearchActive(false);
    setQuery('');
  }

  // 스크롤과 함께 올라가는 안내(영상 권한 배너, 슬라이드쇼 불가 힌트, 시작 실패)만 목록 헤더에 둔다.
  // 정렬·보기·검색 도구는 스크롤되지 않는 툴바로 옮겼다.
  function renderListHeader() {
    if (!settings) return null;
    const hasHint = (items && imageCount === 0) || startError;
    return (
      <>
        {showVideoBanner ? <VideoAccessBanner onPress={handleVideoBannerPress} onDismiss={dismissVideoBanner} /> : null}
        {hasHint ? (
          <View style={styles.hints}>
            {items && imageCount === 0 ? <Text style={styles.hintText}>{t('slideshowDisabledHint')}</Text> : null}
            {startError ? (
              <Text testID="gallery-start-error" style={styles.errorText}>
                {t('slideshowStartError')}
              </Text>
            ) : null}
          </View>
        ) : null}
      </>
    );
  }

  const emptyComponent = (
    <View style={styles.centered}>
      <Text style={styles.emptyText}>
        {activeQuery.trim().length > 0 ? t('common:emptyState.noSearchResults') : t('noPhotos')}
      </Text>
    </View>
  );

  const showFilename = columns <= MAX_COLUMNS_WITH_FILENAME;
  const photoSummaryCount = countImages(order);
  const videoSummaryCount = order.length - photoSummaryCount;
  const summary = !items
    ? ''
    : videoSummaryCount > 0
      ? `${t('summaryPhotos', { count: photoSummaryCount })} · ${t('summaryVideos', { count: videoSummaryCount })}`
      : t('summaryPhotos', { count: photoSummaryCount });

  function renderBody() {
    if (load.kind === 'error') {
      return (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{t('loadError')}</Text>
          <Pressable testID="gallery-retry" accessibilityRole="button" style={styles.retryButton} onPress={retry}>
            <Text style={styles.retryButtonText}>{t('retry')}</Text>
          </Pressable>
        </View>
      );
    }
    if (load.kind === 'loading' || !settings) {
      return (
        <View style={styles.centered}>
          <ActivityIndicator testID="gallery-loading" />
        </View>
      );
    }
    if (settings.viewMode === 'date') {
      return (
        <SectionList
          sections={dateSections}
          keyExtractor={(row) => row.rowKey}
          stickySectionHeadersEnabled={false}
          ListHeaderComponent={renderListHeader}
          ListEmptyComponent={emptyComponent}
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionHeaderText}>{section.title}</Text>
            </View>
          )}
          renderItem={({ item: row }) => (
            <View style={styles.gridRow}>
              {row.row.map((media) => (
                <GalleryTile
                  key={media.id}
                  item={media}
                  size={itemSize}
                  showFilename={showFilename}
                  onPress={() => openItem(media)}
                />
              ))}
            </View>
          )}
        />
      );
    }
    if (settings.viewMode === 'list') {
      return (
        <FlatList
          key="list"
          data={order}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={renderListHeader}
          ListEmptyComponent={emptyComponent}
          renderItem={({ item }) => (
            <GalleryRow item={item} dateFormatter={dateSectionFormatter} onPress={() => openItem(item)} />
          )}
        />
      );
    }
    return (
      <FlatList
        key={`grid-${columns}`}
        data={order}
        numColumns={columns}
        keyExtractor={(item) => item.id}
        columnWrapperStyle={columns > 1 ? styles.gridRow : undefined}
        ListHeaderComponent={renderListHeader}
        ListEmptyComponent={emptyComponent}
        renderItem={({ item }) => (
          <GalleryTile item={item} size={itemSize} showFilename={showFilename} onPress={() => openItem(item)} />
        )}
      />
    );
  }

  return (
    // 목록 보기에는 열이 없으므로 핀치 핸들러를 붙이지 않는다(보이지 않는 열 수가 바뀌어 저장되는 것을 막는다).
    <View style={styles.flex} {...(settings?.viewMode !== 'list' ? pinchHandlers : null)}>
      {settings ? (
        <LibraryToolbar
          testIDPrefix="gallery"
          summary={summary}
          searchPlaceholder={t('searchPlaceholder')}
          searchActive={searchActive}
          query={query}
          onQueryChange={setQuery}
          onSearchOpen={() => setSearchActive(true)}
          onSearchClose={closeSearch}
          viewMode={settings.viewMode}
          onViewModeCycle={() => {
            const next = nextLibraryViewMode(settings.viewMode);
            updateSettings({ viewMode: next }, GALLERY_VIEW_MODE_STORAGE_KEY, next);
          }}
          onSortPress={() => setSortDialogVisible(true)}
        />
      ) : null}
      <View style={styles.flex}>{renderBody()}</View>
      {settings ? (
        <LibrarySortDialog
          visible={sortDialogVisible}
          onClose={() => setSortDialogVisible(false)}
          testIDPrefix="gallery"
          criteria={SORT_CRITERION_OPTIONS.map((option) => ({ value: option.criterion, label: t(option.labelKey) }))}
          criterion={settings.sortCriterion}
          onCriterionChange={(criterion) =>
            updateSettings({ sortCriterion: criterion }, GALLERY_SORT_CRITERION_STORAGE_KEY, criterion)
          }
          direction={settings.sortDirection}
          onDirectionChange={(direction) =>
            updateSettings({ sortDirection: direction }, GALLERY_SORT_DIRECTION_STORAGE_KEY, direction)
          }
        />
      ) : null}
      <Modal
        visible={videoPermission.state === 'rationale' || videoBlockedVisible}
        animationType="fade"
        onRequestClose={() => {
          if (videoPermission.state === 'rationale') videoPermission.cancelRationale();
          setVideoBlockedVisible(false);
        }}
      >
        <View style={styles.permissionModal}>
          {videoPermission.state === 'rationale' ? (
            <PermissionRationale
              variant="video"
              onConfirm={videoPermission.confirmRationale}
              onCancel={videoPermission.cancelRationale}
            />
          ) : (
            <>
              <PermissionBlocked variant="video_blocked" onOpenSettings={videoPermission.openSettings} />
              <Pressable
                testID="video-blocked-close"
                accessibilityRole="button"
                style={styles.permissionModalClose}
                onPress={() => setVideoBlockedVisible(false)}
              >
                <Text style={styles.permissionModalCloseText}>{t('common:cancel')}</Text>
              </Pressable>
            </>
          )}
        </View>
      </Modal>
      <AppBannerAd />
    </View>
  );
}

function GalleryRow({
  item,
  dateFormatter,
  onPress,
}: {
  item: GalleryItem;
  dateFormatter: DateSectionLabelFormatter;
  onPress: () => void;
}) {
  const { uri, error } = usePhotoUri(item.id, item.modificationTime);
  const { colors: c } = useAppTheme();
  const { t } = useTranslation('gallery');
  const styles = useMemo(() => createStyles(c), [c]);
  const duration = item.mediaKind === 'video' ? formatDuration(item.durationMs) : null;
  const date = item.creationTime === null ? dateFormatter.unknownDate : formatItemDate(item.creationTime, dateFormatter);
  return (
    <Pressable
      testID={`gallery-item-${item.id}`}
      accessibilityRole="imagebutton"
      accessibilityLabel={item.filename ?? undefined}
      style={styles.listRow}
      onPress={onPress}
    >
      <View style={styles.listThumbnail}>
        {uri ? (
          <Image source={{ uri }} style={StyleSheet.absoluteFill} />
        ) : error ? (
          <Text testID={`thumb-error-${item.id}`} accessibilityLabel={t('thumbnailError')} style={styles.tileErrorText}>
            !
          </Text>
        ) : null}
        {item.mediaKind === 'video' ? (
          <View testID={`video-badge-${item.id}`} style={styles.videoBadge}>
            <Text style={styles.videoBadgeText}>▶</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.listText}>
        <Text testID={`gallery-filename-${item.id}`} style={styles.listFilename} numberOfLines={1}>
          {item.filename ?? ''}
        </Text>
        <Text style={styles.listSubtitle} numberOfLines={1}>
          {duration ? `${date} · ▶ ${duration}` : date}
        </Text>
      </View>
    </Pressable>
  );
}

function formatItemDate(time: number, formatter: DateSectionLabelFormatter): string {
  const d = new Date(time);
  return formatter.formatDate(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

function GalleryTile({
  item,
  size,
  showFilename,
  onPress,
}: {
  item: GalleryItem;
  size: number;
  showFilename: boolean;
  onPress: () => void;
}) {
  const { uri, error } = usePhotoUri(item.id, item.modificationTime);
  const { colors: c } = useAppTheme();
  const { t } = useTranslation('gallery');
  const styles = useMemo(() => createStyles(c), [c]);
  const duration = item.mediaKind === 'video' ? formatDuration(item.durationMs) : null;
  return (
    <Pressable
      testID={`gallery-item-${item.id}`}
      accessibilityRole="imagebutton"
      accessibilityLabel={item.mediaKind === 'video' ? t('videoItemLabel', { duration: duration ?? '' }) : (item.filename ?? undefined)}
      style={[styles.tile, { width: size, height: size }]}
      onPress={onPress}
    >
      {uri ? (
        <Image source={{ uri }} style={StyleSheet.absoluteFill} />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.tilePlaceholder]}>
          {error ? (
            <Text testID={`thumb-error-${item.id}`} accessibilityLabel={t('thumbnailError')} style={styles.tileErrorText}>
              !
            </Text>
          ) : null}
        </View>
      )}
      {item.mediaKind === 'video' ? (
        <View testID={`video-badge-${item.id}`} style={styles.videoBadge}>
          <Text style={styles.videoBadgeText}>▶{duration ? ` ${duration}` : ''}</Text>
        </View>
      ) : null}
      {showFilename && item.filename ? (
        <View style={styles.filenameScrim}>
          <Text testID={`gallery-filename-${item.id}`} style={styles.filenameText} numberOfLines={1}>
            {item.filename}
          </Text>
        </View>
      ) : null}
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
      gap: 12,
    },
    emptyText: {
      color: c.textSecondary,
    },
    errorText: {
      fontSize: 14,
      color: c.accent,
      textAlign: 'center',
    },
    permissionModal: {
      flex: 1,
      backgroundColor: c.background,
    },
    permissionModalClose: {
      alignSelf: 'center',
      paddingVertical: 12,
      paddingHorizontal: 24,
      marginBottom: 24,
    },
    permissionModalCloseText: {
      color: c.textSecondary,
    },
    retryButton: {
      paddingVertical: 8,
      paddingHorizontal: 16,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: c.accent,
    },
    retryButtonText: {
      color: c.accent,
      fontWeight: '600',
    },
    hints: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      gap: 4,
    },
    headerActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    headerButton: {
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: 16,
      backgroundColor: c.accent,
    },
    headerButtonDisabled: {
      opacity: 0.4,
    },
    headerButtonText: {
      color: '#fff',
      fontSize: 14,
      fontWeight: '700',
    },
    hintText: {
      fontSize: 12,
      color: c.textSecondary,
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
    tile: {
      overflow: 'hidden',
      backgroundColor: c.hairline,
      marginBottom: GRID_GAP,
    },
    tilePlaceholder: {
      backgroundColor: c.hairline,
      alignItems: 'center',
      justifyContent: 'center',
    },
    tileErrorText: {
      color: c.textSecondary,
      fontSize: 18,
      fontWeight: '700',
    },
    filenameScrim: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      paddingHorizontal: 5,
      paddingVertical: 3,
      backgroundColor: c.scrim,
    },
    filenameText: {
      color: '#fff',
      fontSize: 10,
    },
    listRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      minHeight: 72,
      paddingHorizontal: 16,
      paddingVertical: 8,
    },
    listThumbnail: {
      width: LIST_THUMBNAIL_SIZE,
      height: LIST_THUMBNAIL_SIZE,
      borderRadius: 8,
      overflow: 'hidden',
      backgroundColor: c.hairline,
      alignItems: 'center',
      justifyContent: 'center',
    },
    listText: {
      flex: 1,
      gap: 2,
    },
    listFilename: {
      fontSize: 15,
      color: c.ink,
    },
    listSubtitle: {
      fontSize: 12,
      color: c.textSecondary,
    },
    videoBadge: {
      position: 'absolute',
      left: 4,
      top: 4,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 4,
      backgroundColor: 'rgba(0,0,0,0.6)',
    },
    videoBadgeText: {
      color: '#fff',
      fontSize: 11,
      fontWeight: '600',
    },
  });
}
