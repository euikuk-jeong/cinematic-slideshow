import { folderPathToDirectory } from '../photos/directMove';

/**
 * 새 폴더를 만들 "위치(상위 폴더)"를 고르는 데 쓰는 순수 로직.
 * 폴더 목록은 파일 시스템을 순회하지 않고(모든 파일 접근 없이도 쓸 수 있게) 앨범 목록이 저장해 둔
 * 앨범 폴더 경로와 그 상위 폴더들, 그리고 표준 미디어 폴더(Pictures/DCIM/Movies)로 만든다.
 */

export const DEFAULT_STORAGE_ROOT = '/storage/emulated/0';

const STORAGE_ROOT = /^(\/storage\/emulated\/\d+|\/sdcard)(?=\/|$)/;
const STANDARD_MEDIA_FOLDERS = ['Pictures', 'DCIM', 'Movies'];
// 라이브러리(MediaStore 경로)가 폴더 이름으로 받아 주는 글자 범위 — folderName.ts와 같다.
const MEDIA_STORE_SAFE_SEGMENT = /^[\p{L}\p{N}_ -]+$/u;

export function storageRootOf(directory: string): string | null {
  const match = STORAGE_ROOT.exec(directory);
  return match ? match[1] : null;
}

/** 앨범 폴더 경로들에서 알려진 폴더 목록(조상 포함, 저장소 루트와 표준 미디어 폴더도 포함)을 만든다. */
export function collectKnownDirectories(folderPaths: ReadonlyArray<string | undefined>): string[] {
  const known = new Set<string>();
  let root = DEFAULT_STORAGE_ROOT;
  for (const folderPath of folderPaths) {
    const directory = folderPathToDirectory(folderPath);
    if (!directory) continue;
    const directoryRoot = storageRootOf(directory);
    if (!directoryRoot) continue;
    root = directoryRoot;
    let current = directory;
    while (current.length > directoryRoot.length) {
      known.add(current);
      current = current.slice(0, current.lastIndexOf('/'));
    }
  }
  known.add(root);
  for (const name of STANDARD_MEDIA_FOLDERS) known.add(`${root}/${name}`);
  return [...known].sort((a, b) => a.localeCompare(b));
}

export function parentDirectory(directory: string): string | null {
  const root = storageRootOf(directory);
  if (!root || directory.length <= root.length) return null;
  return directory.slice(0, directory.lastIndexOf('/'));
}

export function childDirectories(known: readonly string[], parent: string): string[] {
  return known.filter((directory) => parentDirectory(directory) === parent);
}

export function directoryName(directory: string): string {
  return directory.slice(directory.lastIndexOf('/') + 1);
}

/** 화면에 보여줄 경로: 저장소 루트를 떼고 맨 앞 `/`는 둔다(루트 자체는 `/`). */
export function displayPath(directory: string): string {
  const root = storageRootOf(directory);
  const relative = root ? directory.slice(root.length) : directory;
  return relative.length === 0 ? '/' : relative;
}

/** 라이브러리(MediaStore)만으로 만들 수 있는 위치인가: `<root>/Pictures` 아래이고 모든 구간이 허용 글자. */
export function isMediaStoreLocation(directory: string): boolean {
  const root = storageRootOf(directory);
  if (!root) return false;
  const relative = directory.slice(root.length + 1);
  const segments = relative.split('/');
  if (segments[0] !== 'Pictures') return false;
  return segments.every((segment) => MEDIA_STORE_SAFE_SEGMENT.test(segment));
}

export type FolderPlan =
  | { kind: 'mediaStore'; folderName: string }
  | { kind: 'direct'; destinationDir: string };

/**
 * parentDir 아래 name 폴더를 만드는 방법을 정한다. `Pictures` 아래면 권한이 필요 없는 MediaStore 경로
 * (라이브러리 `Album.create`는 `Pictures/<이름>/`에만 만들고, 이름에 `/`를 넣으면 하위 폴더가 된다),
 * 그 밖이면 모든 파일 접근으로 파일을 직접 옮기는 경로.
 */
export function planNewFolder(parentDir: string, name: string): FolderPlan {
  if (isMediaStoreLocation(parentDir)) {
    const root = storageRootOf(parentDir) as string;
    const sub = parentDir.slice(root.length + 1 + 'Pictures'.length + 1);
    return { kind: 'mediaStore', folderName: sub ? `${sub}/${name}` : name };
  }
  return { kind: 'direct', destinationDir: `${parentDir}/${name}` };
}
