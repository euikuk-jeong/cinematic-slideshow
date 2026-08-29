import { parseBuffer } from 'music-metadata';

export interface AudioTagPicture {
  data: Uint8Array;
  format: string;
}

export interface AudioTags {
  title: string | null;
  artist: string | null;
  picture: AudioTagPicture | null;
}

/**
 * mp3 등 오디오 파일의 바이트(전체 또는 앞부분 일부)에서 ID3 태그를 읽는다. 파일 전체가
 * 아니라 앞부분만 넘어오면(커버 아트가 매우 크거나 태그가 파일 뒷부분에 있는 드문 경우)
 * 파싱이 실패할 수 있는데, 그 경우 태그가 없는 것과 동일하게 null을 반환해 호출 측이
 * 파일명 폴백으로 넘어가게 한다.
 */
export async function parseAudioTags(bytes: Uint8Array, mimeType?: string): Promise<AudioTags | null> {
  try {
    const metadata = await parseBuffer(bytes, mimeType);
    const picture = metadata.common.picture?.[0];
    return {
      title: metadata.common.title ?? null,
      artist: metadata.common.artist ?? null,
      picture: picture ? { data: picture.data, format: picture.format } : null,
    };
  } catch {
    return null;
  }
}
