/** 앨범 목록·앨범 갤러리가 공유하는 보기 방식. 툴바 버튼이 이 순서대로 순환한다. */
export type LibraryViewMode = 'grid' | 'list' | 'date';

export const LIBRARY_VIEW_MODE_ORDER: readonly LibraryViewMode[] = ['grid', 'list', 'date'];

export const DEFAULT_LIBRARY_VIEW_MODE: LibraryViewMode = 'grid';

export function parseLibraryViewMode(raw: string | null): LibraryViewMode {
  return raw === 'grid' || raw === 'list' || raw === 'date' ? raw : DEFAULT_LIBRARY_VIEW_MODE;
}

/** 그리드 → 리스트 → 날짜별 → 그리드 */
export function nextLibraryViewMode(mode: LibraryViewMode): LibraryViewMode {
  const index = LIBRARY_VIEW_MODE_ORDER.indexOf(mode);
  return LIBRARY_VIEW_MODE_ORDER[(index + 1) % LIBRARY_VIEW_MODE_ORDER.length];
}
