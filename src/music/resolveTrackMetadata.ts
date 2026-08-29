import { readAudioTagChunk, writeCoverCacheFile } from './audioFileAccess';
import { parseAudioTags } from './tagReader';

export interface ResolvedTrackMetadata {
  title: string | null;
  artist: string | null;
  coverUri: string | null;
}

/**
 * 기기 오디오 파일(uri)에서 ID3 태그를 읽어 제목/가수/커버를 얻는다. 실패(태그 없음,
 * 지원하지 않는 포맷, 파일 접근 실패 등) 시 null — 호출 측은 파일명 폴백으로 넘어가면 된다.
 * 번들 음악은 이미 title/artist가 코드에 있어 이 함수를 타지 않는다.
 */
export async function resolveDeviceTrackMetadata(
  assetId: string,
  uri: string
): Promise<ResolvedTrackMetadata | null> {
  const bytes = await readAudioTagChunk(uri);
  if (!bytes) return null;
  const tags = await parseAudioTags(bytes);
  if (!tags) return null;
  const coverUri = tags.picture ? await writeCoverCacheFile('device', assetId, tags.picture) : null;
  return { title: tags.title, artist: tags.artist, coverUri };
}
