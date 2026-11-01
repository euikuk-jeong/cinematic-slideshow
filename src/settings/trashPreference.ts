// 삭제를 휴지통으로 보낼지(기본) 바로 영구 삭제할지. 휴지통을 쓸 수 없는 환경(Android 10 이하 등)에서는
// 이 값과 무관하게 항상 영구 삭제다 — 이 설정은 "쓸 수 있을 때 쓸지"만 정한다.
export const TRASH_ENABLED_STORAGE_KEY = 'trash_enabled';
export const DEFAULT_TRASH_ENABLED = true;

export function parseTrashEnabled(raw: string | null): boolean {
  if (raw === '0') return false;
  if (raw === '1') return true;
  return DEFAULT_TRASH_ENABLED;
}

export function serializeTrashEnabled(enabled: boolean): string {
  return enabled ? '1' : '0';
}

// 휴지통 보관 기간(일). 안드로이드는 휴지통으로 보낼 때 만료 시각(DATE_EXPIRES)을 30일 뒤로 계산해 두고 그때 자동
// 영구 삭제한다. 앱은 이 값을 바꿀 수 없다(MediaProvider가 외부 앱의 DATE_EXPIRES 쓰기를 버린다) — 그래서 30일보다
// 길게는 못 하고, 더 짧은 기간은 "기간이 지난 항목"을 휴지통 화면에서 찾아 삭제를 안내하는 방식으로 지킨다
// (사용자 확인 없이 영구 삭제할 수는 없다).
export const TRASH_RETENTION_DAYS_STORAGE_KEY = 'trash_retention_days';
export const DEFAULT_TRASH_RETENTION_DAYS = 30;
export const TRASH_RETENTION_OPTIONS_DAYS: readonly number[] = [7, 14, 30];

export function parseTrashRetentionDays(raw: string | null): number {
  const parsed = Number(raw);
  return raw !== null && TRASH_RETENTION_OPTIONS_DAYS.includes(parsed) ? parsed : DEFAULT_TRASH_RETENTION_DAYS;
}
