import { findSiblingCoverUri, readAudioTagChunk, readFullAudioFile, writeCoverCacheFile } from './audioFileAccess';
import { parseAudioTags } from './tagReader';

export interface ResolvedTrackMetadata {
  title: string | null;
  artist: string | null;
  coverUri: string | null;
}

/**
 * 기기 오디오 파일(uri)에서 ID3/FLAC 태그를 읽어 제목/가수/커버를 얻는다. 실패(태그 없음,
 * 지원하지 않는 포맷, 파일 접근 실패 등) 시 null — 호출 측은 파일명 폴백으로 넘어가면 된다.
 * 번들 음악은 이미 title/artist가 코드에 있어 이 함수를 타지 않는다.
 */
// music-metadata에 filename 힌트를 안 주면 파일 내용만으로 포맷을 추측하는데, 그 추측된
// mimeType을 파서에 매칭하는 내부 경로(content-type/media-typer 패키지 경유)가 실기기
// (Hermes)에서 항상 실패하는 것을 확인함(tagReader.ts 상단 주석 참고) — 확장자 기반 조회를
// 쓰도록 항상 filename을 넘긴다. URI 마지막 세그먼트가 파일명(percent-encoding돼 있어도
// 확장자는 ASCII라 디코딩 없이도 그대로 인식됨).
function extractFilename(uri: string): string {
  const lastSlash = uri.lastIndexOf('/');
  return lastSlash === -1 ? uri : uri.slice(lastSlash + 1);
}

export async function resolveDeviceTrackMetadata(
  assetId: string,
  uri: string
): Promise<ResolvedTrackMetadata | null> {
  const filename = extractFilename(uri);
  // 커버는 사이드카 파일(cover.jpg 등)로 나오는데 곡명/가수는 계속 파일명으로만 보인다는
  // 실기기 리포트 진단용 — 어느 단계에서 비는지 보려고 남겨둠. 문제 해결되면 정리 예정.
  const chunk = await readAudioTagChunk(uri);
  if (!chunk) console.warn('[resolveTrackMetadata] 부분 읽기 실패(파일 접근 자체가 안 됨)', uri);
  let tags = chunk ? await parseAudioTags(chunk, filename) : null;
  if (!tags) {
    // 부분 읽기 실패 — 태그(특히 FLAC의 PICTURE 블록)가 앞부분에 다 안 들어간 경우일 수
    // 있어 전체 파일로 한 번 더 시도한다(audioFileAccess.ts의 readFullAudioFile 주석 참고).
    const full = await readFullAudioFile(uri);
    if (!full) console.warn('[resolveTrackMetadata] 전체 읽기도 실패(파일 접근 자체가 안 됨)', uri);
    tags = full ? await parseAudioTags(full, filename) : null;
  }
  if (!tags) {
    console.warn('[resolveTrackMetadata] 태그 파싱 완전 실패 — 사이드카 커버만 시도', uri);
    // 태그 자체가 없어도 폴더에 cover.jpg 등이 같이 있는 경우가 있다(실기기에서 확인됨) —
    // 제목/가수는 못 채워도 커버만은 가능할 수 있어 시도해본다.
    const siblingCover = findSiblingCoverUri(uri);
    return siblingCover ? { title: null, artist: null, coverUri: siblingCover } : null;
  }
  console.log('[resolveTrackMetadata] 태그 파싱 성공', uri, { title: tags.title, artist: tags.artist, hasPicture: !!tags.picture });
  const coverUri = tags.picture ? await writeCoverCacheFile('device', assetId, tags.picture) : findSiblingCoverUri(uri);
  return { title: tags.title, artist: tags.artist, coverUri };
}
