import { DEFAULT_LIBRARY_VIEW_MODE, nextLibraryViewMode, parseLibraryViewMode } from '../libraryViewMode';

describe('nextLibraryViewMode', () => {
  test('그리드 → 리스트 → 날짜별 → 그리드 순으로 순환', () => {
    expect(nextLibraryViewMode('grid')).toBe('list');
    expect(nextLibraryViewMode('list')).toBe('date');
    expect(nextLibraryViewMode('date')).toBe('grid');
  });
});

describe('parseLibraryViewMode', () => {
  test.each(['grid', 'list', 'date'] as const)('%s는 그대로', (mode) => {
    expect(parseLibraryViewMode(mode)).toBe(mode);
  });
  test.each([null, '', 'x'])('%p는 기본값(그리드)', (raw) => {
    expect(parseLibraryViewMode(raw)).toBe(DEFAULT_LIBRARY_VIEW_MODE);
    expect(DEFAULT_LIBRARY_VIEW_MODE).toBe('grid');
  });
});
