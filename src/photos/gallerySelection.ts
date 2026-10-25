/**
 * 갤러리 파일 관리(삭제·이동)용 순수 로직. 선택 모드 상태 전이와, 작업 결과 판정을 다룬다.
 * 네이티브 모듈(expo-media-library)에 의존하지 않아 node 테스트 대상이다.
 */

// MediaStore.createDeleteRequest / createWriteRequest(시스템 확인 다이얼로그)는 API 30(Android 11)부터 있다.
// 그 미만은 WRITE_EXTERNAL_STORAGE + 직접 파일 조작이 필요한데, 이 앱은 쓰기 권한을 요청하지 않으므로
// (gallery-feature-requirements NFR-P4) 기능 자체를 노출하지 않는다.
const MIN_ANDROID_API_FOR_FILE_MANAGEMENT = 30;

export function supportsFileManagement(os: string, version: string | number): boolean {
  return os === 'android' && Number(version) >= MIN_ANDROID_API_FOR_FILE_MANAGEMENT;
}

/** 선택 집합에 id를 넣거나(없을 때) 뺀다(있을 때). 원본은 바꾸지 않는다. */
export function toggleSelection(selected: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(selected);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

/** 현재 목록에 실제로 있는 id만 남긴다(재조회로 사라진 항목이 선택에 남지 않게). */
export function pruneSelection(selected: ReadonlySet<string>, items: ReadonlyArray<{ id: string }>): Set<string> {
  const alive = new Set(items.map((item) => item.id));
  return new Set([...selected].filter((id) => alive.has(id)));
}

export interface MutationSummary {
  /** 작업 후 이 앨범에서 사라진 id(삭제됐거나 다른 폴더로 이동됨). */
  removedIds: string[];
  /** 작업 후에도 이 앨범에 남아 있는 id(취소됐거나 실패). */
  remainingIds: string[];
}

/**
 * 작업 결과는 예외 메시지가 아니라 "작업 후 재조회한 목록"과 요청 id를 비교해 판정한다.
 * 사용자가 시스템 다이얼로그에서 취소한 것과 실제 실패가 같은 예외로 올라오고, 이동은 항목을
 * 순차 처리해서 중간에 실패하면 일부만 옮겨진 상태가 되기 때문이다.
 */
export function summarizeMutation(requestedIds: readonly string[], itemsAfter: ReadonlyArray<{ id: string }>): MutationSummary {
  const alive = new Set(itemsAfter.map((item) => item.id));
  const removedIds: string[] = [];
  const remainingIds: string[] = [];
  for (const id of requestedIds) {
    (alive.has(id) ? remainingIds : removedIds).push(id);
  }
  return { removedIds, remainingIds };
}

export type MutationOutcome = 'success' | 'nothingDone' | 'partial';

/** 전부 처리됨=success, 하나도 안 됨(취소/실패)=nothingDone, 일부만 됨=partial. */
export function mutationOutcome(summary: MutationSummary): MutationOutcome {
  if (summary.remainingIds.length === 0) return 'success';
  return summary.removedIds.length === 0 ? 'nothingDone' : 'partial';
}

export type NothingDoneNotice =
  | { key: 'mutationNothingDone' }
  | { key: 'mutationDirectoryNotAllowed'; values: { dir: string } }
  | { key: 'mutationFailed'; values: { detail: string } };

const MAX_FAILURE_DETAIL_LENGTH = 140;

/**
 * 하나도 처리되지 않았을 때 보여줄 안내를 고른다. 시스템 다이얼로그 취소와 실제 실패는 같은 예외
 * ("User didn't grant write permission…")로 오므로 그 문구는 "취소"로 보고, 그 밖의 예외는 원인을
 * 알 수 있게 네이티브 메시지를 그대로(길이만 줄여) 보여준다.
 * MediaStore가 사진·영상의 최상위 폴더를 DCIM/Pictures 등으로 제한해 `Primary directory X not allowed`로
 * 거부하는 경우(실기기 확인: `_MyData/…`)는 해결 방법이 없으므로 이유를 풀어서 안내한다.
 */
export function nothingDoneNotice(error: unknown): NothingDoneNotice {
  if (error === null || error === undefined) return { key: 'mutationNothingDone' };
  const message = (error instanceof Error ? error.message : String(error)).trim();
  if (message.length === 0 || /did not grant|didn't grant/i.test(message)) return { key: 'mutationNothingDone' };
  const directory = /Primary directory (\S+) not allowed/.exec(message);
  if (directory) return { key: 'mutationDirectoryNotAllowed', values: { dir: directory[1] } };
  const detail = message.length > MAX_FAILURE_DETAIL_LENGTH ? `${message.slice(0, MAX_FAILURE_DETAIL_LENGTH)}…` : message;
  return { key: 'mutationFailed', values: { detail } };
}
