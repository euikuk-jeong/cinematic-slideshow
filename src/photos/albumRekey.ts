interface ItemRef {
  id: string;
  filename: string | null;
}

/**
 * 앨범 이름 변경 전후의 항목을 짝지어 옛 id → 새 id 대응표를 만든다("선택한 사진만 재생"의 선택을 옮기는 데 쓴다).
 * - MediaStore 이동은 항목 id를 유지하므로 양쪽에 같은 id가 있으면 그대로 대응시킨다.
 * - 파일을 직접 옮기면(모든 파일 접근) 새 위치의 파일이 새 id로 잡히므로 파일명으로 짝짓는다. 새 앨범에 같은 이름이
 *   여럿이라 어느 쪽인지 알 수 없는 이름은 짝짓지 않는다(잘못 연결하는 것보다 선택에서 빠지는 쪽이 안전하다).
 */
export function buildAssetIdMap(oldItems: readonly ItemRef[], newItems: readonly ItemRef[]): Record<string, string> {
  const map: Record<string, string> = {};
  const newIds = new Set(newItems.map((item) => item.id));
  const unmatched = oldItems.filter((item) => {
    if (newIds.has(item.id)) {
      map[item.id] = item.id;
      return false;
    }
    return true;
  });
  if (unmatched.length === 0) return map;

  const claimedNewIds = new Set(Object.values(map));
  const idsByFilename = new Map<string, string[]>();
  for (const item of newItems) {
    if (item.filename === null || claimedNewIds.has(item.id)) continue;
    idsByFilename.set(item.filename, [...(idsByFilename.get(item.filename) ?? []), item.id]);
  }
  for (const item of unmatched) {
    if (item.filename === null) continue;
    const candidates = idsByFilename.get(item.filename);
    if (candidates?.length === 1) map[item.id] = candidates[0];
  }
  return map;
}
