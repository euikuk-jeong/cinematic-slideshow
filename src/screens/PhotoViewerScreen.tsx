import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import type { RootStackParamList } from '../../App';
import { VideoPage } from '../photos/components/VideoPage';
import { ZoomableImage } from '../photos/components/ZoomableImage';
import { MoveTargetModal } from '../library/MoveTargetModal';
import { buildGalleryOrder, initialIndex, mountedIndices, type GalleryItem } from '../photos/galleryItem';
import { mutationOutcome } from '../photos/gallerySelection';
import { buildInfoRows } from '../photos/mediaFormat';
import { isFileManagementAvailable, runMediaMutation, type MediaMutation } from '../photos/mediaMutations';
import type { DateSectionLabelFormatter } from '../photos/photoSort';
import { queryAlbumItems } from '../photos/queryAlbumItems';
import { usePhotoUri } from '../photos/usePhotoUri';

type PhotoViewerScreenProps = NativeStackScreenProps<RootStackParamList, 'PhotoViewer'>;

// 사진 감상 화면은 테마와 무관하게 검정 배경 + 흰 글씨로 고정한다(사진이 주인공). 크롬 바는
// 사진 위에 얹히는 반투명 검정이다.
const VIEWER_BACKGROUND = '#000';
const CHROME_BACKGROUND = 'rgba(0,0,0,0.55)';
const CHROME_TEXT = '#fff';
// 영상 컨트롤은 하단 크롬 바(N/총수, 정보 버튼)와 겹치지 않도록 그 위에 띄운다.
const VIDEO_CONTROLS_BOTTOM_GAP = 64;
const CHROME_MUTED_TEXT = '#b8b2a8';
const SHEET_BACKGROUND = '#1c1b1a';

type LoadState = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; items: GalleryItem[] };

export function PhotoViewerScreen({ route, navigation }: PhotoViewerScreenProps) {
  const { deviceAlbumId, initialAssetId, sortCriterion, sortDirection, viewMode, searchQuery = '' } = route.params;
  const { t } = useTranslation('gallery');
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const [load, setLoad] = useState<LoadState>({ kind: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  const [index, setIndex] = useState(0);
  const [indexInitialized, setIndexInitialized] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [chromeVisible, setChromeVisible] = useState(true);
  const [zoomed, setZoomed] = useState(false);
  const [infoVisible, setInfoVisible] = useState(false);
  // 현재 페이지의 uri 조회가 끝난(성공/실패) 인덱스 — 끝나면 그제서야 이웃을 미리 불러온다.
  const [settledIndex, setSettledIndex] = useState(-1);
  // 파일 관리(삭제·이동)는 Android 11+에서만 켠다. 확인은 OS 시스템 다이얼로그가 받는다.
  const fileManagement = useMemo(() => isFileManagementAvailable(), []);
  const [mutating, setMutating] = useState(false);
  const [mutationNotice, setMutationNotice] = useState<string | null>(null);
  const [moveDialogVisible, setMoveDialogVisible] = useState(false);
  // 항목이 사라진 뒤 페이저를 보던 위치에서 다시 배치하기 위한 키(FlatList는 initialScrollIndex를 한 번만 쓴다).
  const [pagerEpoch, setPagerEpoch] = useState(0);

  const dateSectionFormatter: DateSectionLabelFormatter = useMemo(
    () => ({
      unknownDate: t('noDateLabel'),
      formatDate: (year, month, day) => t('dateLabel', { year, month, day }),
    }),
    [t]
  );

  // 뷰어는 갤러리와 같은 쿼리를 다시 조회하고 같은 순수 함수로 순서를 계산한다 — 큰 id 배열을
  // route params로 넘기지 않고, 화면에 표시된 순서와 항상 일치시키기 위해서다.
  useEffect(() => {
    let cancelled = false;
    queryAlbumItems(deviceAlbumId)
      .then((items) => {
        if (!cancelled) setLoad({ kind: 'ready', items });
      })
      .catch((e) => {
        console.warn('[PhotoViewer] failed to load album items', e);
        if (!cancelled) setLoad({ kind: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [deviceAlbumId, reloadKey]);

  const order = useMemo(
    () =>
      load.kind === 'ready'
        ? buildGalleryOrder(load.items, sortCriterion, sortDirection, viewMode, dateSectionFormatter, searchQuery)
        : [],
    [load, sortCriterion, sortDirection, viewMode, dateSectionFormatter, searchQuery]
  );

  // 최초 로드 완료 시 한 번만 시작 인덱스를 정한다(이후 재조회로 order가 바뀌어도 보던 위치 유지).
  useEffect(() => {
    if (load.kind !== 'ready' || indexInitialized) return;
    const start = initialIndex(order, initialAssetId);
    setIndex(start.index);
    setNotFound(start.notFound);
    setIndexInitialized(true);
  }, [load, order, initialAssetId, indexInitialized]);

  // 크롬 토글 = 시스템 바 immersive 전환(재생 화면과 같은 react-native-screens 옵션).
  useEffect(() => {
    navigation.setOptions({
      navigationBarHidden: !chromeVisible,
      ...(Platform.OS === 'android' && { statusBarHidden: !chromeVisible }),
    });
  }, [navigation, chromeVisible]);

  const toggleChrome = useCallback(() => setChromeVisible((v) => !v), []);

  async function applyMutation(mutation: MediaMutation) {
    if (!current || mutating) return;
    setMutating(true);
    setMutationNotice(null);
    try {
      const result = await runMediaMutation(deviceAlbumId, [current.id], mutation);
      setLoad({ kind: 'ready', items: result.items });
      if (mutationOutcome(result.summary) !== 'success') {
        setMutationNotice(t(mutation.kind === 'moveToNew' ? 'mutationNothingDoneNewFolder' : 'mutationNothingDone'));
        return;
      }
      const remaining = buildGalleryOrder(
        result.items,
        sortCriterion,
        sortDirection,
        viewMode,
        dateSectionFormatter,
        searchQuery
      ).length;
      if (remaining === 0) {
        navigation.goBack();
        return;
      }
      // 같은 위치에 다음 항목이 들어오므로 인덱스를 유지하고, 마지막 항목이었으면 새 마지막으로 당긴다.
      setIndex(Math.min(index, remaining - 1));
      setZoomed(false);
      setSettledIndex(-1);
      setPagerEpoch((n) => n + 1);
    } catch (e) {
      console.warn('[PhotoViewer] file mutation failed', e);
      setMutationNotice(t('mutationNothingDone'));
    } finally {
      setMutating(false);
    }
  }

  const listRef = useRef<FlatList<GalleryItem>>(null);
  function handleMomentumScrollEnd(e: NativeSyntheticEvent<NativeScrollEvent>) {
    if (width <= 0 || order.length === 0) return;
    const next = Math.min(order.length - 1, Math.max(0, Math.round(e.nativeEvent.contentOffset.x / width)));
    if (next !== index) {
      setIndex(next);
      setZoomed(false);
    }
  }

  const viewport = useMemo(() => ({ width, height }), [width, height]);
  const current = order[index] ?? null;
  const mounted = useMemo(() => new Set(mountedIndices(index, order.length)), [index, order.length]);

  if (load.kind === 'error') {
    return (
      <View style={[styles.root, styles.centered]}>
        <Text style={styles.message}>{t('pageError')}</Text>
        <Pressable
          testID="viewer-load-retry"
          accessibilityRole="button"
          style={styles.retryButton}
          onPress={() => {
            setLoad({ kind: 'loading' });
            setReloadKey((k) => k + 1);
          }}
        >
          <Text style={styles.retryButtonText}>{t('retry')}</Text>
        </Pressable>
        <BackButton label={t('viewerBack')} onPress={() => navigation.goBack()} top={insets.top} />
      </View>
    );
  }

  if (load.kind === 'loading' || !indexInitialized) {
    return (
      <View style={[styles.root, styles.centered]}>
        <ActivityIndicator testID="viewer-loading" color={CHROME_TEXT} />
        <BackButton label={t('viewerBack')} onPress={() => navigation.goBack()} top={insets.top} />
      </View>
    );
  }

  if (order.length === 0) {
    return (
      <View style={[styles.root, styles.centered]}>
        <Text style={styles.message}>{t('noPhotos')}</Text>
        <BackButton label={t('viewerBack')} onPress={() => navigation.goBack()} top={insets.top} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <FlatList
        // 회전으로 폭이 바뀌면 현재 인덱스 기준으로 다시 배치한다.
        key={`pager-${width}-${pagerEpoch}`}
        ref={listRef}
        testID="viewer-pager"
        data={order}
        horizontal
        pagingEnabled
        scrollEnabled={!zoomed}
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item.id}
        initialScrollIndex={index}
        getItemLayout={(_data, i) => ({ length: width, offset: width * i, index: i })}
        windowSize={5}
        onMomentumScrollEnd={handleMomentumScrollEnd}
        renderItem={({ item, index: i }) =>
          mounted.has(i) ? (
            <ViewerPage
              item={item}
              viewport={viewport}
              active={i === index}
              chromeVisible={chromeVisible}
              controlsBottomOffset={insets.bottom + VIDEO_CONTROLS_BOTTOM_GAP}
              prefetchEnabled={settledIndex === index}
              onSettled={() => setSettledIndex(i)}
              onZoomChange={i === index ? setZoomed : noop}
              onTap={toggleChrome}
            />
          ) : (
            <View testID={`viewer-blank-${item.id}`} style={{ width, height }} />
          )
        }
      />

      {notFound ? (
        <View testID="viewer-not-found-notice" style={[styles.notice, { top: insets.top + 56 }]}>
          <Text style={styles.noticeText}>{t('notFoundNotice')}</Text>
        </View>
      ) : null}

      {mutationNotice ? (
        <View testID="viewer-mutation-notice" style={[styles.notice, { top: insets.top + 56 }]}>
          <Text style={styles.noticeText}>{mutationNotice}</Text>
        </View>
      ) : null}

      {chromeVisible ? (
        <>
          <View testID="viewer-top-bar" style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
            <Pressable
              testID="viewer-back"
              accessibilityRole="button"
              accessibilityLabel={t('viewerBack')}
              style={styles.chromeButton}
              onPress={() => navigation.goBack()}
            >
              <Text style={styles.chromeButtonText}>←</Text>
            </Pressable>
            <Text style={styles.title} numberOfLines={1} testID="viewer-title">
              {current?.filename ?? route.params.displayName}
            </Text>
          </View>
          <View testID="viewer-bottom-bar" style={[styles.bottomBar, { paddingBottom: insets.bottom + 8 }]}>
            <Text style={styles.position} testID="viewer-position">
              {t('positionLabel', { current: index + 1, total: order.length })}
            </Text>
            {fileManagement ? (
              <View style={styles.actions}>
                <Pressable
                  testID="viewer-move-button"
                  accessibilityRole="button"
                  accessibilityState={{ disabled: mutating }}
                  disabled={mutating}
                  style={styles.chromeButton}
                  onPress={() => setMoveDialogVisible(true)}
                >
                  <Text style={[styles.chromeActionText, mutating && styles.chromeActionDisabled]}>{t('moveAction')}</Text>
                </Pressable>
                <Pressable
                  testID="viewer-delete-button"
                  accessibilityRole="button"
                  accessibilityState={{ disabled: mutating }}
                  disabled={mutating}
                  style={styles.chromeButton}
                  onPress={() => applyMutation({ kind: 'delete' })}
                >
                  <Text style={[styles.chromeActionText, mutating && styles.chromeActionDisabled]}>{t('deleteAction')}</Text>
                </Pressable>
              </View>
            ) : null}
            <Pressable
              testID="viewer-info-button"
              accessibilityRole="button"
              accessibilityLabel={t('viewerInfo')}
              style={styles.chromeButton}
              onPress={() => setInfoVisible(true)}
            >
              <Text style={styles.chromeButtonText}>ⓘ</Text>
            </Pressable>
          </View>
        </>
      ) : null}

      <MoveTargetModal
        visible={moveDialogVisible}
        currentDeviceAlbumId={deviceAlbumId}
        onClose={() => setMoveDialogVisible(false)}
        onSelect={(target) => {
          setMoveDialogVisible(false);
          applyMutation({ kind: 'move', targetAlbumId: target.id });
        }}
        onCreateFolder={(folderName) => {
          setMoveDialogVisible(false);
          applyMutation({ kind: 'moveToNew', folderName });
        }}
      />

      <Modal transparent animationType="slide" visible={infoVisible} onRequestClose={() => setInfoVisible(false)}>
        <Pressable testID="viewer-info-backdrop" style={styles.sheetBackdrop} onPress={() => setInfoVisible(false)}>
          <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]} onPress={noop}>
            <Text style={styles.sheetTitle}>{t('viewerInfoTitle')}</Text>
            {current
              ? buildInfoRows(current).map((row) => (
                  <View key={row.key} style={styles.infoRow}>
                    <Text style={styles.infoLabel}>{t(`info.${row.key}`)}</Text>
                    <Text style={styles.infoValue} testID={`viewer-info-${row.key}`}>
                      {row.value}
                    </Text>
                  </View>
                ))
              : null}
            <Pressable
              testID="viewer-info-close"
              accessibilityRole="button"
              accessibilityLabel={t('viewerInfoClose')}
              style={styles.sheetClose}
              onPress={() => setInfoVisible(false)}
            >
              <Text style={styles.sheetCloseText}>{t('viewerInfoClose')}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function noop() {}

function BackButton({ label, onPress, top }: { label: string; onPress: () => void; top: number }) {
  return (
    <Pressable
      testID="viewer-back"
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[styles.chromeButton, { position: 'absolute', top: top + 8, left: 8 }]}
      onPress={onPress}
    >
      <Text style={styles.chromeButtonText}>←</Text>
    </Pressable>
  );
}

function ViewerPage({
  item,
  viewport,
  active,
  chromeVisible,
  controlsBottomOffset,
  prefetchEnabled,
  onSettled,
  onZoomChange,
  onTap,
}: {
  item: GalleryItem;
  viewport: { width: number; height: number };
  active: boolean;
  chromeVisible: boolean;
  controlsBottomOffset: number;
  prefetchEnabled: boolean;
  onSettled: () => void;
  onZoomChange: (zoomed: boolean) => void;
  onTap: () => void;
}) {
  const { t } = useTranslation('gallery');
  // 이미지 로드 실패 후 "다시 시도"를 누르면 페이지를 새 key로 다시 마운트해 uri부터 재조회한다.
  const [attempt, setAttempt] = useState(0);
  const [imageFailed, setImageFailed] = useState(false);
  const { uri, error } = usePhotoUri(item.id, item.modificationTime, active || prefetchEnabled, attempt);

  useEffect(() => {
    if (active && (uri || error)) onSettled();
    // onSettled는 매 렌더 새 함수라 uri/error/active 변화에만 반응한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, uri, error]);

  const imageSize = useMemo(
    () => (item.width && item.height ? { width: item.width, height: item.height } : null),
    [item.width, item.height]
  );

  function retry() {
    setImageFailed(false);
    setAttempt((n) => n + 1);
  }

  const pageStyle = { width: viewport.width, height: viewport.height };

  if (error || imageFailed) {
    return (
      <View testID={`viewer-page-${item.id}`} style={[pageStyle, styles.centered]}>
        <Text testID={`viewer-page-error-${item.id}`} style={styles.message}>
          {error ? t('pageMissing') : t('pageError')}
        </Text>
        <Pressable testID={`viewer-page-retry-${item.id}`} accessibilityRole="button" style={styles.retryButton} onPress={retry}>
          <Text style={styles.retryButtonText}>{t('retry')}</Text>
        </Pressable>
      </View>
    );
  }

  if (!uri) {
    return (
      <View testID={`viewer-page-${item.id}`} style={[pageStyle, styles.centered]}>
        {active ? <ActivityIndicator color={CHROME_TEXT} /> : null}
      </View>
    );
  }

  if (item.mediaKind === 'video') {
    return (
      <View key={attempt} testID={`viewer-page-${item.id}`} style={pageStyle}>
        <VideoPage
          testIdPrefix={`viewer-${item.id}`}
          uri={uri}
          assetId={item.id}
          durationMs={item.durationMs}
          viewport={viewport}
          active={active}
          controlsVisible={chromeVisible}
          controlsBottomOffset={controlsBottomOffset}
          onTap={onTap}
          onRetry={retry}
        />
      </View>
    );
  }

  return (
    <View key={attempt} testID={`viewer-page-${item.id}`} style={pageStyle}>
      <ZoomableImage
        testIdPrefix={`viewer-${item.id}`}
        uri={uri}
        imageSize={imageSize}
        viewport={viewport}
        active={active}
        onZoomChange={onZoomChange}
        onTap={onTap}
        onError={() => setImageFailed(true)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: VIEWER_BACKGROUND,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    gap: 12,
  },
  message: {
    color: CHROME_TEXT,
    textAlign: 'center',
    fontSize: 14,
  },
  retryButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: CHROME_TEXT,
  },
  retryButtonText: {
    color: CHROME_TEXT,
    fontWeight: '600',
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 8,
    paddingBottom: 8,
    backgroundColor: CHROME_BACKGROUND,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    backgroundColor: CHROME_BACKGROUND,
  },
  chromeButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 4,
  },
  chromeActionText: {
    color: CHROME_TEXT,
    fontSize: 15,
    fontWeight: '600',
  },
  chromeActionDisabled: {
    opacity: 0.4,
  },
  chromeButtonText: {
    color: CHROME_TEXT,
    fontSize: 22,
  },
  title: {
    flex: 1,
    color: CHROME_TEXT,
    fontSize: 16,
    fontWeight: '600',
  },
  position: {
    color: CHROME_TEXT,
    fontSize: 14,
  },
  notice: {
    position: 'absolute',
    left: 16,
    right: 16,
    padding: 10,
    borderRadius: 8,
    backgroundColor: CHROME_BACKGROUND,
  },
  noticeText: {
    color: CHROME_TEXT,
    fontSize: 13,
    textAlign: 'center',
  },
  sheetBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    padding: 20,
    gap: 12,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    backgroundColor: SHEET_BACKGROUND,
  },
  sheetTitle: {
    color: CHROME_TEXT,
    fontSize: 16,
    fontWeight: '700',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 16,
  },
  infoLabel: {
    color: CHROME_MUTED_TEXT,
    fontSize: 14,
  },
  infoValue: {
    flex: 1,
    textAlign: 'right',
    color: CHROME_TEXT,
    fontSize: 14,
  },
  sheetClose: {
    alignSelf: 'flex-end',
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  sheetCloseText: {
    color: CHROME_TEXT,
    fontWeight: '600',
  },
});
