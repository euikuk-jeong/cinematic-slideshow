import * as MediaLibrary from 'expo-media-library';

import { toGalleryItem, type GalleryItem, type RawAssetMetadata } from './galleryItem';

/**
 * 앨범의 사진+영상을 경량 메타데이터로 조회한다. 파일 경로 resolve(getInfo)를 하지 않아
 * 수천 장 앨범에서도 메모리가 급증하지 않는다.
 */
export async function queryAlbumItems(deviceAlbumId: string): Promise<GalleryItem[]> {
  const result = await new MediaLibrary.Query()
    .album(new MediaLibrary.Album(deviceAlbumId))
    .within(MediaLibrary.AssetField.MEDIA_TYPE, [MediaLibrary.MediaType.IMAGE, MediaLibrary.MediaType.VIDEO])
    .exeForMetadata();
  const items: GalleryItem[] = [];
  for (const meta of result) {
    const item = toGalleryItem(meta as unknown as RawAssetMetadata);
    if (item) items.push(item);
  }
  return items;
}
