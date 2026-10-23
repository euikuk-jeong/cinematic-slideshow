import {
  DEFAULT_GALLERY_COLUMNS,
  DEFAULT_GALLERY_SORT_CRITERION,
  DEFAULT_GALLERY_SORT_DIRECTION,
  DEFAULT_GALLERY_VIEW_MODE,
  GALLERY_GRID_COLUMNS_STORAGE_KEY,
  GALLERY_SORT_CRITERION_STORAGE_KEY,
  GALLERY_SORT_DIRECTION_STORAGE_KEY,
  GALLERY_VIEW_MODE_STORAGE_KEY,
  parseGalleryColumns,
  parseGallerySortCriterion,
  parseGallerySortDirection,
  parseGalleryViewMode,
} from '../galleryViewSettings';
import { GRID_COLUMNS_STORAGE_KEY } from '../albumGridZoom';

test('기본값: 촬영시간 내림차순 / 그리드 / 3열', () => {
  expect(DEFAULT_GALLERY_SORT_CRITERION).toBe('creation_time');
  expect(DEFAULT_GALLERY_SORT_DIRECTION).toBe('desc');
  expect(DEFAULT_GALLERY_VIEW_MODE).toBe('grid');
  expect(DEFAULT_GALLERY_COLUMNS).toBe(3);
});

describe('parseGallerySortCriterion', () => {
  test.each([null, '', 'garbage'])('%p는 기본값', (raw) => {
    expect(parseGallerySortCriterion(raw)).toBe(DEFAULT_GALLERY_SORT_CRITERION);
  });
  test('filename 그대로', () => expect(parseGallerySortCriterion('filename')).toBe('filename'));
  test('creation_time 그대로', () => expect(parseGallerySortCriterion('creation_time')).toBe('creation_time'));
});

describe('parseGallerySortDirection', () => {
  test.each([null, '', 'x'])('%p는 기본값', (raw) => {
    expect(parseGallerySortDirection(raw)).toBe(DEFAULT_GALLERY_SORT_DIRECTION);
  });
  test('asc 그대로', () => expect(parseGallerySortDirection('asc')).toBe('asc'));
});

describe('parseGalleryViewMode', () => {
  test.each([null, '', 'x'])('%p는 기본값', (raw) => {
    expect(parseGalleryViewMode(raw)).toBe(DEFAULT_GALLERY_VIEW_MODE);
  });
  test('date 그대로', () => expect(parseGalleryViewMode('date')).toBe('date'));
  test('저장돼 있던 list는 그리드로 폴백', () => expect(parseGalleryViewMode('list')).toBe('grid'));
});

describe('parseGalleryColumns', () => {
  test.each([null, '', 'abc', '2.5'])('%p는 기본 3', (raw) => {
    expect(parseGalleryColumns(raw)).toBe(DEFAULT_GALLERY_COLUMNS);
  });
  test.each([['1', 2], ['0', 2], ['-3', 2]])('%p는 하한 2로 clamp', (raw, expected) => {
    expect(parseGalleryColumns(raw)).toBe(expected);
  });
  test.each([['7', 6], ['999', 6]])('%p는 상한 6으로 clamp', (raw, expected) => {
    expect(parseGalleryColumns(raw)).toBe(expected);
  });
  test('경계값 2와 6은 그대로', () => {
    expect(parseGalleryColumns('2')).toBe(2);
    expect(parseGalleryColumns('6')).toBe(6);
  });
});

test('저장 키 4개는 서로 다르고 앨범 목록 열 수 키와도 겹치지 않는다', () => {
  const keys = [
    GALLERY_SORT_CRITERION_STORAGE_KEY,
    GALLERY_SORT_DIRECTION_STORAGE_KEY,
    GALLERY_VIEW_MODE_STORAGE_KEY,
    GALLERY_GRID_COLUMNS_STORAGE_KEY,
    GRID_COLUMNS_STORAGE_KEY,
  ];
  expect(new Set(keys).size).toBe(keys.length);
});
