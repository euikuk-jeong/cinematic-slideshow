import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import { BlurView } from 'expo-blur';
import { useKeepAwake } from 'expo-keep-awake';
import * as MediaLibrary from 'expo-media-library';
import * as ScreenOrientation from 'expo-screen-orientation';

import type { RootStackParamList } from '../../App';
import { getSelectedPhotoIds, getSlideshowDefaults, getSlideshowSettingsByAlbumId } from '../db/client';
import type { RepeatMode } from '../db/types';
import { computeKenBurnsTransform, generateKenBurnsSpec, type KenBurnsSpec } from '../slideshow/kenBurns';
import type { PhotoMetadata } from '../photos/photoSort';
import { buildPlaybackSequence, nextPlaybackIndex, prevPlaybackIndex } from '../slideshow/playback';
import { formatMusicTrackLabel, resolveMusicCoverSource } from '../slideshow/musicPlaylist';
import { isTap, resolveTapZone } from '../slideshow/tapGesture';
import { getTransitionSpec, pickTransitionEffect, TRANSITION_DURATION_MS, FLIP_HALF_DURATION_MS } from '../slideshow/transitions';
import { useSlideshowMusic } from '../slideshow/useSlideshowMusic';
import { FALLBACK_REPEAT_MODE, FALLBACK_TRANSITION_INTERVAL_SEC } from '../settings/slideshowDefaults';
import type { ThemeColors } from '../theme/colors';
import { useAppTheme } from '../theme/ThemeContext';

// 자동재생 중 조작 없이 툴바(일시정지/이전/다음)가 화면에 머무는 시간 — LumisShow 웹
// 버전(hideTimer, 3000ms)과 동일.
const TOOLBAR_AUTO_HIDE_MS = 3000;
// 트랙이 바뀔 때 좌측 하단에 뜨는 "재생 중" 토스트가 머무는 시간 — LumisShow 웹 버전
// (showMusicToast, 3000ms)과 동일.
const MUSIC_TOAST_DURATION_MS = 3000;

// 컨트롤을 한 번도 안 건드린 앨범은 slideshow_settings row 자체가 없어(persist()는 값이
// 바뀔 때만 호출됨) null이 온다 — 이때는 getSlideshowDefaults()가 돌려주는, 사용자가
// 앱 설정(SlideshowDefaultsScreen)에서 지정한 신규앨범 기본값으로 대체한다.

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
  useKeepAwake();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [sequence, setSequence] = useState<PhotoMetadata[]>([]);
  // 전환간격/반복모드는 렌더에 쓰이지 않고(재생 로직 전용) 로드 완료 후 다시 바뀌지도
  // 않아 state 대신 ref로만 보관 — 로드 effect에서 값이 정해지는 즉시(리렌더를 기다리지
  // 않고) 채워야 그 직후 호출하는 scheduleAutoAdvance()가 초기 기본값이 아닌 실제 값을
  // 본다.
  const sequenceRef = useRef<PhotoMetadata[]>([]);
  const transitionIntervalSecRef = useRef(FALLBACK_TRANSITION_INTERVAL_SEC);
  const repeatModeRef = useRef<RepeatMode>(FALLBACK_REPEAT_MODE);
  const [musicSettingsId, setMusicSettingsId] = useState<number | null>(null);
  const { musicOn, toggleMusicOn, stopMusic, nextTrack, previousTrack, currentTrack, trackCount, trackStartSeq } =
    useSlideshowMusic(musicSettingsId);
  // endSlideshow()는 scheduleAutoAdvance()가 예약한 setTimeout 콜백에서(최대 transitionIntervalSec
  // 뒤에) 호출될 수 있다 — 그 사이 재렌더로 useSlideshowMusic이 반환하는 stopMusic 클로저가
  // 최신 playlist를 가리키도록 바뀌었을 수 있는데, 예약 시점 클로저가 그대로 stopMusic을 직접
  // 참조하면 오래된(이미 해제됐을 수 있는) playlist를 대상으로 호출하게 된다 — 실기기에서 실제로
  // "Cannot use shared object that was already released" 예외로 재현됨. gestureHandlersRef와
  // 동일한 패턴으로 매 렌더 최신 값을 ref에 담아 항상 최신 stopMusic을 호출하도록 한다.
  const stopMusicRef = useRef(stopMusic);
  stopMusicRef.current = stopMusic;

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

  const [playing, setPlaying] = useState(true);
  const [toolbarVisible, setToolbarVisible] = useState(true);
  // 회전 버튼 — 기기 회전잠금 설정과 무관하게 세로/가로를 강제 전환한다. 화면을 벗어나면
  // 다른 화면에 영향을 주지 않도록 unmount 시 잠금을 해제한다(아래 effect 참고).
  const [isLandscape, setIsLandscape] = useState(false);
  const isLandscapeRef = useRef(false);
  const playingRef = useRef(true);
  // once 모드에서 마지막 사진 다음으로 더 갈 곳이 없을 때(재생 종료) true — 화면을 벗어나지
  // 않고 마지막 사진에 멈춘 채 하단에 안내 배너를 띄운다.
  const [ended, setEnded] = useState(false);
  const [musicToastVisible, setMusicToastVisible] = useState(false);
  const musicToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTrackStartSeqRef = useRef(0);

  const activeSlotRef = useRef<Slot>('a');
  const posRef = useRef(0);
  const transitioningRef = useRef(false);
  // 자동 전환 타이머 — 매 전환(자동이든 수동 이전/다음 탭이든) 완료 후 다시 전체
  // 간격만큼 재예약한다(LumisShow 웹의 timer/scheduleNext와 동일 구조). 일시정지 중엔
  // 예약하지 않는다.
  const autoAdvanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideToolbarTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartRef = useRef({ x: 0, y: 0, t: 0 });
  // panResponder는 마운트 시 한 번만 생성돼 그 시점의 width를 클로저로 캡처한다 — 회전
  // 버튼으로 화면 방향이 바뀌면 width가 바뀌므로, 탭 구역 판정에는 항상 최신 값을 봐야 하는
  // widthRef를 경유한다(gestureHandlersRef와 동일한 이유).
  const widthRef = useRef(width);
  widthRef.current = width;
  // runTransition은 타이머 콜백이나 버튼 press 핸들러에서 시작되는 일반 async 함수라
  // useEffect의 cleanup이 자동으로 취소해주지 않는다 — 화면이 닫히는 도중(뒤로가기) 전환이
  // 진행 중이면 unmount 이후에도 setState를 계속 시도해 경고/누수가 생기므로 await
  // 지점마다 이 값을 확인한다.
  const mountedRef = useRef(true);
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (autoAdvanceTimerRef.current) clearTimeout(autoAdvanceTimerRef.current);
      if (hideToolbarTimerRef.current) clearTimeout(hideToolbarTimerRef.current);
      if (musicToastTimerRef.current) clearTimeout(musicToastTimerRef.current);
      // 회전 버튼으로 건 강제 잠금이 다른 화면까지 새어나가지 않도록 화면을 벗어나면 해제.
      ScreenOrientation.unlockAsync().catch(() => {});
    };
  }, []);

  function toggleRotation() {
    const next = !isLandscapeRef.current;
    isLandscapeRef.current = next;
    setIsLandscape(next);
    ScreenOrientation.lockAsync(
      next ? ScreenOrientation.OrientationLock.LANDSCAPE : ScreenOrientation.OrientationLock.PORTRAIT_UP
    ).catch(() => {});
  }

  // 트랙이 바뀔 때마다(최초 재생 포함) 좌측 하단에 "재생 중" 토스트를 3초간 띄운다 —
  // LumisShow 웹 버전의 showMusicToast()와 동일 타이밍. trackStartSeq는 0에서 시작하므로
  // 첫 렌더(재생목록 로드 전)에는 걸리지 않는다.
  useEffect(() => {
    if (trackStartSeq === lastTrackStartSeqRef.current) return;
    lastTrackStartSeqRef.current = trackStartSeq;
    if (!currentTrack) return;
    setMusicToastVisible(true);
    if (musicToastTimerRef.current) clearTimeout(musicToastTimerRef.current);
    musicToastTimerRef.current = setTimeout(() => setMusicToastVisible(false), MUSIC_TOAST_DURATION_MS);
  }, [trackStartSeq, currentTrack]);

  function clearAutoAdvanceTimer() {
    if (autoAdvanceTimerRef.current) {
      clearTimeout(autoAdvanceTimerRef.current);
      autoAdvanceTimerRef.current = null;
    }
  }

  // 자동 전환 타이머를 전체 간격으로 (재)예약한다. 매 전환 완료 직후(자동이든 수동이든)와
  // 일시정지 해제 시 호출 — 수동 이전/다음 탭 직후에도 호출되므로 그 시점부터 다시
  // 전체 간격을 기다리게 된다(LumisShow 웹과 동일 동작).
  function scheduleAutoAdvance() {
    clearAutoAdvanceTimer();
    if (!playingRef.current) return;
    autoAdvanceTimerRef.current = setTimeout(() => {
      const next = nextPlaybackIndex(posRef.current, sequenceRef.current.length, repeatModeRef.current);
      if (next === null) {
        endSlideshow();
        return;
      }
      runTransition(next);
    }, transitionIntervalSecRef.current * 1000);
  }

  // once 모드에서 더 이상 넘어갈 사진이 없을 때 호출 — 화면을 벗어나지 않고 마지막 사진에
  // 멈춘 채(더 이상 예약하지 않으므로 자동전환 타이머 체인이 여기서 끝난다) 안내 배너를
  // 띄우고 음악도 멈춘다.
  function endSlideshow() {
    playingRef.current = false;
    setPlaying(false);
    clearAutoAdvanceTimer();
    setEnded(true);
    stopMusicRef.current();
  }

  function showToolbarTemporarily() {
    setToolbarVisible(true);
    if (hideToolbarTimerRef.current) clearTimeout(hideToolbarTimerRef.current);
    hideToolbarTimerRef.current = setTimeout(() => setToolbarVisible(false), TOOLBAR_AUTO_HIDE_MS);
  }

  function toggleToolbar() {
    if (toolbarVisible) {
      if (hideToolbarTimerRef.current) clearTimeout(hideToolbarTimerRef.current);
      hideToolbarTimerRef.current = null;
      setToolbarVisible(false);
    } else {
      showToolbarTemporarily();
    }
  }

  // 사진 일시정지/재개는 음악과 독립이다(LumisShow 웹 버전과 동일 — pause 버튼은 photo
  // 타이머만 건드리고 audio는 건드리지 않음). 음악은 오직 ♫ 토글 버튼으로만 켜고 끈다.
  function togglePlaying() {
    const next = !playingRef.current;
    playingRef.current = next;
    setPlaying(next);
    if (next) scheduleAutoAdvance();
    else clearAutoAdvanceTimer();
    showToolbarTemporarily();
  }

  function handlePrev() {
    const prev = prevPlaybackIndex(posRef.current, sequenceRef.current.length, repeatModeRef.current);
    if (prev !== null) runTransition(prev);
    showToolbarTemporarily();
  }

  function handleNext() {
    const next = nextPlaybackIndex(posRef.current, sequenceRef.current.length, repeatModeRef.current);
    if (next === null) {
      endSlideshow();
      return;
    }
    runTransition(next);
    showToolbarTemporarily();
  }

  // PanResponder는 마운트 시 한 번만 생성 — 매 렌더 최신 핸들러를 쓰도록 ref 경유로
  // 호출한다(그렇지 않으면 최초 렌더의 sequence=[] 등 오래된 클로저를 계속 참조하게 됨).
  const gestureHandlersRef = useRef({ handlePrev, handleNext, toggleToolbar });
  gestureHandlersRef.current = { handlePrev, handleNext, toggleToolbar };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        touchStartRef.current = { x: evt.nativeEvent.pageX, y: evt.nativeEvent.pageY, t: Date.now() };
      },
      onPanResponderRelease: (_evt, gestureState) => {
        const dt = Date.now() - touchStartRef.current.t;
        // 탭이 아니면(드래그 등) 아무 동작도 하지 않는다 — 스와이프로 사진 넘기기는
        // 화면 좌/우 탭 이동으로 대체되어 더 이상 지원하지 않는다.
        if (!isTap(gestureState.dx, gestureState.dy, dt)) return;
        const zone = resolveTapZone(touchStartRef.current.x, widthRef.current);
        if (zone === 'prev') gestureHandlersRef.current.handlePrev();
        else if (zone === 'next') gestureHandlersRef.current.handleNext();
        else gestureHandlersRef.current.toggleToolbar();
      },
    })
  ).current;

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
        const [settings, selectedIds, metadata, defaults] = await Promise.all([
          getSlideshowSettingsByAlbumId(albumId),
          getSelectedPhotoIds(albumId),
          new MediaLibrary.Query()
            .album(new MediaLibrary.Album(deviceAlbumId))
            .eq(MediaLibrary.AssetField.MEDIA_TYPE, MediaLibrary.MediaType.IMAGE)
            .exeForMetadata(),
          getSlideshowDefaults(),
        ]);
        if (cancelled) return;

        const orderMode = settings?.orderMode ?? defaults.orderMode;
        const sortCriterion = settings?.sortCriterion ?? defaults.sortCriterion;
        const sortDirection = settings?.sortDirection ?? defaults.sortDirection;
        const intervalSec = settings?.transitionIntervalSec ?? defaults.transitionIntervalSec;
        transitionIntervalSecRef.current = intervalSec;
        repeatModeRef.current = settings?.repeatMode ?? defaults.repeatMode;

        const builtSequence = buildPlaybackSequence(
          metadata.map((m) => ({ id: m.id, filename: m.filename, creationTime: m.creationTime })),
          new Set(selectedIds),
          orderMode,
          sortCriterion,
          sortDirection
        );
        sequenceRef.current = builtSequence;
        setSequence(builtSequence);
        // 표시할 사진이 없으면(빈 재생목록) 배경음악도 틀지 않는다 — 사진이 있고 저장된
        // 설정 row가 있을 때만 그 row에 연결된 재생목록을 재생 대상으로 삼는다.
        setMusicSettingsId(builtSequence.length > 0 && settings ? settings.id : null);

        if (builtSequence.length > 0) {
          const firstUri = await resolvePhotoUri(builtSequence[0].id);
          if (cancelled) return;
          setSlots((prev) => ({ ...prev, a: { photo: builtSequence[0], uri: firstUri } }));
          startSlotKenBurns('a', intervalSec * 1000);
          if (builtSequence.length > 1) prefetchPhotoUri(builtSequence[1].id);
          showToolbarTemporarily();
          scheduleAutoAdvance();
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
    // once 모드에서 재생 종료 배너가 떠 있는 상태로 사용자가 이전 버튼 등으로 다시 사진을
    // 넘기면(handlePrev) 배너를 내린다 — 더 이상 "종료된" 상태가 아니다.
    if (ended) setEnded(false);
    const nextPhoto = sequenceRef.current[nextIndex];
    if (!nextPhoto) {
      // 이론상 도달하지 않아야 하지만(nextIndex는 항상 sequenceRef.current 기준으로 계산됨),
      // 혹시라도 벗어나면 자동전환 타이머 체인이 끊기지 않도록 그래도 재예약한다.
      scheduleAutoAdvance();
      return;
    }
    transitioningRef.current = true;

    const outgoingSlot = activeSlotRef.current;
    const incomingSlot = otherSlot(outgoingSlot);

    let uri: string;
    try {
      uri = await resolvePhotoUri(nextPhoto.id);
    } catch {
      // 삭제된 사진 등으로 uri 조회가 실패하면 이번 전환만 건너뛴다. transitioningRef를
      // 반드시 풀어야 다음 재시도가 막히지 않고, scheduleAutoAdvance()도 반드시 다시
      // 호출해야 한다 — 예전엔 setInterval 자체가 안전망이라 굳이 재예약할 필요가
      // 없었지만, 지금은 매 전환이 스스로 다음 타이머를 예약하는 체인이라 여기서
      // 빠뜨리면 재생이 그 자리에서 영구히 멈춘다(자동전환뿐 아니라 일시정지 해제 이후의
      // 재개도 이 체인에 의존함).
      transitioningRef.current = false;
      scheduleAutoAdvance();
      return;
    }
    if (!mountedRef.current) return;
    setSlots((prev) => ({ ...prev, [incomingSlot]: { photo: nextPhoto, uri } }));
    startSlotKenBurns(incomingSlot, transitionIntervalSecRef.current * 1000);
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

    const prefetchIndex = nextPlaybackIndex(nextIndex, sequenceRef.current.length, repeatModeRef.current);
    if (prefetchIndex !== null) prefetchPhotoUri(sequenceRef.current[prefetchIndex].id);

    // 자동이든(스케줄된 타이머) 수동(이전/다음 버튼·화면 탭)이든, 전환이 끝나면 다시
    // 전체 간격만큼 자동전환 타이머를 재예약한다 — 일시정지 중이면 scheduleAutoAdvance
    // 내부에서 아무것도 예약하지 않는다.
    scheduleAutoAdvance();
  }

  return (
    <View style={styles.container} {...panResponder.panHandlers}>
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
      {!loading && !loadError && sequence.length > 0 && (
        <View
          testID="slideshow-index"
          pointerEvents="none"
          style={[styles.indexBadge, { opacity: toolbarVisible ? 1 : 0 }]}
        >
          <Text style={styles.indexBadgeText}>
            {posRef.current + 1}/{sequence.length}
          </Text>
        </View>
      )}
      {!loading && !loadError && sequence.length > 0 && currentTrack && (
        <View testID="slideshow-music-toast" pointerEvents="none" style={[styles.musicToast, { opacity: musicToastVisible ? 1 : 0 }]}>
          {(() => {
            const cover = resolveMusicCoverSource(currentTrack);
            return cover ? (
              <Image source={typeof cover === 'number' ? cover : { uri: cover }} style={styles.musicToastCover} />
            ) : (
              <Text style={styles.musicToastIcon}>♫</Text>
            );
          })()}
          <Text style={styles.musicToastLabel} numberOfLines={1}>
            {formatMusicTrackLabel(currentTrack)}
          </Text>
        </View>
      )}
      {ended && (
        <View testID="slideshow-ended-banner" style={styles.endedBanner}>
          <Text style={styles.endedBannerText}>슬라이드쇼가 종료되었습니다</Text>
        </View>
      )}
      {!loading && !loadError && sequence.length > 0 && (
        <View
          testID="slideshow-toolbar"
          pointerEvents={toolbarVisible ? 'auto' : 'none'}
          style={[styles.toolbar, { opacity: toolbarVisible ? 1 : 0 }]}
        >
          {/* 사진 그룹은 ❮/❯(단순 이동) — ⏮/⏭는 유니코드 표준상 "트랙 건너뛰기" 의미라
              음악 그룹 전용으로 남겨둔다(frontend-design 스킬 리뷰, AskUserQuestion으로
              글리프 교체+accent pill 조합 확정). */}
          <Pressable testID="slideshow-prev" style={styles.toolbarButton} onPress={handlePrev} hitSlop={8}>
            <Text style={styles.toolbarButtonText}>❮</Text>
          </Pressable>
          <Pressable testID="slideshow-play-pause" style={styles.toolbarButton} onPress={togglePlaying} hitSlop={8}>
            <Text style={styles.toolbarButtonText}>{playing ? '❙❙' : '▶'}</Text>
          </Pressable>
          <Pressable testID="slideshow-next" style={styles.toolbarButton} onPress={handleNext} hitSlop={8}>
            <Text style={styles.toolbarButtonText}>❯</Text>
          </Pressable>
          <Pressable testID="slideshow-rotate" style={styles.toolbarButton} onPress={toggleRotation} hitSlop={8}>
            <Text style={[styles.toolbarButtonText, { opacity: isLandscape ? 1 : 0.4 }]}>⤾</Text>
          </Pressable>
          {trackCount > 0 && (
            <View style={styles.musicGroup}>
              {trackCount > 1 && (
                <Pressable testID="slideshow-music-prev" style={styles.toolbarButton} onPress={previousTrack} hitSlop={8}>
                  <Text style={styles.toolbarButtonText}>⏮</Text>
                </Pressable>
              )}
              <Pressable testID="slideshow-music-toggle" style={styles.toolbarButton} onPress={toggleMusicOn} hitSlop={8}>
                <Text style={[styles.toolbarButtonText, { opacity: musicOn ? 1 : 0.4 }]}>♫</Text>
              </Pressable>
              {trackCount > 1 && (
                <Pressable testID="slideshow-music-next" style={styles.toolbarButton} onPress={nextTrack} hitSlop={8}>
                  <Text style={styles.toolbarButtonText}>⏭</Text>
                </Pressable>
              )}
            </View>
          )}
        </View>
      )}
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
    indexBadge: {
      position: 'absolute',
      top: 16,
      alignSelf: 'center',
      backgroundColor: 'rgba(0,0,0,0.45)',
      borderRadius: 14,
      paddingHorizontal: 12,
      paddingVertical: 6,
      zIndex: 4,
    },
    indexBadgeText: {
      color: '#fff',
      fontSize: 13,
      fontWeight: '600',
    },
    toolbar: {
      position: 'absolute',
      bottom: 24,
      alignSelf: 'center',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: 'rgba(0,0,0,0.45)',
      borderRadius: 28,
      paddingHorizontal: 12,
      paddingVertical: 8,
      zIndex: 4,
    },
    toolbarButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
    },
    toolbarButtonText: {
      color: '#fff',
      fontSize: 20,
    },
    // 음악 컨트롤 3개(이전곡/토글/다음곡)를 accent 톤 반투명 캡슐로 묶어 사진 그룹과
    // 시각적으로 분리한다 — "이건 부가 기능 묶음"이라는 걸 색으로 즉시 전달(iOS 컨트롤센터
    // 그룹 칩과 동일한 원리). accent(#FC836D)는 라이트/다크 테마 공통값이라 하드코딩.
    musicGroup: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
      marginLeft: 4,
      backgroundColor: 'rgba(252,131,109,0.28)',
      borderWidth: 1,
      borderColor: 'rgba(252,131,109,0.5)',
      borderRadius: 24,
      paddingHorizontal: 2,
    },
    musicToast: {
      position: 'absolute',
      bottom: 96,
      left: 16,
      maxWidth: '70%',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: 'rgba(0,0,0,0.55)',
      borderRadius: 24,
      paddingHorizontal: 14,
      paddingVertical: 7,
      zIndex: 4,
    },
    musicToastIcon: {
      color: 'rgba(255,255,255,0.75)',
      fontSize: 16,
    },
    musicToastCover: {
      width: 32,
      height: 32,
      borderRadius: 4,
    },
    musicToastLabel: {
      color: 'rgba(255,255,255,0.92)',
      fontSize: 13,
      flexShrink: 1,
    },
    endedBanner: {
      position: 'absolute',
      bottom: 150,
      alignSelf: 'center',
      backgroundColor: 'rgba(0,0,0,0.6)',
      borderRadius: 20,
      paddingHorizontal: 18,
      paddingVertical: 10,
      zIndex: 4,
    },
    endedBannerText: {
      color: '#fff',
      fontSize: 14,
      fontWeight: '600',
    },
  });
}
