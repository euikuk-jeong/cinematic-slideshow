import type { Album } from './types';

export interface ReferenceValidityDiff {
  toValid: number[];
  toInvalid: number[];
}

/**
 * DB에 저장된 앨범과 현재 기기 앨범 목록을 비교해 is_reference_valid 값이
 * 바뀌어야 하는 앨범 id만 골라낸다(양방향: 사라지면 invalid, 다시 나타나면 valid).
 */
export function computeReferenceValidityDiff(
  storedAlbums: readonly Album[],
  currentDeviceAlbumIds: ReadonlySet<string>
): ReferenceValidityDiff {
  const toValid: number[] = [];
  const toInvalid: number[] = [];

  for (const album of storedAlbums) {
    const existsOnDevice = currentDeviceAlbumIds.has(album.deviceAlbumId);
    if (existsOnDevice && !album.isReferenceValid) {
      toValid.push(album.id);
    } else if (!existsOnDevice && album.isReferenceValid) {
      toInvalid.push(album.id);
    }
  }

  return { toValid, toInvalid };
}
