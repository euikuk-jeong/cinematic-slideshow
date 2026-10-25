import * as MediaLibrary from 'expo-media-library';
import { Platform } from 'react-native';

import { getAlbumByDeviceId, removeSelectedPhotos } from '../db/client';
import { notifyAlbumContentsChanged } from '../library/albumContentsEvents';
import type { GalleryItem } from './galleryItem';
import { summarizeCopy, summarizeMutation, supportsFileManagement, type MutationSummary } from './gallerySelection';
import { uriToFilePath } from './directMove';
import { transferFiles } from './fileMover';
import { queryAlbumItems } from './queryAlbumItems';
import { invalidatePhotoUris } from './usePhotoUri';

/** 삭제·이동·복사 UI를 노출할 수 있는 환경인가(Android 11+ — 시스템 확인 다이얼로그 경로). */
export function isFileManagementAvailable(): boolean {
  return supportsFileManagement(Platform.OS, Platform.Version);
}

export type MediaMutation =
  | { kind: 'delete' }
  | { kind: 'move'; targetAlbumId: string }
  // 새 폴더(Pictures/<folderName>/)를 만들면서 옮긴다. MediaStore의 앨범은 파일에서 생기는 bucket이라
  // 빈 폴더는 만들 수 없고, 폴더 생성은 항상 첫 이동과 함께 일어난다. folderName에 `/`가 있으면 하위 폴더.
  | { kind: 'moveToNew'; folderName: string }
  // MediaStore가 거부하는 폴더(DCIM/Pictures/Movies 밖)나 임의 위치로 파일을 직접 옮긴다 — 모든 파일 접근 권한 필요.
  | { kind: 'moveDirect'; destinationDir: string }
  // 복사: 원본은 그대로 두고 대상에 사본을 만든다(사본은 MediaStore에 새 항목으로 잡힌다).
  | { kind: 'copy'; targetAlbumId: string }
  | { kind: 'copyToNew'; folderName: string }
  | { kind: 'copyDirect'; destinationDir: string };

/** 원본이 그대로 남는 작업인가 — 결과를 "원본이 사라졌는가"가 아니라 "사본을 만들었는가"로 판정한다. */
export function isCopyMutation(mutation: MediaMutation): boolean {
  return mutation.kind === 'copy' || mutation.kind === 'copyToNew' || mutation.kind === 'copyDirect';
}

export interface MediaMutationResult {
  /** 작업 후 재조회한 이 앨범의 항목. */
  items: GalleryItem[];
  /** 이동·삭제는 removedIds=원본에서 사라진 항목, 복사는 removedIds=사본을 만든 항목(원본은 그대로). */
  summary: MutationSummary;
  /** 네이티브 호출이 던진 예외(시스템 다이얼로그 취소 포함). 성공 여부는 summary로 판정한다. */
  error: unknown | null;
}

interface ExecuteResult {
  error: unknown | null;
  /** 복사 작업에서 실제로 사본이 만들어진 id. 복사가 아니면 null. */
  copiedIds: string[] | null;
}

/**
 * 선택한 사진·영상을 삭제하거나 다른 앨범(폴더)으로 옮기거나 복사한다. 확인은 OS 시스템 다이얼로그
 * (MediaStore.createDeleteRequest/createWriteRequest)가 받으므로 앱은 별도 확인 UI를 두지 않는다.
 * 사용자 취소와 실제 실패가 같은 예외로 오고 이동은 일부만 성공할 수 있어서, 호출 후 앨범을
 * 다시 조회해 실제로 사라진 항목만 성공으로 센다(복사는 사본을 만든 항목을 센다).
 */
export async function runMediaMutation(
  deviceAlbumId: string,
  ids: readonly string[],
  mutation: MediaMutation
): Promise<MediaMutationResult> {
  const { error, copiedIds } = await execute(ids, mutation);
  const items = await queryAlbumItems(deviceAlbumId);
  const summary = copiedIds ? summarizeCopy(ids, copiedIds) : summarizeMutation(ids, items);
  await afterMutation(deviceAlbumId, ids, summary, copiedIds !== null);
  return { items, summary, error };
}

export interface AlbumsMutationResult {
  summary: MutationSummary;
  error: unknown | null;
  /** 작업 후 항목이 하나도 남지 않은 앨범(삭제·전체 이동·이름 변경으로 비어서 목록에서 사라질 앨범). */
  emptiedAlbumIds: string[];
}

/**
 * 앨범(폴더) 여러 개를 통째로 삭제·이동·복사한다. 모든 앨범의 항목을 한 번에 모아 작업을 한 번만 실행해
 * 시스템 확인 다이얼로그도 한 번만 뜬다. 이름 변경은 앨범 1개를 "같은 상위 폴더의 새 이름 폴더로 이동"하는 것이다.
 */
export async function runAlbumsMutation(
  deviceAlbumIds: readonly string[],
  mutation: MediaMutation
): Promise<AlbumsMutationResult> {
  const idsByAlbum = await Promise.all(
    deviceAlbumIds.map(async (albumId) => [albumId, (await queryAlbumItems(albumId)).map((item) => item.id)] as const)
  );
  const allIds = idsByAlbum.flatMap(([, ids]) => ids);
  if (allIds.length === 0) {
    return { summary: { removedIds: [], remainingIds: [] }, error: null, emptiedAlbumIds: [] };
  }
  const { error, copiedIds } = await execute(allIds, mutation);

  const isCopy = copiedIds !== null;
  const removed: string[] = [];
  const remaining: string[] = [];
  const emptiedAlbumIds: string[] = [];
  for (const [albumId, ids] of idsByAlbum) {
    const after = await queryAlbumItems(albumId);
    const summary = isCopy ? summarizeCopy(ids, copiedIds) : summarizeMutation(ids, after);
    removed.push(...summary.removedIds);
    remaining.push(...summary.remainingIds);
    if (!isCopy && ids.length > 0 && after.length === 0) emptiedAlbumIds.push(albumId);
    await afterMutation(albumId, ids, summary, isCopy);
  }
  return { summary: { removedIds: removed, remainingIds: remaining }, error, emptiedAlbumIds };
}

async function execute(ids: readonly string[], mutation: MediaMutation): Promise<ExecuteResult> {
  try {
    const assets = ids.map((id) => new MediaLibrary.Asset(id));
    switch (mutation.kind) {
      case 'delete':
        await MediaLibrary.Asset.delete(assets);
        return { error: null, copiedIds: null };
      case 'move':
        await new MediaLibrary.Album(mutation.targetAlbumId).add(assets);
        return { error: null, copiedIds: null };
      case 'moveToNew':
        await MediaLibrary.Album.create(mutation.folderName, assets, true);
        return { error: null, copiedIds: null };
      case 'moveDirect':
        await transferDirectly(assets, mutation.destinationDir, true);
        return { error: null, copiedIds: null };
      case 'copyToNew':
        await MediaLibrary.Album.create(mutation.folderName, assets, false);
        return { error: null, copiedIds: [...ids] };
      case 'copyDirect':
        return await copyDirectly(ids, assets, mutation.destinationDir);
      case 'copy':
        return await copyIntoAlbum(ids, assets, mutation.targetAlbumId);
    }
  } catch (e) {
    console.warn(`[mediaMutations] ${mutation.kind} failed or was cancelled`, e);
    // 복사는 실패하면 사본이 하나도 없다고 본다(Album.create는 전부 아니면 예외, 직접 복사는 항목별 결과를 따로 센다).
    return { error: e, copiedIds: isCopyMutation(mutation) ? [] : null };
  }
}

async function resolveFilePaths(assets: MediaLibrary.Asset[]): Promise<string[]> {
  const uris = await Promise.all(assets.map((asset) => asset.getUri()));
  const paths = uris.map((uri) => uriToFilePath(uri));
  if (paths.some((path) => path === null)) {
    throw new Error('Could not resolve a file path for the selected items');
  }
  return paths as string[];
}

// 항목별 파일 경로를 찾아 네이티브가 직접 옮긴다. 새 위치의 파일은 MediaStore에 새 항목(새 id)으로
// 잡히고 옛 항목은 사라지므로, 호출한 쪽은 평소처럼 재조회로 결과를 판정한다. 일부 실패는 첫 오류를 던져
// 안내에 이유가 보이게 한다(성공한 항목은 이미 옮겨졌으니 재조회 결과에 반영된다).
async function transferDirectly(assets: MediaLibrary.Asset[], destinationDir: string, move: boolean): Promise<void> {
  const results = await transferFiles(await resolveFilePaths(assets), destinationDir, move);
  const failed = results.find((result) => !result.ok);
  if (failed) throw new Error(failed.error ?? 'File transfer failed');
}

async function copyDirectly(
  ids: readonly string[],
  assets: MediaLibrary.Asset[],
  destinationDir: string
): Promise<ExecuteResult> {
  const results = await transferFiles(await resolveFilePaths(assets), destinationDir, false);
  const copiedIds = ids.filter((_, index) => results[index]?.ok === true);
  const failed = results.find((result) => !result.ok);
  return { error: failed ? new Error(failed.error ?? 'File copy failed') : null, copiedIds };
}

// 기존 앨범으로 복사: 원본 파일을 읽어 그 앨범 폴더에 새 항목으로 만든다(Asset.create). 항목마다 따로
// 성공·실패하므로 하나씩 처리하고, 실패해도 나머지는 계속한다. 새 항목은 쓰기 확인 다이얼로그가 필요 없다.
async function copyIntoAlbum(
  ids: readonly string[],
  assets: MediaLibrary.Asset[],
  targetAlbumId: string
): Promise<ExecuteResult> {
  // Asset.create는 인자를 그대로 Uri로 파싱해 ContentResolver로 연다 — 스킴 없는 경로(`/storage/...`)는
  // "No content provider"로 실패하므로 getUri()가 준 file:// URI를 그대로(디코딩하지 않고) 넘긴다.
  // 파일 이름도 이 URI의 마지막 구간에서 나온다.
  const uris = await Promise.all(assets.map((asset) => asset.getUri()));
  const album = new MediaLibrary.Album(targetAlbumId);
  const copiedIds: string[] = [];
  let firstError: unknown | null = null;
  for (let index = 0; index < uris.length; index++) {
    try {
      await MediaLibrary.Asset.create(uris[index], album);
      copiedIds.push(ids[index]);
    } catch (e) {
      console.warn('[mediaMutations] copy of one item failed', e);
      firstError ??= e;
    }
  }
  return { error: firstError, copiedIds };
}

async function afterMutation(
  deviceAlbumId: string,
  ids: readonly string[],
  summary: MutationSummary,
  isCopy: boolean
): Promise<void> {
  // 이동은 id를 유지한 채 파일 경로만 바꾼다 — 캐시된 옛 경로가 남지 않게 요청 항목 전체를 비운다.
  invalidatePhotoUris(ids);
  if (summary.removedIds.length === 0) return;
  // 복사는 원본이 남으므로 "선택한 사진만 재생"의 선택 기록을 건드리지 않는다.
  if (!isCopy) await forgetSelectedPhotos(deviceAlbumId, summary.removedIds);
  // 앨범 목록의 커버·개수·정렬은 별도로 캐시돼 있다 — 바뀌었음을 알려 다시 조회하게 한다.
  notifyAlbumContentsChanged();
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
