import {
  albumCapturedAt,
  albumDateBasis,
  groupAlbumsByMonth,
  isAlbumSortCriterion,
  isAlbumSortDirection,
  sortAlbums,
  type AlbumMonthFormatter,
  type SortableAlbum,
} from '../albumList';

const formatter: AlbumMonthFormatter = {
  unknownDate: '날짜 없음',
  formatMonth: (y, m) => `${y}-${m}`,
};

const at = (month: number, day = 15) => new Date(2026, month - 1, day, 12).getTime();

function album(
  id: string,
  extra: Partial<SortableAlbum> = {}
): SortableAlbum {
  return { id, title: id, folderPath: `/p/${id}`, modifiedAt: null, ...extra };
}

describe('albumCapturedAt', () => {
  test('촬영일시가 있으면 그 값', () => {
    expect(albumCapturedAt(album('a', { capturedAt: 5, modifiedAt: 9 }))).toBe(5);
  });
  test('촬영일시가 없으면(null) 수정시각으로 대체', () => {
    expect(albumCapturedAt(album('a', { capturedAt: null, modifiedAt: 9 }))).toBe(9);
  });
  test('구버전 캐시처럼 capturedAt 필드 자체가 없어도 수정시각으로 대체', () => {
    expect(albumCapturedAt(album('a', { modifiedAt: 9 }))).toBe(9);
  });
  test('둘 다 없으면 null', () => {
    expect(albumCapturedAt(album('a'))).toBeNull();
  });
});

describe('sortAlbums', () => {
  const albums = [
    album('b', { modifiedAt: 20, capturedAt: 200 }),
    album('a', { modifiedAt: 30, capturedAt: 100 }),
    album('c', { modifiedAt: 10, capturedAt: 300 }),
  ];
  const ids = (list: readonly SortableAlbum[]) => list.map((a) => a.id);

  test('system은 입력 순서 그대로(방향 무관)', () => {
    expect(ids(sortAlbums(albums, 'system', 'desc', null))).toEqual(['b', 'a', 'c']);
  });
  test('title', () => {
    expect(ids(sortAlbums(albums, 'title', 'asc', null))).toEqual(['a', 'b', 'c']);
    expect(ids(sortAlbums(albums, 'title', 'desc', null))).toEqual(['c', 'b', 'a']);
  });
  test('modified와 captured는 서로 다른 값으로 정렬', () => {
    expect(ids(sortAlbums(albums, 'modified', 'desc', null))).toEqual(['a', 'b', 'c']);
    expect(ids(sortAlbums(albums, 'captured', 'desc', null))).toEqual(['c', 'b', 'a']);
    expect(ids(sortAlbums(albums, 'captured', 'asc', null))).toEqual(['a', 'b', 'c']);
  });
  test('captured는 촬영일시가 없는 앨범을 수정시각으로 대체해 비교', () => {
    const mixed = [album('x', { modifiedAt: 500, capturedAt: null }), album('y', { modifiedAt: 1, capturedAt: 400 })];
    expect(ids(sortAlbums(mixed, 'captured', 'desc', null))).toEqual(['x', 'y']);
  });
  test('날짜 값이 전혀 없는 앨범은 방향과 무관하게 맨 뒤', () => {
    const withNull = [album('n'), album('a', { modifiedAt: 1 }), album('b', { modifiedAt: 2 })];
    for (const dir of ['asc', 'desc'] as const) {
      expect(sortAlbums(withNull, 'modified', dir, null).at(-1)?.id).toBe('n');
      expect(sortAlbums(withNull, 'captured', dir, null).at(-1)?.id).toBe('n');
    }
  });
  test('photo_count: 개수가 아직 없으면 입력 순서 유지, 있으면 그 값으로', () => {
    expect(ids(sortAlbums(albums, 'photo_count', 'asc', null))).toEqual(['b', 'a', 'c']);
    expect(ids(sortAlbums(albums, 'photo_count', 'desc', { a: 1, b: 5, c: 3 }))).toEqual(['b', 'c', 'a']);
  });
  test('입력 배열을 변경하지 않는다', () => {
    const copy = [...albums];
    sortAlbums(albums, 'title', 'asc', null);
    expect(albums).toEqual(copy);
  });
});

describe('albumDateBasis', () => {
  test('captured일 때만 촬영일, 나머지는 수정일', () => {
    expect(albumDateBasis('captured')).toBe('captured');
    for (const c of ['system', 'title', 'path', 'photo_count', 'modified'] as const) {
      expect(albumDateBasis(c)).toBe('modified');
    }
  });
});

describe('groupAlbumsByMonth', () => {
  const albums = [
    album('oct1', { modifiedAt: at(10, 3), capturedAt: at(8, 1) }),
    album('oct2', { modifiedAt: at(10, 20), capturedAt: at(9, 2) }),
    album('sep', { modifiedAt: at(9, 5), capturedAt: null }),
    album('none'),
  ];
  const sections = (basis: 'modified' | 'captured') =>
    groupAlbumsByMonth(albums, basis, formatter).map((s) => [s.label, s.items.map((a) => a.id)]);

  test('수정일 기준: 최신 월이 먼저, 알 수 없는 앨범은 맨 뒤, 섹션 안은 입력 순서 보존', () => {
    expect(sections('modified')).toEqual([
      ['2026-10', ['oct1', 'oct2']],
      ['2026-9', ['sep']],
      ['날짜 없음', ['none']],
    ]);
  });
  test('촬영일 기준: 촬영일시가 없는 앨범은 수정시각으로 묶는다', () => {
    expect(sections('captured')).toEqual([
      ['2026-9', ['oct2', 'sep']],
      ['2026-8', ['oct1']],
      ['날짜 없음', ['none']],
    ]);
  });
  test('빈 목록은 섹션 없음', () => {
    expect(groupAlbumsByMonth([], 'modified', formatter)).toEqual([]);
  });
});

describe('type guards', () => {
  test('isAlbumSortCriterion은 captured를 포함한 6종만 허용', () => {
    for (const c of ['system', 'title', 'path', 'photo_count', 'modified', 'captured']) {
      expect(isAlbumSortCriterion(c)).toBe(true);
    }
    expect(isAlbumSortCriterion('x')).toBe(false);
    expect(isAlbumSortCriterion(null)).toBe(false);
  });
  test('isAlbumSortDirection', () => {
    expect(isAlbumSortDirection('asc')).toBe(true);
    expect(isAlbumSortDirection('desc')).toBe(true);
    expect(isAlbumSortDirection('up')).toBe(false);
  });
});
