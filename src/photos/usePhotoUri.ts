import { useEffect, useState } from 'react';
import * as MediaLibrary from 'expo-media-library';

import { thumbnailCacheKey, UriResolverCache } from './thumbnailCache';

// 화면에 마운트된(FlatList/SectionList windowing 대상) 항목만 uri를 조회하므로, 앨범
// 사진이 수천 장이어도 한 번에 조회되는 건 보이는 만큼뿐이다 — MusicPickerModal이
// 오디오 전체를 미리 getInfo()로 조회하다 겪은 문제(실기기 OOM)와 같은 경로를 피한다.
const uriCache = new UriResolverCache((id) => new MediaLibrary.Asset(id).getUri());

export function clearPhotoUriCache(): void {
  uriCache.clear();
}

export function invalidatePhotoUris(ids: readonly string[]): void {
  uriCache.invalidate(ids);
}

export interface PhotoUriResult {
  uri: string | null;
  /** uri 조회가 실패했다(삭제된 asset 등) — 호출 측이 오류 타일을 그릴 수 있게 한다. */
  error: boolean;
}

/**
 * enabled=false면 조회를 미룬다(뷰어가 현재 페이지를 먼저 불러온 뒤 이웃을 미리 불러오기 위함).
 * 이미 캐시에 있으면 enabled와 무관하게 바로 uri를 돌려준다.
 * attempt: 값이 바뀌면 (실패했던 조회를 포함해) 다시 조회한다 — "다시 시도" 버튼용.
 */
export function usePhotoUri(id: string, modificationTime?: number | null, enabled = true, attempt = 0): PhotoUriResult {
  const key = thumbnailCacheKey(id, modificationTime);
  const [state, setState] = useState<PhotoUriResult>({ uri: uriCache.peek(key) ?? null, error: false });
  useEffect(() => {
    const cached = uriCache.peek(key);
    if (cached) {
      setState({ uri: cached, error: false });
      return;
    }
    setState({ uri: null, error: false });
    if (!enabled) return;
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
  }, [id, key, enabled, attempt]);
  return state;
}
