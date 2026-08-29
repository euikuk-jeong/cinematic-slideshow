// music-metadata의 실제 파서(parseBuffer)는 포맷별 파서를 동적 import()로 지연 로드하는데,
// Jest의 VM 모듈 러너는 --experimental-vm-modules 없이는 동적 import를 실행할 수 없어
// 실제 오디오 바이트로 호출하면 항상 ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING_FLAG로 죽는다.
// 그래서 parseBuffer 자체는 mock으로 대체하고, tagReader가 그 결과를 우리 타입으로
// 매핑/방어(예외 스와핑)하는 로직만 검증한다 — 실제 태그 추출 정확도는 실기기로만 확인 가능
// (doc/todo/todo.md 참고).
const mockParseBuffer = jest.fn();
jest.mock('music-metadata', () => ({
  parseBuffer: (...args: unknown[]) => mockParseBuffer(...args),
}));

import { parseAudioTags } from '../tagReader';

beforeEach(() => {
  mockParseBuffer.mockReset();
});

test('common.title/artist/picture를 우리 타입으로 매핑한다', async () => {
  mockParseBuffer.mockResolvedValue({
    common: {
      title: 'Calm Piano',
      artist: 'Alex Morgan',
      picture: [{ format: 'image/jpeg', data: new Uint8Array([1, 2, 3]) }],
    },
  });

  const tags = await parseAudioTags(new Uint8Array([0]), 'audio/mpeg');

  expect(tags).toEqual({
    title: 'Calm Piano',
    artist: 'Alex Morgan',
    picture: { format: 'image/jpeg', data: new Uint8Array([1, 2, 3]) },
  });
});

test('picture가 없으면 picture는 null이다', async () => {
  mockParseBuffer.mockResolvedValue({ common: { title: 'Song', artist: 'Someone', picture: undefined } });

  const tags = await parseAudioTags(new Uint8Array([0]));

  expect(tags!.picture).toBeNull();
});

test('title/artist가 없으면 각각 null이다', async () => {
  mockParseBuffer.mockResolvedValue({ common: {} });

  const tags = await parseAudioTags(new Uint8Array([0]));

  expect(tags).toEqual({ title: null, artist: null, picture: null });
});

test('파싱이 실패하면(태그 없음/지원하지 않는 포맷 등) 예외를 던지지 않고 null을 반환한다', async () => {
  mockParseBuffer.mockRejectedValue(new Error('unsupported'));

  const tags = await parseAudioTags(new Uint8Array([1, 2, 3]));

  expect(tags).toBeNull();
});
