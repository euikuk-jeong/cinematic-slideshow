import {
  buildGalleryOrder,
  countImages,
  initialIndex,
  mountedIndices,
  toGalleryItem,
  type GalleryItem,
  type RawAssetMetadata,
} from '../galleryItem';
import { sortPhotos, type DateSectionLabelFormatter } from '../photoSort';

const formatter: DateSectionLabelFormatter = {
  unknownDate: '날짜 없음',
  formatDate: (y, m, d) => `${y}-${m}-${d}`,
};

function item(id: string, creationTime: number | null, filename: string | null = id, mediaKind: 'image' | 'video' = 'image'): GalleryItem {
  return { id, filename, creationTime, mediaKind, width: null, height: null, durationMs: null, modificationTime: null };
}

const day = (d: number, h = 12) => new Date(2026, 9, d, h, 0, 0).getTime();

describe('toGalleryItem', () => {
  const base: RawAssetMetadata = {
    id: 'a', filename: 'a.jpg', mediaType: 'image', width: 10, height: 20, duration: null, creationTime: 5, modificationTime: 6,
  };

  it('maps image metadata', () => {
    expect(toGalleryItem(base)).toEqual({
      id: 'a', filename: 'a.jpg', creationTime: 5, mediaKind: 'image', width: 10, height: 20, durationMs: null, modificationTime: 6,
    });
  });

  it('keeps duration only for videos', () => {
    expect(toGalleryItem({ ...base, mediaType: 'video', duration: 65000 })?.durationMs).toBe(65000);
    expect(toGalleryItem({ ...base, mediaType: 'image', duration: 65000 })?.durationMs).toBeNull();
  });

  it('drops audio and unknown assets', () => {
    expect(toGalleryItem({ ...base, mediaType: 'audio' })).toBeNull();
    expect(toGalleryItem({ ...base, mediaType: 'unknown' })).toBeNull();
  });
});

describe('buildGalleryOrder', () => {
  const items = [item('a', day(1)), item('b', day(1, 15)), item('c', day(2)), item('d', day(3)), item('n', null)];

  it('grid mode equals sortPhotos result', () => {
    const order = buildGalleryOrder(items, 'creation_time', 'desc', 'grid', formatter).map((i) => i.id);
    expect(order).toEqual(sortPhotos(items, 'creation_time', 'desc').map((i) => i.id));
  });

  it('date mode with creation_time desc equals sortPhotos result', () => {
    const order = buildGalleryOrder(items, 'creation_time', 'desc', 'date', formatter).map((i) => i.id);
    expect(order).toEqual(sortPhotos(items, 'creation_time', 'desc').map((i) => i.id));
  });

  it('date mode with creation_time asc follows the displayed section order, not sortPhotos', () => {
    const dateOrder = buildGalleryOrder(items, 'creation_time', 'asc', 'date', formatter).map((i) => i.id);
    const sortedOrder = sortPhotos(items, 'creation_time', 'asc').map((i) => i.id);
    // 섹션은 최신 날짜 먼저, 섹션 안은 오름차순
    expect(dateOrder).toEqual(['d', 'c', 'a', 'b', 'n']);
    expect(dateOrder).not.toEqual(sortedOrder);
  });

  it('puts items without a date last in every mode', () => {
    for (const mode of ['grid', 'date'] as const) {
      for (const dir of ['asc', 'desc'] as const) {
        const order = buildGalleryOrder(items, 'creation_time', dir, mode, formatter);
        expect(order[order.length - 1].id).toBe('n');
      }
    }
  });

  it('mixes photos and videos by time', () => {
    const mixed = [item('i', 100, 'i', 'image'), item('v', 200, 'v', 'video')];
    expect(buildGalleryOrder(mixed, 'creation_time', 'desc', 'grid', formatter).map((i) => i.id)).toEqual(['v', 'i']);
  });
});

describe('countImages', () => {
  it('counts images only', () => {
    expect(countImages([item('a', 1), item('v', 2, 'v', 'video'), item('b', 3)])).toBe(2);
  });
  it('is zero for a video-only album', () => {
    expect(countImages([item('v', 2, 'v', 'video')])).toBe(0);
  });
});

describe('mountedIndices', () => {
  it('returns current ±2 in the middle', () => expect(mountedIndices(5, 100)).toEqual([3, 4, 5, 6, 7]));
  it('clips at the start', () => expect(mountedIndices(0, 100)).toEqual([0, 1, 2]));
  it('clips at the end', () => expect(mountedIndices(99, 100)).toEqual([97, 98, 99]));
  it('handles a single item', () => expect(mountedIndices(0, 1)).toEqual([0]));
  it('does not exceed bounds for two items', () => expect(mountedIndices(0, 2)).toEqual([0, 1]));
  it('returns nothing when empty', () => expect(mountedIndices(0, 0)).toEqual([]));
  it('clamps an out-of-range current index', () => expect(mountedIndices(50, 3)).toEqual([0, 1, 2]));
});

describe('initialIndex', () => {
  const order = [item('a', 1), item('b', 2), item('c', 3)];
  it('finds the index', () => expect(initialIndex(order, 'c')).toEqual({ index: 2, notFound: false }));
  it('falls back to 0 and flags a missing id', () => expect(initialIndex(order, 'zzz')).toEqual({ index: 0, notFound: true }));
});
