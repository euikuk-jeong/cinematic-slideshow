import { useEffect, useState } from 'react';
import * as MediaLibrary from 'expo-media-library';

import { thumbnailCacheKey, UriResolverCache } from './thumbnailCache';

// 화면에 마운트된(FlatList/SectionList windowing 대상) 항목만 uri를 조회하므로, 앨범
// 사진이 수천 장이어도 한 번에 조회되는 건 보이는 만큼뿐이다 — MusicPickerModal이
// 오디오 전체를 미리 getInfo()로 조회하다 겪은 문제(실기기 OOM)와 같은 경로를 피한다.
const uriCache = new UriResolverCache((id) => new MediaLibrary.Asset(id).getUri());

export interface PhotoUriResult {
  uri: string | null;
  /** uri 조회가 실패했다(삭제된 asset 등) — 호출 측이 오류 타일을 그릴 수 있게 한다. */
  error: boolean;
}

export function usePhotoUri(id: string, modificationTime?: number | null): PhotoUriResult {
  const key = thumbnailCacheKey(id, modificationTime);
  const [state, setState] = useState<PhotoUriResult>({ uri: uriCache.peek(key) ?? null, error: false });
  useEffect(() => {
    const cached = uriCache.peek(key);
    if (cached) {
      setState({ uri: cached, error: false });
      return;
    }
    setState({ uri: null, error: false });
    let cancelled = false;
    uriCache
      .get(id, key)
      .then((uri) => {
        if (!cancelled) setState({ uri, error: false });
      })
      .catch((e) => {
        console.warn(`[usePhotoUri] getUri failed for ${id}`, e);
        if (!cancelled) setState({ uri: null, error: true });
      });
    return () => {
      cancelled = true;
    };
  }, [id, key]);
  return state;
}
