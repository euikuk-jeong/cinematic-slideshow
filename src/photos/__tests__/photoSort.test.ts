import { chunkItems, comparePhotos, groupPhotosByDate, type DateSectionLabelFormatter, type PhotoMetadata, sortPhotos } from '../photoSort';

function photo(id: string, filename: string | null, creationTime: number | null): PhotoMetadata {
  return { id, filename, creationTime };
}

const koFormatter: DateSectionLabelFormatter = {
  unknownDate: '날짜 없음',
  formatDate: (year, month, day) => `${year}년 ${month}월 ${day}일`,
};

describe('comparePhotos / sortPhotos', () => {
  const items: PhotoMetadata[] = [
    photo('c', 'banana.jpg', 300),
    photo('a', 'apple.jpg', 100),
    photo('b', 'cherry.jpg', 200),
  ];

  it('sorts by filename ascending', () => {
    expect(sortPhotos(items, 'filename', 'asc').map((p) => p.id)).toEqual(['a', 'c', 'b']);
  });

  it('sorts by filename descending', () => {
    expect(sortPhotos(items, 'filename', 'desc').map((p) => p.id)).toEqual(['b', 'c', 'a']);
  });

  it('sorts by creation_time ascending', () => {
    expect(sortPhotos(items, 'creation_time', 'asc').map((p) => p.id)).toEqual(['a', 'b', 'c']);
  });

  it('sorts by creation_time descending', () => {
    expect(sortPhotos(items, 'creation_time', 'desc').map((p) => p.id)).toEqual(['c', 'b', 'a']);
  });

  it('sorts korean filenames using locale-aware comparison', () => {
    const korean = [photo('1', '나.jpg', 1), photo('2', '가.jpg', 2), photo('3', '다.jpg', 3)];
    expect(sortPhotos(korean, 'filename', 'asc').map((p) => p.id)).toEqual(['2', '1', '3']);
  });

  it('always sorts null filename to the end regardless of direction', () => {
    const withNull = [photo('a', 'apple.jpg', 1), photo('n', null, 2), photo('b', 'banana.jpg', 3)];
    expect(sortPhotos(withNull, 'filename', 'asc').map((p) => p.id)).toEqual(['a', 'b', 'n']);
    expect(sortPhotos(withNull, 'filename', 'desc').map((p) => p.id)).toEqual(['b', 'a', 'n']);
  });

  it('always sorts null creation_time to the end regardless of direction', () => {
    const withNull = [photo('a', 'a.jpg', 100), photo('n', 'n.jpg', null), photo('b', 'b.jpg', 200)];
    expect(sortPhotos(withNull, 'creation_time', 'asc').map((p) => p.id)).toEqual(['a', 'b', 'n']);
    expect(sortPhotos(withNull, 'creation_time', 'desc').map((p) => p.id)).toEqual(['b', 'a', 'n']);
  });

  it('treats two null values as equal (stable no-op)', () => {
    const a = photo('a', null, null);
    const b = photo('b', null, null);
    expect(comparePhotos(a, b, 'filename', 'asc')).toBe(0);
    expect(comparePhotos(a, b, 'creation_time', 'asc')).toBe(0);
  });

  it('does not mutate the input array', () => {
    const copy = [...items];
    sortPhotos(items, 'filename', 'asc');
    expect(items).toEqual(copy);
  });
});

describe('groupPhotosByDate', () => {
  const d1 = new Date(2026, 7, 30, 10, 0).getTime(); // 2026-08-30
  const d2 = new Date(2026, 7, 30, 22, 0).getTime(); // same day, later
  const d3 = new Date(2026, 7, 29, 9, 0).getTime(); // 2026-08-29

  it('groups items into the same section when they fall on the same local day', () => {
    const items = [photo('a', 'a.jpg', d1), photo('b', 'b.jpg', d2)];
    const sections = groupPhotosByDate(items, koFormatter);
    expect(sections).toHaveLength(1);
    expect(sections[0].items.map((p) => p.id)).toEqual(['a', 'b']);
  });

  it('orders date sections newest first', () => {
    const items = [photo('old', 'old.jpg', d3), photo('new', 'new.jpg', d1)];
    const sections = groupPhotosByDate(items, koFormatter);
    expect(sections.map((s) => s.items[0].id)).toEqual(['new', 'old']);
  });

  it('puts items with no creation time in a trailing "날짜 없음" section', () => {
    const items = [photo('known', 'k.jpg', d1), photo('unknown', 'u.jpg', null)];
    const sections = groupPhotosByDate(items, koFormatter);
    expect(sections[sections.length - 1].label).toBe('날짜 없음');
    expect(sections[sections.length - 1].items.map((p) => p.id)).toEqual(['unknown']);
  });

  it('preserves the input order of items within a section', () => {
    const items = [photo('z', 'z.jpg', d1), photo('a', 'a.jpg', d1)];
    const sections = groupPhotosByDate(items, koFormatter);
    expect(sections[0].items.map((p) => p.id)).toEqual(['z', 'a']);
  });

  it('formats the section label as a Korean date', () => {
    const sections = groupPhotosByDate([photo('a', 'a.jpg', d1)], koFormatter);
    expect(sections[0].label).toBe('2026년 8월 30일');
  });
});

describe('chunkItems', () => {
  it('splits into chunks of the given size', () => {
    expect(chunkItems([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('returns an empty array for empty input', () => {
    expect(chunkItems([], 3)).toEqual([]);
  });

  it('returns one chunk when size exceeds item count', () => {
    expect(chunkItems([1, 2], 10)).toEqual([[1, 2]]);
  });
});

describe('natural (numeric) filename sort', () => {
  it('orders img2 before img10 ascending', () => {
    const items = [photo('10', 'img10.jpg', 1), photo('2', 'img2.jpg', 2), photo('1', 'img1.jpg', 3)];
    expect(sortPhotos(items, 'filename', 'asc').map((p) => p.id)).toEqual(['1', '2', '10']);
  });

  it('reverses the order descending', () => {
    const items = [photo('10', 'img10.jpg', 1), photo('2', 'img2.jpg', 2), photo('1', 'img1.jpg', 3)];
    expect(sortPhotos(items, 'filename', 'desc').map((p) => p.id)).toEqual(['10', '2', '1']);
  });

  it('applies to korean filenames with numbers', () => {
    const items = [photo('a', '사진10', 1), photo('b', '사진2', 2), photo('c', '사진1', 3)];
    expect(sortPhotos(items, 'filename', 'asc').map((p) => p.id)).toEqual(['c', 'b', 'a']);
  });
});

describe('generic item types', () => {
  interface MediaItem extends PhotoMetadata {
    mediaType: 'image' | 'video';
  }

  it('sortPhotos keeps the extended item type and mixes media types by time', () => {
    const items: MediaItem[] = [
      { id: 'v', filename: 'v.mp4', creationTime: 200, mediaType: 'video' },
      { id: 'i', filename: 'i.jpg', creationTime: 300, mediaType: 'image' },
    ];
    const sorted = sortPhotos(items, 'creation_time', 'desc');
    expect(sorted.map((m) => m.mediaType)).toEqual(['image', 'video']);
  });

  it('groupPhotosByDate puts a photo and video of the same day in one section', () => {
    const day = new Date(2026, 9, 1, 12, 0, 0).getTime();
    const items: MediaItem[] = [
      { id: 'i', filename: 'i.jpg', creationTime: day, mediaType: 'image' },
      { id: 'v', filename: 'v.mp4', creationTime: day + 1000, mediaType: 'video' },
    ];
    const sections = groupPhotosByDate(items, koFormatter);
    expect(sections).toHaveLength(1);
    expect(sections[0].items.map((m) => m.id)).toEqual(['i', 'v']);
  });

  it('groups items on either side of local midnight into different sections', () => {
    const before = new Date(2026, 9, 1, 23, 59, 59).getTime();
    const after = new Date(2026, 9, 2, 0, 0, 0).getTime();
    const sections = groupPhotosByDate([photo('a', 'a', before), photo('b', 'b', after)], koFormatter);
    expect(sections.map((sec) => sec.key)).toEqual(['2026-10-02', '2026-10-01']);
  });
});
