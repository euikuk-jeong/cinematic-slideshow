import * as MediaLibrary from 'expo-media-library';
import { Platform } from 'react-native';

import { getAlbumByDeviceId, removeSelectedPhotos } from '../db/client';
import { notifyAlbumContentsChanged } from '../library/albumContentsEvents';
import type { GalleryItem } from './galleryItem';
import { summarizeMutation, supportsFileManagement, type MutationSummary } from './gallerySelection';
import { uriToFilePath } from './directMove';
import { transferFiles } from './fileMover';
import { queryAlbumItems } from './queryAlbumItems';
import { invalidatePhotoUris } from './usePhotoUri';

/** 삭제·이동 UI를 노출할 수 있는 환경인가(Android 11+ — 시스템 확인 다이얼로그 경로). */
export function isFileManagementAvailable(): boolean {
  return supportsFileManagement(Platform.OS, Platform.Version);
}

export type MediaMutation =
  | { kind: 'delete' }
  | { kind: 'move'; targetAlbumId: string }
  // 새 폴더(Pictures/<folderName>/)를 만들면서 옮긴다. MediaStore의 앨범은 파일에서 생기는 bucket이라
  // 빈 폴더는 만들 수 없고, 폴더 생성은 항상 첫 이동과 함께 일어난다.
  | { kind: 'moveToNew'; folderName: string }
  // MediaStore가 거부하는 폴더(DCIM/Pictures/Movies 밖)로 파일을 직접 옮긴다 — 모든 파일 접근 권한 필요.
  | { kind: 'moveDirect'; destinationDir: string };

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
    if (mutation.kind === 'moveDirect') {
      await moveFilesDirectly(assets, mutation.destinationDir);
    } else if (mutation.kind === 'delete') {
      await MediaLibrary.Asset.delete(assets);
    } else if (mutation.kind === 'moveToNew') {
      await MediaLibrary.Album.create(mutation.folderName, assets, true);
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

// 항목별 파일 경로를 찾아 네이티브가 직접 옮기게 한다. 새 위치의 파일은 MediaStore에 새 항목(새 id)으로
// 잡히고 옛 항목은 사라지므로, 호출한 쪽은 평소처럼 재조회로 결과를 판정한다. 일부 실패는 첫 오류를 던져
// 안내에 이유가 보이게 한다(성공한 항목은 이미 옮겨졌으니 재조회 결과에 반영된다).
async function moveFilesDirectly(assets: MediaLibrary.Asset[], destinationDir: string): Promise<void> {
  const uris = await Promise.all(assets.map((asset) => asset.getUri()));
  const paths = uris.map((uri) => uriToFilePath(uri));
  if (paths.some((path) => path === null)) {
    throw new Error('Could not resolve a file path for the selected items');
  }
  const results = await transferFiles(paths as string[], destinationDir, true);
  const failed = results.find((result) => !result.ok);
  if (failed) throw new Error(failed.error ?? 'File move failed');
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
