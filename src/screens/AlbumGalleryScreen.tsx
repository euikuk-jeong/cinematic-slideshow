import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Modal, Pressable, SectionList, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { GranularPermission } from 'expo-media-library';
import { useTranslation } from 'react-i18next';

import type { RootStackParamList } from '../../App';
import { AppBannerAd } from '../ads/AppBannerAd';
import { getAppSetting, setAppSetting } from '../db/client';
import { PermissionBlocked } from '../permissions/components/PermissionBlocked';
import { PermissionRationale } from '../permissions/components/PermissionRationale';
import { VideoAccessBanner } from '../permissions/components/VideoAccessBanner';
import { useMediaLibraryPermission } from '../permissions/useMediaLibraryPermission';
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
import type { ThemeColors } from '../theme/colors';
import { useAppTheme } from '../theme/ThemeContext';

type AlbumGalleryScreenProps = NativeStackScreenProps<RootStackParamList, 'AlbumGallery'>;

// useMediaLibraryPermission은 인자를 deps에 넣지 않으므로 반드시 안정적인 모듈 상수를 넘긴다.
// 영상은 사진 권한 훅과 분리된 별도 인스턴스로 요청한다 — 사진만 허용하고 영상을 거부한 사용자의
// 통합 상태가 granted가 아니게 되어 사진까지 막히는 일을 피한다(NFR-P2).
const VIDEO_GRANULAR_PERMISSIONS: GranularPermission[] = ['video'];

const GRID_GAP = 3;
const GRID_PADDING = 3;

const SORT_CRITERION_OPTIONS: ReadonlyArray<{ criterion: PhotoSortCriterion; labelKey: string }> = [
  { criterion: 'creation_time', labelKey: 'common:sortCriterion.captureTime' },
  { criterion: 'filename', labelKey: 'common:sortCriterion.filename' },
];

const SORT_DIRECTION_OPTIONS: ReadonlyArray<{ direction: PhotoSortDirection; labelKey: string }> = [
  { direction: 'desc', labelKey: 'common:sortDirection.descending' },
  { direction: 'asc', labelKey: 'common:sortDirection.ascending' },
];

const VIEW_MODE_OPTIONS: ReadonlyArray<{ mode: GalleryViewMode; labelKey: string }> = [
  { mode: 'grid', labelKey: 'viewModeOptions.grid' },
  { mode: 'date', labelKey: 'viewModeOptions.date' },
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
  const order = useMemo(
    () =>
      items && settings
        ? buildGalleryOrder(items, settings.sortCriterion, settings.sortDirection, settings.viewMode, dateSectionFormatter)
        : [],
    [items, settings, dateSectionFormatter]
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
  const imageCount = items ? countImages(items) : 0;
  const slideshowDisabled = !items || imageCount === 0;

  function openViewer(item: GalleryItem) {
    if (!settings) return;
    navigation.navigate('PhotoViewer', {
      deviceAlbumId,
      displayName,
      initialAssetId: item.id,
      sortCriterion: settings.sortCriterion,
      sortDirection: settings.sortDirection,
      viewMode: settings.viewMode,
    });
  }

  function renderControlsHeader() {
    if (!settings) return null;
    return (
      <>
        {showVideoBanner ? <VideoAccessBanner onPress={handleVideoBannerPress} onDismiss={dismissVideoBanner} /> : null}
        <View style={styles.controls}>
        <Pressable
          testID="gallery-slideshow-button"
          accessibilityRole="button"
          accessibilityState={{ disabled: slideshowDisabled }}
          disabled={slideshowDisabled}
          style={[styles.slideshowButton, slideshowDisabled && styles.slideshowButtonDisabled]}
          onPress={() => navigation.navigate('AlbumSettings', { deviceAlbumId, displayName })}
        >
          <Text style={styles.slideshowButtonText}>{t('slideshowButton')}</Text>
        </Pressable>
        {items && imageCount === 0 ? <Text style={styles.hintText}>{t('slideshowDisabledHint')}</Text> : null}

        <Text style={styles.sectionTitle}>{t('sortSectionTitle')}</Text>
        <View style={styles.row}>
          {SORT_CRITERION_OPTIONS.map((option) => (
            <ToggleButton
              key={option.criterion}
              testID={`gallery-sort-criterion-${option.criterion}`}
              label={t(option.labelKey)}
              active={settings.sortCriterion === option.criterion}
              onPress={() =>
                updateSettings({ sortCriterion: option.criterion }, GALLERY_SORT_CRITERION_STORAGE_KEY, option.criterion)
              }
              styles={styles}
            />
          ))}
        </View>
        <View style={styles.row}>
          {SORT_DIRECTION_OPTIONS.map((option) => (
            <ToggleButton
              key={option.direction}
              testID={`gallery-sort-direction-${option.direction}`}
              label={t(option.labelKey)}
              active={settings.sortDirection === option.direction}
              onPress={() =>
                updateSettings({ sortDirection: option.direction }, GALLERY_SORT_DIRECTION_STORAGE_KEY, option.direction)
              }
              styles={styles}
            />
          ))}
        </View>

        <Text style={styles.sectionTitle}>{t('viewModeSectionTitle')}</Text>
        <View style={styles.row}>
          {VIEW_MODE_OPTIONS.map((option) => (
            <ToggleButton
              key={option.mode}
              testID={`gallery-view-mode-${option.mode}`}
              label={t(option.labelKey)}
              active={settings.viewMode === option.mode}
              onPress={() => updateSettings({ viewMode: option.mode }, GALLERY_VIEW_MODE_STORAGE_KEY, option.mode)}
              styles={styles}
            />
          ))}
        </View>
        </View>
      </>
    );
  }

  const emptyComponent = (
    <View style={styles.centered}>
      <Text style={styles.emptyText}>{t('noPhotos')}</Text>
    </View>
  );

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
          ListHeaderComponent={renderControlsHeader}
          ListEmptyComponent={emptyComponent}
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionHeaderText}>{section.title}</Text>
            </View>
          )}
          renderItem={({ item: row }) => (
            <View style={styles.gridRow}>
              {row.row.map((media) => (
                <GalleryTile key={media.id} item={media} size={itemSize} onPress={() => openViewer(media)} />
              ))}
            </View>
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
        ListHeaderComponent={renderControlsHeader}
        ListEmptyComponent={emptyComponent}
        renderItem={({ item }) => <GalleryTile item={item} size={itemSize} onPress={() => openViewer(item)} />}
      />
    );
  }

  return (
    <View style={styles.flex} {...pinchHandlers}>
      <View style={styles.flex}>{renderBody()}</View>
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
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={[styles.toggleButton, active && styles.toggleButtonActive]}
      onPress={onPress}
    >
      <Text style={[styles.toggleButtonText, active && styles.toggleButtonTextActive]}>{label}</Text>
    </Pressable>
  );
}

function GalleryTile({ item, size, onPress }: { item: GalleryItem; size: number; onPress: () => void }) {
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
    controls: {
      padding: 16,
      gap: 8,
    },
    slideshowButton: {
      paddingVertical: 12,
      borderRadius: 10,
      alignItems: 'center',
      backgroundColor: c.accent,
    },
    slideshowButtonDisabled: {
      opacity: 0.4,
    },
    slideshowButtonText: {
      color: '#fff',
      fontSize: 15,
      fontWeight: '700',
    },
    hintText: {
      fontSize: 12,
      color: c.textSecondary,
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
    videoBadge: {
      position: 'absolute',
      left: 4,
      bottom: 4,
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
