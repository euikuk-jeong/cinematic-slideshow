import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import { BlurView } from 'expo-blur';
import * as MediaLibrary from 'expo-media-library';

import type { RootStackParamList } from '../../App';
import { getSelectedPhotoIds, getSlideshowSettingsByAlbumId } from '../db/client';
import type { OrderMode, RepeatMode } from '../db/types';
import { computeKenBurnsTransform, generateKenBurnsSpec, type KenBurnsSpec } from '../slideshow/kenBurns';
import type { PhotoMetadata, PhotoSortCriterion, PhotoSortDirection } from '../photos/photoSort';
import { buildPlaybackSequence, nextPlaybackIndex } from '../slideshow/playback';
import { getTransitionSpec, pickTransitionEffect, TRANSITION_DURATION_MS, FLIP_HALF_DURATION_MS } from '../slideshow/transitions';
import type { ThemeColors } from '../theme/colors';
import { useAppTheme } from '../theme/ThemeContext';

// AlbumSettingsScreen 초기 상태와 동일한 기본값 — 컨트롤을 한 번도 안 건드린 앨범은
// slideshow_settings row 자체가 없어(persist()는 값이 바뀔 때만 호출됨) null이 온다.
const DEFAULT_TRANSITION_INTERVAL_SEC = 4;
const DEFAULT_ORDER_MODE: OrderMode = 'sequential';
const DEFAULT_REPEAT_MODE: RepeatMode = 'loop';
const DEFAULT_SORT_CRITERION: PhotoSortCriterion = 'creation_time';
const DEFAULT_SORT_DIRECTION: PhotoSortDirection = 'asc';

// 두 장을 번갈아 쓰는 dual-buffer(LumisShow의 ss-slot-a/b와 동일 구조) — 한쪽이 화면에
// 보이는 동안 다른 쪽에 다음 사진을 미리 앉혀두고 전환 애니메이션으로 넘어간다.
type Slot = 'a' | 'b';
const SLOTS: readonly Slot[] = ['a', 'b'];
const otherSlot = (slot: Slot): Slot => (slot === 'a' ? 'b' : 'a');

interface SlotContent {
  photo: PhotoMetadata | null;
  uri: string | null;
}

type SlotOf<T> = Record<Slot, T>;

type SlideshowPlayerScreenProps = NativeStackScreenProps<RootStackParamList, 'SlideshowPlayer'>;

export function SlideshowPlayerScreen({ route }: SlideshowPlayerScreenProps) {
  const { albumId, deviceAlbumId } = route.params;
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'SlideshowPlayer'>>();
  const { colors: c } = useAppTheme();
  const styles = useMemo(() => createStyles(c), [c]);
  const { width, height } = useWindowDimensions();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [sequence, setSequence] = useState<PhotoMetadata[]>([]);
  const [transitionIntervalSec, setTransitionIntervalSec] = useState(DEFAULT_TRANSITION_INTERVAL_SEC);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>(DEFAULT_REPEAT_MODE);

  const [slots, setSlots] = useState<SlotOf<SlotContent>>({
    a: { photo: null, uri: null },
    b: { photo: null, uri: null },
  });
  const [kbSpecs, setKbSpecs] = useState<SlotOf<KenBurnsSpec | null>>({ a: null, b: null });
  // topSlot(전환 시작 시점에 갱신, 위에 그려질 슬롯)과 activeSlot(전환이 끝나고 정착했을 때
  // 갱신, "지금 실제로 보여주는 사진"의 기준)은 갱신 시점이 다르다 — LumisShow의
  // z-index 스왑(advance() 초반)과 pos/activeSlot 갱신(transTimer 콜백)이 분리된 것과 동일.
  const [topSlot, setTopSlot] = useState<Slot>('a');
  const [activeSlot, setActiveSlot] = useState<Slot>('a');

  const activeSlotRef = useRef<Slot>('a');
  const posRef = useRef(0);
  const transitioningRef = useRef(false);
  // runTransition은 setInterval 콜백에서 시작되는 일반 async 함수라 useEffect의 cleanup이
  // 자동으로 취소해주지 않는다 — 화면이 닫히는 도중(뒤로가기) 전환이 진행 중이면 unmount
  // 이후에도 setState를 계속 시도해 경고/누수가 생기므로 await 지점마다 이 값을 확인한다.
  const mountedRef = useRef(true);
  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const kbProgress = useRef<SlotOf<Animated.Value>>({ a: new Animated.Value(0), b: new Animated.Value(0) }).current;
  const tOpacity = useRef<SlotOf<Animated.Value>>({ a: new Animated.Value(1), b: new Animated.Value(0) }).current;
  const tTranslateX = useRef<SlotOf<Animated.Value>>({ a: new Animated.Value(0), b: new Animated.Value(0) }).current;
  const tTranslateY = useRef<SlotOf<Animated.Value>>({ a: new Animated.Value(0), b: new Animated.Value(0) }).current;
  const tScale = useRef<SlotOf<Animated.Value>>({ a: new Animated.Value(1), b: new Animated.Value(1) }).current;
  const tRotateY = useRef<SlotOf<Animated.Value>>({ a: new Animated.Value(0), b: new Animated.Value(0) }).current;
  const blurOverlayOpacity = useRef(new Animated.Value(0)).current;

  function resetSlotTransitionValues(slot: Slot, opacity: number) {
    tOpacity[slot].setValue(opacity);
    tTranslateX[slot].setValue(0);
    tTranslateY[slot].setValue(0);
    tScale[slot].setValue(1);
    tRotateY[slot].setValue(0);
  }

  function startSlotKenBurns(slot: Slot, durationMs: number) {
    setKbSpecs((prev) => ({ ...prev, [slot]: generateKenBurnsSpec() }));
    const value = kbProgress[slot];
    value.setValue(0);
    Animated.timing(value, { toValue: 1, duration: durationMs, easing: Easing.linear, useNativeDriver: true }).start();
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [settings, selectedIds, metadata] = await Promise.all([
          getSlideshowSettingsByAlbumId(albumId),
          getSelectedPhotoIds(albumId),
          new MediaLibrary.Query()
            .album(new MediaLibrary.Album(deviceAlbumId))
            .eq(MediaLibrary.AssetField.MEDIA_TYPE, MediaLibrary.MediaType.IMAGE)
            .exeForMetadata(),
        ]);
        if (cancelled) return;

        const orderMode = settings?.orderMode ?? DEFAULT_ORDER_MODE;
        const sortCriterion = settings?.sortCriterion ?? DEFAULT_SORT_CRITERION;
        const sortDirection = settings?.sortDirection ?? DEFAULT_SORT_DIRECTION;
        const intervalSec = settings?.transitionIntervalSec ?? DEFAULT_TRANSITION_INTERVAL_SEC;
        setTransitionIntervalSec(intervalSec);
        setRepeatMode(settings?.repeatMode ?? DEFAULT_REPEAT_MODE);

        const builtSequence = buildPlaybackSequence(
          metadata.map((m) => ({ id: m.id, filename: m.filename, creationTime: m.creationTime })),
          new Set(selectedIds),
          orderMode,
          sortCriterion,
          sortDirection
        );
        setSequence(builtSequence);

        if (builtSequence.length > 0) {
          const firstUri = await resolvePhotoUri(builtSequence[0].id);
          if (cancelled) return;
          setSlots((prev) => ({ ...prev, a: { photo: builtSequence[0], uri: firstUri } }));
          startSlotKenBurns('a', intervalSec * 1000);
          if (builtSequence.length > 1) prefetchPhotoUri(builtSequence[1].id);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [albumId, deviceAlbumId]);

  async function runTransition(nextIndex: number) {
    if (transitioningRef.current) return;
    const nextPhoto = sequence[nextIndex];
    if (!nextPhoto) return;
    transitioningRef.current = true;

    const outgoingSlot = activeSlotRef.current;
    const incomingSlot = otherSlot(outgoingSlot);

    let uri: string;
    try {
      uri = await resolvePhotoUri(nextPhoto.id);
    } catch {
      // 삭제된 사진 등으로 uri 조회가 실패하면 이번 전환만 건너뛴다 — transitioningRef를
      // 반드시 풀어줘야 다음 interval tick이 재시도할 수 있다(안 풀면 재생이 그 자리에서
      // 영구히 멈춘다).
      transitioningRef.current = false;
      return;
    }
    if (!mountedRef.current) return;
    setSlots((prev) => ({ ...prev, [incomingSlot]: { photo: nextPhoto, uri } }));
    startSlotKenBurns(incomingSlot, transitionIntervalSec * 1000);
    setTopSlot(incomingSlot);

    const spec = getTransitionSpec(pickTransitionEffect());
    // 비활성 슬롯은 항상 opacity 0으로 숨겨두므로(웹은 z-index만으로 숨김) 어떤 효과든
    // incoming 슬롯은 먼저 이 opacity(효과별 in.opacity[0])로 끌어올려야 한다 — flip-h처럼
    // opacity를 직접 건드리지 않는 효과도 예외 없이 적용해야, 회전만 하고 여전히 투명해
    // "검은 화면"으로 보이는 문제가 생기지 않는다.
    resetSlotTransitionValues(incomingSlot, spec.in.opacity[0]);

    await new Promise<void>((resolve) => {
      if (spec.isFlip) {
        tRotateY[outgoingSlot].setValue(spec.out.rotateYDeg[0]);
        tRotateY[incomingSlot].setValue(spec.in.rotateYDeg[0]);
        Animated.parallel([
          Animated.timing(tRotateY[outgoingSlot], {
            toValue: spec.out.rotateYDeg[1],
            duration: FLIP_HALF_DURATION_MS,
            easing: Easing.ease,
            useNativeDriver: true,
          }),
          Animated.sequence([
            Animated.delay(FLIP_HALF_DURATION_MS),
            Animated.timing(tRotateY[incomingSlot], {
              toValue: spec.in.rotateYDeg[1],
              duration: FLIP_HALF_DURATION_MS,
              easing: Easing.ease,
              useNativeDriver: true,
            }),
          ]),
        ]).start(() => resolve());
        return;
      }

      tTranslateX[incomingSlot].setValue(spec.in.translateXPercent[0] * width);
      tTranslateY[incomingSlot].setValue(spec.in.translateYPercent[0] * height);
      tScale[incomingSlot].setValue(spec.in.scale[0]);

      const timing = (value: Animated.Value, toValue: number) =>
        Animated.timing(value, { toValue, duration: TRANSITION_DURATION_MS, easing: Easing.ease, useNativeDriver: true });

      const animations = [
        timing(tOpacity[outgoingSlot], spec.out.opacity[1]),
        timing(tTranslateX[outgoingSlot], spec.out.translateXPercent[1] * width),
        timing(tTranslateY[outgoingSlot], spec.out.translateYPercent[1] * height),
        timing(tScale[outgoingSlot], spec.out.scale[1]),
        timing(tOpacity[incomingSlot], spec.in.opacity[1]),
        timing(tTranslateX[incomingSlot], spec.in.translateXPercent[1] * width),
        timing(tTranslateY[incomingSlot], spec.in.translateYPercent[1] * height),
        timing(tScale[incomingSlot], spec.in.scale[1]),
      ];
      if (spec.usesBlurOverlay) {
        blurOverlayOpacity.setValue(0);
        animations.push(
          Animated.sequence([
            Animated.timing(blurOverlayOpacity, { toValue: 1, duration: TRANSITION_DURATION_MS / 2, easing: Easing.ease, useNativeDriver: true }),
            Animated.timing(blurOverlayOpacity, { toValue: 0, duration: TRANSITION_DURATION_MS / 2, easing: Easing.ease, useNativeDriver: true }),
          ])
        );
      }
      Animated.parallel(animations).start(() => resolve());
    });
    if (!mountedRef.current) return;

    activeSlotRef.current = incomingSlot;
    posRef.current = nextIndex;
    transitioningRef.current = false;
    resetSlotTransitionValues(outgoingSlot, 0);
    setActiveSlot(incomingSlot);

    const prefetchIndex = nextPlaybackIndex(nextIndex, sequence.length, repeatMode);
    if (prefetchIndex !== null) prefetchPhotoUri(sequence[prefetchIndex].id);
  }

  useEffect(() => {
    if (sequence.length === 0) return;
    const interval = setInterval(() => {
      const next = nextPlaybackIndex(posRef.current, sequence.length, repeatMode);
      if (next === null) {
        navigation.goBack();
        return;
      }
      runTransition(next);
    }, transitionIntervalSec * 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sequence, repeatMode, transitionIntervalSec, navigation]);

  return (
    <View style={styles.container}>
      {loading ? (
        <ActivityIndicator color={c.accent} />
      ) : loadError ? (
        <Text style={styles.message}>사진을 불러오지 못했어요</Text>
      ) : sequence.length === 0 ? (
        <Text style={styles.message}>표시할 사진이 없어요</Text>
      ) : (
        <>
          {SLOTS.map((slot) => {
            const content = slots[slot];
            if (!content.photo || !content.uri) return null;
            const kbSpec = kbSpecs[slot];
            const kbTransform = kbSpec ? computeKenBurnsTransform(kbSpec, { width, height }) : null;
            const kbScale = kbTransform
              ? kbProgress[slot].interpolate({ inputRange: [0, 1], outputRange: [kbTransform.startScale, kbTransform.endScale] })
              : 1;
            const kbTranslateX = kbTransform
              ? kbProgress[slot].interpolate({ inputRange: [0, 1], outputRange: [kbTransform.startTranslateX, kbTransform.endTranslateX] })
              : 0;
            const kbTranslateY = kbTransform
              ? kbProgress[slot].interpolate({ inputRange: [0, 1], outputRange: [kbTransform.startTranslateY, kbTransform.endTranslateY] })
              : 0;
            return (
              <Animated.View
                key={slot}
                style={[
                  styles.photoWrapper,
                  {
                    zIndex: slot === topSlot ? 2 : 1,
                    opacity: tOpacity[slot],
                    transform: [
                      { perspective: 1200 },
                      { translateX: tTranslateX[slot] },
                      { translateY: tTranslateY[slot] },
                      { scale: tScale[slot] },
                      {
                        rotateY: tRotateY[slot].interpolate({
                          inputRange: [-180, 180],
                          outputRange: ['-180deg', '180deg'],
                        }),
                      },
                    ],
                  },
                ]}
              >
                {/* 뒤 레이어: 같은 사진을 cover+블러로 채워 앞 레이어(contain)가 남기는
                    레터박스/필러박스를 채운다. Ken Burns는 앞 레이어에만 적용
                    (doc/requirements.md "슬라이드쇼 재생" 참고, LumisShow와 동일 구성). */}
                <Image source={{ uri: content.uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                <BlurView intensity={70} tint="dark" blurMethod="dimezisBlurViewSdk31Plus" style={StyleSheet.absoluteFill} />
                <Animated.Image
                  testID={slot === activeSlot ? 'slideshow-photo' : undefined}
                  source={{ uri: content.uri }}
                  style={[styles.photo, { transform: [{ scale: kbScale }, { translateX: kbTranslateX }, { translateY: kbTranslateY }] }]}
                  resizeMode="contain"
                />
              </Animated.View>
            );
          })}
          <Animated.View pointerEvents="none" style={[styles.photoWrapper, { zIndex: 3, opacity: blurOverlayOpacity }]}>
            <BlurView intensity={90} tint="dark" blurMethod="dimezisBlurViewSdk31Plus" style={StyleSheet.absoluteFill} />
          </Animated.View>
        </>
      )}
      <Pressable testID="slideshow-close" style={styles.closeButton} onPress={() => navigation.goBack()} hitSlop={12}>
        <Text style={styles.closeButtonText}>✕</Text>
      </Pressable>
    </View>
  );
}

// 반복(loop) 재생·다음 사진 prefetch 모두 같은 캐시를 재사용 — 한 번 resolve한 uri는
// slot을 오갈 때마다 매번 native getUri()를 다시 부르지 않는다.
const photoUriCache = new Map<string, string>();

function resolvePhotoUri(id: string): Promise<string> {
  const cached = photoUriCache.get(id);
  if (cached) return Promise.resolve(cached);
  return new MediaLibrary.Asset(id).getUri().then((uri) => {
    photoUriCache.set(id, uri);
    return uri;
  });
}

function prefetchPhotoUri(id: string) {
  if (!photoUriCache.has(id)) {
    resolvePhotoUri(id).catch(() => {});
  }
}

function createStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: '#000',
      alignItems: 'center',
      justifyContent: 'center',
    },
    photoWrapper: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      overflow: 'hidden',
      backfaceVisibility: 'hidden',
    },
    photo: {
      width: '100%',
      height: '100%',
    },
    message: {
      color: c.textSecondary,
      fontSize: 14,
    },
    closeButton: {
      position: 'absolute',
      top: 16,
      right: 16,
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(0,0,0,0.45)',
      zIndex: 4,
    },
    closeButtonText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '600',
    },
  });
}
