/**
 * 미디어 폴더(DCIM/Pictures/Movies) 밖으로 옮기는 경로(SAF — 시스템 폴더 선택기로 받은 폴더 권한)의 순수 로직.
 * MediaStore가 `Primary directory X not allowed`로 거부하는 폴더에만 쓴다.
 *
 * 경로는 디코딩된 절대 경로(`/storage/emulated/0/_MyData/Photo`), 문서 id는 외부 저장소 provider 형식
 * (`primary:_MyData/Photo`)이다. 내장 저장소(primary)만 다룬다 — SD 카드 등은 null로 막는다.
 */

/** 파일 URI(`file:///...`) 또는 절대 경로를 디코딩된 절대 경로로. content:// 등은 null. */
function uriToFilePath(uri: string): string | null {
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

const PRIMARY_ROOT = /^(\/storage\/emulated\/0|\/sdcard)(?=\/|$)/;

function primaryRelativeSegments(directory: string): { root: string; segments: string[] } | null {
  const match = PRIMARY_ROOT.exec(directory);
  if (!match) return null;
  const segments = directory
    .slice(match[1].length)
    .split('/')
    .filter((segment) => segment.length > 0);
  return { root: match[1], segments };
}

/** 폴더 절대 경로 → SAF 문서 id(`primary:<상대 경로>`). 내장 저장소가 아니면 null. */
export function directoryToDocId(directory: string): string | null {
  const parsed = primaryRelativeSegments(directory);
  return parsed ? `primary:${parsed.segments.join('/')}` : null;
}

/** SAF 문서 id → 폴더 절대 경로. 내장 저장소가 아니면 null. */
export function docIdToDirectory(docId: string): string | null {
  const separator = docId.indexOf(':');
  if (separator < 0 || docId.slice(0, separator) !== 'primary') return null;
  const relative = docId.slice(separator + 1).replace(/^\/+|\/+$/g, '');
  return relative ? `/storage/emulated/0/${relative}` : '/storage/emulated/0';
}

/**
 * directory에 쓰려면 폴더 선택기에서 어느 폴더를 골라 달라고 할지. 한 번 허용하면 그 아래 전체에 권한이 남도록
 * 최상위 폴더를 고른다(예: `_MyData/Photo` → `_MyData`). Android 11+ 선택기는 저장소 루트·`Download` 루트·
 * `Android/data`·`Android/obb`를 고를 수 없으므로 `Download`·`Android` 아래는 한 단계 더 내려간 폴더를 쓰고,
 * 그래도 고를 수 있는 폴더가 없으면(루트 자체, `Download` 바로 아래 파일 등) null.
 */
export function grantDirectoryFor(directory: string): string | null {
  const parsed = primaryRelativeSegments(directory);
  if (!parsed || parsed.segments.length === 0) return null;
  const [first, second] = parsed.segments;
  const top = first.toLowerCase();
  if (top === 'download' || top === 'android') {
    if (second === undefined) return null;
    if (top === 'android' && ['data', 'obb'].includes(second.toLowerCase())) return null;
    return `${parsed.root}/${first}/${second}`;
  }
  return `${parsed.root}/${first}`;
}

/** 미디어 폴더 밖 위치로 옮기는 것이 가능한 폴더인가(폴더 선택기로 권한을 받을 수 있으면 true). */
export function isDirectMoveDestinationAllowed(directory: string): boolean {
  return grantDirectoryFor(directory) !== null;
}

function normalize(directory: string): string {
  const parsed = primaryRelativeSegments(directory);
  return parsed ? ['/storage/emulated/0', ...parsed.segments].join('/').toLowerCase() : directory.toLowerCase();
}

function covers(grantedDir: string, directory: string): boolean {
  const base = normalize(grantedDir);
  const target = normalize(directory);
  return target === base || target.startsWith(`${base}/`);
}

export interface CoveringGrant {
  /** 권한을 받은 폴더의 문서 id(네이티브가 준 그대로 — 대소문자 포함). */
  treeDocId: string;
  /** 그 권한 아래에서 대상 폴더를 가리키는 문서 id(권한 폴더 부분은 treeDocId 표기를 따른다). */
  destinationDocId: string;
}

/**
 * 권한을 받은 폴더들(문서 id) 중 directory를 포함하는(같거나 상위인) 것과, 그 아래 대상 폴더의 문서 id. 없으면 null.
 * 외부 저장소는 대소문자를 구분하지 않으므로 포함 여부도 구분하지 않고 판정한다.
 */
export function findCoveringGrant(treeDocIds: readonly string[], directory: string): CoveringGrant | null {
  const target = primaryRelativeSegments(directory);
  if (!target) return null;
  for (const treeDocId of treeDocIds) {
    const grantedDir = docIdToDirectory(treeDocId);
    if (!grantedDir || !covers(grantedDir, directory)) continue;
    const grantedDepth = (primaryRelativeSegments(grantedDir) as { segments: string[] }).segments.length;
    const rest = target.segments.slice(grantedDepth);
    const base = treeDocId.replace(/\/+$/, '');
    return { treeDocId, destinationDocId: rest.length > 0 ? `${base}/${rest.join('/')}` : base };
  }
  return null;
}
