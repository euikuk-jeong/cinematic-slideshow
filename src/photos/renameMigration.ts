import * as MediaLibrary from 'expo-media-library';

import { migrateAlbumIdentity } from '../db/client';
import { getFolderPath } from '../settings/folderTree';
import { buildAssetIdMap } from './albumRekey';
import { folderPathToDirectory } from './directMove';
import type { GalleryItem } from './galleryItem';
import { queryAlbumItems } from './queryAlbumItems';

/** 앨범 이름 변경 한 건의 문맥 — 작업 전에 만들어 두고, 작업이 성공한 뒤 설정을 옮기는 데 쓴다. */
export interface RenameContext {
  oldDeviceAlbumId: string;
  /** 이름 변경 전 이 앨범의 항목(선택 사진 id를 새 id로 옮기는 데 쓴다). */
  oldItems: GalleryItem[];
  newTitle: string;
  /** 이름을 바꾼 뒤 폴더의 절대 경로(상위 폴더 + 새 이름). */
  newDirectory: string;
}

export async function captureRenameContext(
  oldDeviceAlbumId: string,
  newTitle: string,
  newDirectory: string
): Promise<RenameContext> {
  return { oldDeviceAlbumId, oldItems: await queryAlbumItems(oldDeviceAlbumId), newTitle, newDirectory };
}

/**
 * 기기 쪽 앨범 id는 폴더 경로에서 나오므로 이름을 바꾸면 완전히 다른(새) 앨범이 된다. 새 폴더를 경로로 찾아
 * (같은 제목의 다른 폴더와 헷갈리지 않게 대표 항목의 폴더 경로까지 비교) 옛 앨범에 저장해 둔 설정을 새 앨범으로 옮긴다.
 * 설정 이전은 부가 작업이라 실패해도 이름 변경 자체는 유효하다 — 못 옮기면 false.
 */
export async function migrateRenamedAlbum(context: RenameContext): Promise<boolean> {
  try {
    const newDeviceAlbumId = await findAlbumIdByDirectory(context.newDirectory, context.newTitle);
    if (!newDeviceAlbumId || newDeviceAlbumId === context.oldDeviceAlbumId) return false;
    const newItems = await queryAlbumItems(newDeviceAlbumId);
    const assetIdMap = buildAssetIdMap(context.oldItems, newItems);
    return await migrateAlbumIdentity(context.oldDeviceAlbumId, newDeviceAlbumId, context.newTitle, assetIdMap);
  } catch (e) {
    console.warn('[renameMigration] failed to carry album settings over', e);
    return false;
  }
}

async function findAlbumIdByDirectory(directory: string, title: string): Promise<string | null> {
  const albums = await MediaLibrary.Album.getAll();
  for (const album of albums) {
    if ((await album.getTitle()) !== title) continue;
    const [asset] = await new MediaLibrary.Query()
      .album(album)
      .within(MediaLibrary.AssetField.MEDIA_TYPE, [MediaLibrary.MediaType.IMAGE, MediaLibrary.MediaType.VIDEO])
      .limit(1)
      .exe();
    if (!asset) continue;
    if (folderPathToDirectory(getFolderPath(await asset.getUri())) === directory) return album.id;
  }
  return null;
}
