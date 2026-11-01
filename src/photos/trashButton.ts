import { getAppSetting } from '../db/client';
import { parseTrashEnabled, TRASH_ENABLED_STORAGE_KEY } from '../settings/trashPreference';
import { isTrashAvailable, listTrash } from './mediaTrash';

/**
 * 앨범 목록 헤더에 휴지통 버튼을 둘지. 휴지통을 쓸 수 있는 환경에서, 사용 중이거나(켜짐) 아직 휴지통에 항목이 남아
 * 있을 때만 보인다 — 끈 뒤에도 남은 항목은 복원·영구 삭제할 길이 있어야 한다(OS는 약 30일 뒤에야 지운다).
 * 설정이나 목록을 읽지 못하면 숨겨서 항목에 닿지 못하게 되는 쪽보다 보이는 쪽이 안전하므로 보인다.
 */
export async function isTrashButtonVisible(): Promise<boolean> {
  if (!isTrashAvailable()) return false;
  try {
    if (parseTrashEnabled(await getAppSetting(TRASH_ENABLED_STORAGE_KEY))) return true;
    return (await listTrash()).length > 0;
  } catch (e) {
    console.warn('[trashButton] 휴지통 버튼 표시 여부 조회 실패', e);
    return true;
  }
}
