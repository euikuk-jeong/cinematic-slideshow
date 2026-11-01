/** MediaStore 휴지통 항목(네이티브 `listTrashed`가 돌려주는 모양). 시각은 모두 밀리초, 모르면 null. */
export interface TrashItem {
  /** expo-media-library asset id와 같은 형태의 content URI — 복원·영구 삭제에 그대로 쓴다. */
  id: string;
  filename: string | null;
  isVideo: boolean;
  takenAt: number | null;
  modifiedAt: number | null;
  /** 이 시각 이후 OS가 자동으로 영구 삭제한다. */
  expiresAt: number | null;
  size: number;
  relativePath: string | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** 안드로이드가 휴지통 항목을 자동으로 영구 삭제하는 기간(앱이 바꿀 수 없다). */
const OS_RETENTION_DAYS = 30;

/**
 * 앱이 정한 보관 기간(retentionDays)을 반영해 만료 시각을 당긴 목록. OS 만료(휴지통으로 보낸 뒤 30일)에서 거꾸로
 * 보낸 시각을 구하므로, 7일이면 보낸 지 7일이 되는 시각이 새 만료가 된다. 30일 이상이면 그대로다.
 */
export function withRetention(items: readonly TrashItem[], retentionDays: number): TrashItem[] {
  const shiftMs = Math.max(0, OS_RETENTION_DAYS - retentionDays) * DAY_MS;
  if (shiftMs === 0) return [...items];
  return items.map((item) => (item.expiresAt === null ? item : { ...item, expiresAt: item.expiresAt - shiftMs }));
}

/** 만료 시각이 지난 항목(만료를 모르는 항목은 지난 것으로 보지 않는다). */
export function overdueItems(items: readonly TrashItem[], now: number): TrashItem[] {
  return items.filter((item) => item.expiresAt !== null && item.expiresAt <= now);
}

/** 자동 삭제까지 남은 일수(올림, 0 미만 없음). 만료 시각을 모르면 null. */
export function daysUntilExpiry(item: Pick<TrashItem, 'expiresAt'>, now: number): number | null {
  if (item.expiresAt === null) return null;
  return Math.max(0, Math.ceil((item.expiresAt - now) / DAY_MS));
}

/** 네이티브 응답 한 줄을 TrashItem으로. id가 없는 줄은 버린다. */
export function toTrashItem(raw: unknown): TrashItem | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const row = raw as Record<string, unknown>;
  if (typeof row.id !== 'string' || row.id.length === 0) return null;
  const numberOrNull = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : null);
  return {
    id: row.id,
    filename: typeof row.filename === 'string' ? row.filename : null,
    isVideo: row.isVideo === true,
    takenAt: numberOrNull(row.takenAt),
    modifiedAt: numberOrNull(row.modifiedAt),
    expiresAt: numberOrNull(row.expiresAt),
    size: numberOrNull(row.size) ?? 0,
    relativePath: typeof row.relativePath === 'string' ? row.relativePath : null,
  };
}

/** 곧 지워질 항목이 먼저 오도록 정렬한다(만료 시각을 모르는 항목은 뒤로). */
export function sortTrashItems(items: readonly TrashItem[]): TrashItem[] {
  return [...items].sort((a, b) => {
    if (a.expiresAt === null && b.expiresAt === null) return 0;
    if (a.expiresAt === null) return 1;
    if (b.expiresAt === null) return -1;
    return a.expiresAt - b.expiresAt;
  });
}
