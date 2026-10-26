import { requireOptionalNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

import { notifyAlbumContentsChanged } from '../library/albumContentsEvents';
import { supportsFileManagement } from './gallerySelection';
import { sortTrashItems, toTrashItem, type TrashItem } from './trash';

interface NativeMediaTrash {
  isSupported(): boolean;
  setTrashed(uris: string[], trashed: boolean): Promise<boolean>;
  deletePermanently(uris: string[]): Promise<boolean>;
  listTrashed(): Promise<unknown[]>;
}

// 로컬 네이티브 모듈(modules/media-trash). import 시점이 아니라 호출 시점에 찾는다 — Jest·iOS·모듈이 없는
// 빌드에서도 이 파일을 import만으로는 터지지 않게 한다(file-mover와 같은 방식).
function nativeModule(): NativeMediaTrash | null {
  return requireOptionalNativeModule<NativeMediaTrash>('MediaTrash');
}

/** 휴지통을 쓸 수 있는 환경인가: Android 11+ 이고 네이티브 모듈이 들어 있는 빌드. */
export function isTrashAvailable(): boolean {
  if (!supportsFileManagement(Platform.OS, Platform.Version)) return false;
  return nativeModule()?.isSupported() ?? false;
}

function requireNative(): NativeMediaTrash {
  const native = nativeModule();
  if (!native) throw new Error('Media trash is not available in this build');
  return native;
}

/** 시스템 확인 다이얼로그를 거쳐 휴지통으로 보낸다. 사용자가 승인하면 true, 취소하면 false. */
export async function moveToTrash(ids: readonly string[]): Promise<boolean> {
  return requireNative().setTrashed([...ids], true);
}

/** 휴지통에서 원래 위치로 되돌린다. 승인하면 true, 취소하면 false. 앨범 목록이 다시 조회되도록 알린다. */
export async function restoreFromTrash(ids: readonly string[]): Promise<boolean> {
  const granted = await requireNative().setTrashed([...ids], false);
  if (granted) notifyAlbumContentsChanged();
  return granted;
}

/** 휴지통 항목을 영구 삭제한다(되돌릴 수 없다). 승인하면 true, 취소하면 false. */
export async function deleteFromTrash(ids: readonly string[]): Promise<boolean> {
  const granted = await requireNative().deletePermanently([...ids]);
  if (granted) notifyAlbumContentsChanged();
  return granted;
}

export async function listTrash(): Promise<TrashItem[]> {
  const rows = await requireNative().listTrashed();
  const items: TrashItem[] = [];
  for (const row of rows) {
    const item = toTrashItem(row);
    if (item) items.push(item);
  }
  return sortTrashItems(items);
}
