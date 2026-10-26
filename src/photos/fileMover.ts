import { requireOptionalNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

import { supportsFileManagement } from './gallerySelection';

export interface TransferResult {
  source: string;
  destination: string | null;
  ok: boolean;
  error: string | null;
}

interface NativeFileMover {
  isAllFilesAccessDeclared(): boolean;
  isAllFilesAccessGranted(): boolean;
  openAllFilesAccessSettings(): void;
  transferFiles(sources: string[], destinationDir: string, move: boolean): Promise<TransferResult[]>;
}

// 로컬 네이티브 모듈(modules/file-mover). import 시점이 아니라 호출 시점에 찾는다 — Jest·iOS·모듈이 없는
// 빌드(예: 오래된 개발 클라이언트)에서도 이 파일을 import만으로는 터지지 않게 한다.
function nativeModule(): NativeFileMover | null {
  return requireOptionalNativeModule<NativeFileMover>('FileMover');
}

/**
 * 파일 직접 이동을 쓸 수 있는 환경인가: Android 11+, 네이티브 모듈이 들어 있는 빌드, 그리고 매니페스트에
 * 모든 파일 접근이 선언된 빌드. 마지막 조건 덕분에 Play 심사용 빌드에서 app.json의 권한 선언만 빼면
 * 직접 이동 UI가 함께 꺼진다(선언 없이 "허용하기"로 안내하면 설정에 항목이 없어 막다른 길이 된다).
 */
export function isDirectMoveSupported(): boolean {
  if (!supportsFileManagement(Platform.OS, Platform.Version)) return false;
  return nativeModule()?.isAllFilesAccessDeclared() ?? false;
}

export function isAllFilesAccessGranted(): boolean {
  return nativeModule()?.isAllFilesAccessGranted() ?? false;
}

export function openAllFilesAccessSettings(): void {
  nativeModule()?.openAllFilesAccessSettings();
}

/** 파일을 destinationDir로 옮기거나(move=true) 복사한다. 항목별 성공 여부를 돌려준다. */
export async function transferFiles(
  sources: readonly string[],
  destinationDir: string,
  move: boolean
): Promise<TransferResult[]> {
  const native = nativeModule();
  if (!native) throw new Error('File mover is not available in this build');
  return native.transferFiles([...sources], destinationDir, move);
}
