import { File, Paths } from 'expo-file-system';

// ID3v2 태그(제목/가수/커버)는 보통 파일 앞부분에 있다 — 실측(번들 mp3, 3.7MB 파일)으로
// 200KB만 읽어도 커버까지 온전히 나오는 것 확인함. 512KB로 여유를 둔다. 파일 전체를
// 읽지 않는 이유는 브라우징 중인 수백 개 파일마다 전체를 읽으면 느려지기 때문.
const TAG_READ_CHUNK_BYTES = 512 * 1024;

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
