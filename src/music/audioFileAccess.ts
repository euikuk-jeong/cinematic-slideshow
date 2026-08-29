import { File, Paths } from 'expo-file-system';

import { getFolderPath } from '../settings/folderTree';

// ID3v2 태그(제목/가수/커버)는 보통 파일 앞부분에 있다 — 실측(번들 mp3, 3.7MB 파일)으로
// 200KB만 읽어도 커버까지 온전히 나오는 것 확인함. 다만 FLAC은 메타데이터 블록이 순차
// 나열이라 커버(PICTURE 블록)가 뒤쪽에, 그것도 mp3보다 훨씬 큰 비압축 이미지로 오는 일이
// 흔해 512KB로는 부족한 사례가 실기기에서 나왔다 — 2MB로 올리고, 그래도 실패하면
// resolveTrackMetadata에서 전체 파일 읽기로 한 번 더 시도한다.
const TAG_READ_CHUNK_BYTES = 2 * 1024 * 1024;

/**
 * asset.getUri()가 주는 file:// URI에서 앞부분 바이트만 읽는다. expo-file-system(네이티브
 * 모듈) 경계라 Jest 대상 아님 — 실기기로만 검증 가능(doc/todo/todo.md 참고).
 */
export async function readAudioTagChunk(uri: string): Promise<Uint8Array | null> {
  try {
    const buffer = await new File(uri).slice(0, TAG_READ_CHUNK_BYTES).arrayBuffer();
    return new Uint8Array(buffer);
  } catch {
    return null;
  }
}

/**
 * 부분 읽기로 태그 파싱이 실패했을 때(주로 FLAC처럼 메타데이터가 앞부분에 다 안 들어간
 * 경우)의 폴백 — 파일 전체를 읽는다. 브라우징 중 매 파일마다 도는 게 아니라 실패한
 * 파일에서만, 그것도 한 번씩만 타므로 배치 조회의 성능 문제와는 무관하다.
 */
export async function readFullAudioFile(uri: string): Promise<Uint8Array | null> {
  try {
    const buffer = await new File(uri).arrayBuffer();
    return new Uint8Array(buffer);
  } catch {
    return null;
  }
}

function sanitizeForFilename(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_');
}

const COVER_EXTENSION_BY_FORMAT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

/**
 * 커버 이미지를 캐시 디렉토리에 파일로 저장하고 file:// 경로를 돌려준다. DB에는 이 경로만
 * 저장한다 — base64로 원본 바이트를 직접 저장하면 DB가 불필요하게 커진다. OS가 저장공간
 * 부족 시 캐시 디렉토리를 비울 수 있으므로, 이 경로를 쓰는 쪽은 파일이 없을 수 있다는
 * 전제로 렌더링해야 한다(placeholder 폴백).
 */
export async function writeCoverCacheFile(
  sourceType: string,
  sourceValue: string,
  picture: { data: Uint8Array; format: string }
): Promise<string | null> {
  try {
    const extension = COVER_EXTENSION_BY_FORMAT[picture.format] ?? 'jpg';
    const filename = `${sourceType}-${sanitizeForFilename(sourceValue)}.${extension}`;
    const file = new File(Paths.cache, 'covers', filename);
    file.create({ intermediates: true, overwrite: true });
    file.write(picture.data);
    return file.uri;
  } catch {
    return null;
  }
}

// 무손실 음원(특히 FLAC)은 트랙마다 커버를 임베드하지 않고, 앨범 폴더에 별도 이미지
// 파일(cover.jpg 등)을 같이 두는 배포 관행이 흔하다(실기기에서 사용자가 직접 확인함).
// 임베디드 커버가 없을 때 같은 폴더에서 이 파일들을 찾아본다 — 이미 실제 파일이라
// writeCoverCacheFile처럼 복사할 필요 없이 경로를 그대로 쓴다.
const SIBLING_COVER_FILENAMES = [
  'cover.jpg',
  'Cover.jpg',
  'cover.jpeg',
  'Cover.jpeg',
  'cover.png',
  'Cover.png',
  'folder.jpg',
  'Folder.jpg',
  'folder.png',
  'Folder.png',
];

export function findSiblingCoverUri(uri: string): string | null {
  const folderPath = getFolderPath(uri);
  if (!folderPath) return null;
  for (const filename of SIBLING_COVER_FILENAMES) {
    try {
      const candidate = new File(`${folderPath}/${filename}`);
      if (candidate.exists) return candidate.uri;
    } catch {
      continue;
    }
  }
  return null;
}
