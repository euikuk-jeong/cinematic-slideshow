import { buildPlaybackSequence, nextPlaybackIndex, prevPlaybackIndex } from '../playback';
import type { PhotoMetadata } from '../../photos/photoSort';

const photos: PhotoMetadata[] = [
  { id: 'p3', filename: 'c.jpg', creationTime: 300 },
  { id: 'p1', filename: 'a.jpg', creationTime: 100 },
  { id: 'p2', filename: 'b.jpg', creationTime: 200 },
];

describe('buildPlaybackSequence', () => {
  test('선택이 없으면 전체 사진을 촬영시간 오름차순으로 반환한다', () => {
    const result = buildPlaybackSequence(photos, new Set(), 'sequential', 'creation_time', 'asc');
    expect(result.map((p) => p.id)).toEqual(['p1', 'p2', 'p3']);
  });

  test('선택된 사진이 있으면 그것만 촬영시간 오름차순으로 반환한다', () => {
    const result = buildPlaybackSequence(photos, new Set(['p3', 'p1']), 'sequential', 'creation_time', 'asc');
    expect(result.map((p) => p.id)).toEqual(['p1', 'p3']);
  });

  test('랜덤 모드는 필터링된 결과를 shuffle 함수에 넘기고 그 결과를 그대로 반환한다', () => {
    const shuffle = jest.fn((items: readonly PhotoMetadata[]) => [...items].reverse());
    const result = buildPlaybackSequence(photos, new Set(), 'random', 'creation_time', 'asc', shuffle);
    expect(shuffle).toHaveBeenCalledWith([photos[1], photos[2], photos[0]]); // p1,p2,p3 정렬 후
    expect(result.map((p) => p.id)).toEqual(['p3', 'p2', 'p1']);
  });

  test('사진이 없으면 빈 배열을 반환한다', () => {
    expect(buildPlaybackSequence([], new Set(), 'sequential', 'creation_time', 'asc')).toEqual([]);
  });

  test('sortCriterion/sortDirection을 지정하면 그 기준으로 정렬한다(파일명 내림차순)', () => {
    const result = buildPlaybackSequence(photos, new Set(), 'sequential', 'filename', 'desc');
    expect(result.map((p) => p.id)).toEqual(['p3', 'p2', 'p1']);
  });
});

describe('nextPlaybackIndex', () => {
  test('마지막이 아니면 다음 index를 반환한다', () => {
    expect(nextPlaybackIndex(0, 3, 'loop')).toBe(1);
  });

  test('마지막이고 loop면 0으로 돌아간다', () => {
    expect(nextPlaybackIndex(2, 3, 'loop')).toBe(0);
  });

  test('마지막이고 once면 null(재생 종료)을 반환한다', () => {
    expect(nextPlaybackIndex(2, 3, 'once')).toBeNull();
  });

  test('길이가 0이면 null을 반환한다', () => {
    expect(nextPlaybackIndex(0, 0, 'loop')).toBeNull();
  });
});

describe('prevPlaybackIndex', () => {
  test('처음이 아니면 이전 index를 반환한다', () => {
    expect(prevPlaybackIndex(1, 3, 'loop')).toBe(0);
  });

  test('처음이고 loop면 마지막 index로 돌아간다', () => {
    expect(prevPlaybackIndex(0, 3, 'loop')).toBe(2);
  });

  test('처음이고 once면 null(더 이상 이동 불가)을 반환한다', () => {
    expect(prevPlaybackIndex(0, 3, 'once')).toBeNull();
  });

  test('길이가 0이면 null을 반환한다', () => {
    expect(prevPlaybackIndex(0, 0, 'loop')).toBeNull();
  });
});
