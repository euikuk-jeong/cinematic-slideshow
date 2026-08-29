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
 *
 * filename을 넘기면 확장자로 포맷을 찾는다(music-metadata의 findLoaderForExtension).
 * mimeType 문자열이나 힌트 없이 내용만으로 포맷을 추측하게 하면(guessedType 경로) 그
 * 추측된 mimeType을 다시 파서에 매칭하는 내부 로직(content-type/media-typer 패키지 경유)이
 * 실기기(Hermes)에서 깨져 "Guessed MIME-type not supported"로 항상 실패하는 것을
 * 실측으로 확인함(Node에서는 재현 안 됨 — 번들 환경 특정 문제로 보임) — 그래서 항상
 * filename을 넘겨 이 경로를 피한다.
 */
export async function parseAudioTags(bytes: Uint8Array, filename?: string): Promise<AudioTags | null> {
  try {
    const metadata = await parseBuffer(bytes, filename ? { path: filename } : undefined);
    const picture = metadata.common.picture?.[0];
    return {
      title: metadata.common.title ?? null,
      artist: metadata.common.artist ?? null,
      picture: picture ? { data: picture.data, format: picture.format } : null,
    };
  } catch (err) {
    // 실기기에서 "커버는 사이드카 파일로 나오는데 곡명/가수는 계속 파일명"이라는 리포트가
    // 있었다 — 태그가 진짜 없는 건지 파싱 자체가 실패하는 건지 구분이 안 돼서(원래 여기서
    // 예외를 그냥 삼켰음) 원인을 볼 수 있게 남긴다. 문제 해결되면 정리 예정.
    console.warn('[tagReader] parseAudioTags 실패', bytes.length, '바이트,', filename ?? '(filename 없음)', err);
    return null;
  }
}
