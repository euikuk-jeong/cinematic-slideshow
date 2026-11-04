import { requireOptionalNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

import { directoryToDocId, docIdToDirectory, findCoveringGrant, grantDirectoryFor, type CoveringGrant } from './directMove';
import { supportsFileManagement } from './gallerySelection';

export interface CopyResult {
  source: string;
  /** 사본을 만들었거나(skipped=false) 이미 그 폴더에 있어 할 일이 없었다(skipped=true). */
  ok: boolean;
  skipped: boolean;
  error: string | null;
}

interface NativeFileMover {
  isSafSupported(): boolean;
  listWritableTrees(): string[];
  pickTree(initialDocId: string): Promise<string | null>;
  copyToTree(treeDocId: string, destinationDocId: string, sources: string[]): Promise<CopyResult[]>;
}

// 로컬 네이티브 모듈(modules/file-mover). import 시점이 아니라 호출 시점에 찾는다 — Jest·iOS·모듈이 없는
// 빌드에서도 이 파일을 import만으로는 터지지 않게 한다.
function nativeModule(): NativeFileMover | null {
  const native = requireOptionalNativeModule<NativeFileMover>('FileMover');
  // 같은 이름의 옛 모듈(모든 파일 접근 버전)이 든 개발 클라이언트에서는 SAF 함수가 없다 — 없는 것으로 취급한다.
  return native && typeof native.pickTree === 'function' ? native : null;
}

/**
 * 미디어 폴더 밖 위치로 옮기기·복사를 쓸 수 있는 환경인가: Android 11+ 이고 SAF 네이티브 모듈이 들어 있는 빌드.
 */
export function isDirectMoveSupported(): boolean {
  if (!supportsFileManagement(Platform.OS, Platform.Version)) return false;
  return nativeModule()?.isSafSupported() ?? false;
}

function requireNative(): NativeFileMover {
  const native = nativeModule();
  if (!native) throw new Error('Folder access is not available in this build');
  return native;
}

/** 이미 받아 둔 폴더 권한 중 directory에 쓸 수 있는 것. 없으면 null. */
export function findFolderGrant(directory: string): CoveringGrant | null {
  const native = nativeModule();
  if (!native) return null;
  return findCoveringGrant(native.listWritableTrees(), directory);
}

export type FolderAccessResult =
  | { status: 'granted'; grant: CoveringGrant }
  | { status: 'cancelled' }
  /** 사용자가 다른 폴더를 골랐다(그 폴더 권한은 남지만 대상 폴더를 포함하지 않는다). */
  | { status: 'mismatch'; pickedDirectory: string | null };

/**
 * 시스템 폴더 선택기를 grantDirectoryFor(directory) 위치에서 열어 권한을 받는다. 고른 폴더가 directory를 포함하면
 * granted. 선택기에서 사용자가 아무 폴더나 고를 수 있으므로 결과를 반드시 확인한다.
 */
export async function requestFolderAccess(directory: string): Promise<FolderAccessResult> {
  const native = requireNative();
  const grantDir = grantDirectoryFor(directory);
  const initialDocId = grantDir ? directoryToDocId(grantDir) : null;
  if (!initialDocId) return { status: 'mismatch', pickedDirectory: null };
  const picked = await native.pickTree(initialDocId);
  if (picked === null) return { status: 'cancelled' };
  const grant = findCoveringGrant([picked], directory);
  return grant ? { status: 'granted', grant } : { status: 'mismatch', pickedDirectory: docIdToDirectory(picked) };
}

/** sources(MediaStore content URI = 에셋 id)를 받은 권한으로 대상 폴더에 복사한다. 항목별 결과를 돌려준다. */
export async function copyToFolder(grant: CoveringGrant, sources: readonly string[]): Promise<CopyResult[]> {
  return requireNative().copyToTree(grant.treeDocId, grant.destinationDocId, [...sources]);
}
