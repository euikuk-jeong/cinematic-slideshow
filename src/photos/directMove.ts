/**
 * 모든 파일 접근(MANAGE_EXTERNAL_STORAGE)으로 파일을 직접 옮기는 경로의 순수 로직.
 * MediaStore가 `Primary directory X not allowed`로 거부하는 폴더(DCIM/Pictures/Movies 밖)에만 쓴다.
 */

/** 파일 URI(`file:///...`) 또는 절대 경로를 디코딩된 절대 경로로. content:// 등은 null. */
export function uriToFilePath(uri: string): string | null {
  let path: string;
  if (uri.startsWith('file://')) {
    path = uri.slice('file://'.length);
  } else if (uri.startsWith('/')) {
    path = uri;
  } else {
    return null;
  }
  try {
    return decodeURIComponent(path);
  } catch {
    return null;
  }
}

/** 앨범 캐시의 folderPath(대표 항목의 파일 URI에서 뽑은 폴더 경로)를 디코딩된 폴더 절대 경로로. */
export function folderPathToDirectory(folderPath: string | undefined): string | null {
  if (!folderPath) return null;
  const directory = uriToFilePath(folderPath);
  return directory && directory.length > 1 ? directory.replace(/\/+$/, '') : null;
}

// Android/data·Android/obb는 모든 파일 접근을 허용해도 앱이 쓸 수 없는 OS 보호 영역이다.
const RESTRICTED_APP_DIRECTORY = /\/Android\/(data|obb)(\/|$)/i;

/** 직접 이동이 시도라도 가능한 폴더인가(OS 보호 영역이 아니면 true). */
export function isDirectMoveDestinationAllowed(directory: string): boolean {
  return !RESTRICTED_APP_DIRECTORY.test(directory);
}
