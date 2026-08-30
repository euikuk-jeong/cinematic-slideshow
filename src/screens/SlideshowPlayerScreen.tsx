import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import * as MediaLibrary from 'expo-media-library';

import type { RootStackParamList } from '../../App';
import { getSelectedPhotoIds, getSlideshowSettingsByAlbumId } from '../db/client';
import type { OrderMode, RepeatMode } from '../db/types';
import type { PhotoMetadata } from '../photos/photoSort';
import { buildPlaybackSequence, nextPlaybackIndex } from '../slideshow/playback';
import type { ThemeColors } from '../theme/colors';
import { useAppTheme } from '../theme/ThemeContext';

// AlbumSettingsScreen 초기 상태와 동일한 기본값 — 컨트롤을 한 번도 안 건드린 앨범은
// slideshow_settings row 자체가 없어(persist()는 값이 바뀔 때만 호출됨) null이 온다.
const DEFAULT_TRANSITION_INTERVAL_SEC = 4;
const DEFAULT_ORDER_MODE: OrderMode = 'sequential';
const DEFAULT_REPEAT_MODE: RepeatMode = 'loop';

type SlideshowPlayerScreenProps = NativeStackScreenProps<RootStackParamList, 'SlideshowPlayer'>;

export function SlideshowPlayerScreen({ route }: SlideshowPlayerScreenProps) {
  const { albumId, deviceAlbumId } = route.params;
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'SlideshowPlayer'>>();
  const { colors: c } = useAppTheme();
  const styles = useMemo(() => createStyles(c), [c]);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [sequence, setSequence] = useState<PhotoMetadata[]>([]);
  const [transitionIntervalSec, setTransitionIntervalSec] = useState(DEFAULT_TRANSITION_INTERVAL_SEC);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>(DEFAULT_REPEAT_MODE);
  const [currentIndex, setCurrentIndex] = useState(0);

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
        setTransitionIntervalSec(settings?.transitionIntervalSec ?? DEFAULT_TRANSITION_INTERVAL_SEC);
        setRepeatMode(settings?.repeatMode ?? DEFAULT_REPEAT_MODE);
        setSequence(
          buildPlaybackSequence(
            metadata.map((m) => ({ id: m.id, filename: m.filename, creationTime: m.creationTime })),
            new Set(selectedIds),
            orderMode
          )
        );
      } catch {
        if (!cancelled) setLoadError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [albumId, deviceAlbumId]);

  // currentIndex를 effect 의존성에 넣지 않고 ref로 읽는다 — 그러면 이 effect는 sequence/
  // repeatMode/transitionIntervalSec이 바뀔 때만(사실상 로드 완료 시 한 번) 재설정되고,
  // setInterval 하나가 매 전환마다 정확히 transitionIntervalSec 간격으로만 동작한다.
  const currentIndexRef = useRef(0);
  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  useEffect(() => {
    if (sequence.length === 0) return;
    const interval = setInterval(() => {
      const next = nextPlaybackIndex(currentIndexRef.current, sequence.length, repeatMode);
      if (next === null) {
        navigation.goBack();
        return;
      }
      setCurrentIndex(next);
    }, transitionIntervalSec * 1000);
    return () => clearInterval(interval);
  }, [sequence, repeatMode, transitionIntervalSec, navigation]);

  const currentPhoto = sequence[currentIndex] ?? null;
  const photoUri = usePhotoUri(currentPhoto?.id ?? null);

  return (
    <View style={styles.container}>
      {loading ? (
        <ActivityIndicator color={c.accent} />
      ) : loadError ? (
        <Text style={styles.message}>사진을 불러오지 못했어요</Text>
      ) : sequence.length === 0 ? (
        <Text style={styles.message}>표시할 사진이 없어요</Text>
      ) : photoUri ? (
        <Image source={{ uri: photoUri }} style={styles.photo} resizeMode="contain" />
      ) : (
        <ActivityIndicator color={c.accent} />
      )}
      <Pressable testID="slideshow-close" style={styles.closeButton} onPress={() => navigation.goBack()} hitSlop={12}>
        <Text style={styles.closeButtonText}>✕</Text>
      </Pressable>
    </View>
  );
}

// 반복(loop) 재생은 같은 id를 계속 다시 보여주므로, 캐시가 없으면 매 바퀴마다 같은
// 사진을 다시 native getUri()로 조회하고 그 사이 화면이 스피너로 비어버린다
// (PhotoSelectionScreen의 photoUriCache와 같은 이유로 여기도 모듈 스코프 캐시를 둔다).
const photoUriCache = new Map<string, string>();

function usePhotoUri(id: string | null): string | null {
  const [uri, setUri] = useState<string | null>(id ? photoUriCache.get(id) ?? null : null);
  useEffect(() => {
    if (!id) {
      setUri(null);
      return;
    }
    const cached = photoUriCache.get(id);
    if (cached) {
      setUri(cached);
      return;
    }
    let cancelled = false;
    setUri(null);
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

function createStyles(c: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: '#000',
      alignItems: 'center',
      justifyContent: 'center',
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
    },
    closeButtonText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '600',
    },
  });
}
