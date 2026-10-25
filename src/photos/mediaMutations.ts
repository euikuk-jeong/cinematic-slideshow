import * as MediaLibrary from 'expo-media-library';
import { Platform } from 'react-native';

import { getAlbumByDeviceId, removeSelectedPhotos } from '../db/client';
import { notifyAlbumContentsChanged } from '../library/albumContentsEvents';
import type { GalleryItem } from './galleryItem';
import { summarizeMutation, supportsFileManagement, type MutationSummary } from './gallerySelection';
import { queryAlbumItems } from './queryAlbumItems';
import { invalidatePhotoUris } from './usePhotoUri';

/** 삭제·이동 UI를 노출할 수 있는 환경인가(Android 11+ — 시스템 확인 다이얼로그 경로). */
export function isFileManagementAvailable(): boolean {
  return supportsFileManagement(Platform.OS, Platform.Version);
}

export type MediaMutation = { kind: 'delete' } | { kind: 'move'; targetAlbumId: string };

export interface MediaMutationResult {
  /** 작업 후 재조회한 이 앨범의 항목. */
  items: GalleryItem[];
  summary: MutationSummary;
  /** 네이티브 호출이 던진 예외(시스템 다이얼로그 취소 포함). 성공 여부는 summary로 판정한다. */
  error: unknown | null;
}

/**
 * 선택한 사진·영상을 삭제하거나 다른 앨범(폴더)으로 옮긴다. 확인은 OS 시스템 다이얼로그
 * (MediaStore.createDeleteRequest/createWriteRequest)가 받으므로 앱은 별도 확인 UI를 두지 않는다.
 * 사용자 취소와 실제 실패가 같은 예외로 오고 이동은 일부만 성공할 수 있어서, 호출 후 앨범을
 * 다시 조회해 실제로 사라진 항목만 성공으로 센다.
 */
export async function runMediaMutation(
  deviceAlbumId: string,
  ids: readonly string[],
  mutation: MediaMutation
): Promise<MediaMutationResult> {
  let error: unknown | null = null;
  try {
    const assets = ids.map((id) => new MediaLibrary.Asset(id));
    if (mutation.kind === 'delete') {
      await MediaLibrary.Asset.delete(assets);
    } else {
      await new MediaLibrary.Album(mutation.targetAlbumId).add(assets);
    }
  } catch (e) {
    console.warn(`[mediaMutations] ${mutation.kind} failed or was cancelled`, e);
    error = e;
  }

  const items = await queryAlbumItems(deviceAlbumId);
  const summary = summarizeMutation(ids, items);
  // 이동은 id를 유지한 채 파일 경로만 바꾼다 — 캐시된 옛 경로가 남지 않게 요청 항목 전체를 비운다.
  invalidatePhotoUris(ids);
  if (summary.removedIds.length > 0) {
    await forgetSelectedPhotos(deviceAlbumId, summary.removedIds);
    // 앨범 목록의 커버·개수·정렬은 별도로 캐시돼 있다 — 바뀌었음을 알려 다시 조회하게 한다.
    notifyAlbumContentsChanged();
  }
  return { items, summary, error };
}

// 슬라이드쇼의 "선택한 사진만 재생"은 이 앨범에 저장된 id 목록으로 걸러낸다. 사라진 id가 남으면
// 전부 사라진 경우 재생할 사진이 0장이 되므로 함께 지운다. 실패해도 작업 자체의 결과는 유효하다.
async function forgetSelectedPhotos(deviceAlbumId: string, removedIds: readonly string[]): Promise<void> {
  try {
    const album = await getAlbumByDeviceId(deviceAlbumId);
    if (album) await removeSelectedPhotos(album.id, removedIds);
  } catch (e) {
    console.warn('[mediaMutations] failed to clean up selected photos', e);
  }
}
