import type { MediaPermissionResult, PermissionFlowEvent, PermissionFlowState } from './types';

export const initialPermissionFlowState: PermissionFlowState = 'idle';

function resultToState(result: MediaPermissionResult): PermissionFlowState {
  if (result.status === 'granted') {
    return result.accessPrivileges === 'limited' ? 'partial_unsupported' : 'granted';
  }
  return result.canAskAgain ? 'denied' : 'blocked';
}

export function permissionFlowReducer(
  state: PermissionFlowState,
  event: PermissionFlowEvent
): PermissionFlowState {
  switch (event.type) {
    case 'START':
      return state === 'idle' || state === 'denied' ? 'rationale' : state;
    case 'CONFIRM_RATIONALE':
      return state === 'rationale' ? 'requesting' : state;
    case 'CANCEL_RATIONALE':
      return state === 'rationale' ? 'idle' : state;
    case 'RESULT':
      return state === 'requesting' ? resultToState(event.result) : state;
    case 'RECHECK':
      // requesting은 시스템 다이얼로그가 떠 있는 동안 AppState가 background/active를
      // 오가며 발생할 수 있어 제외 — 그 사이 RECHECK가 끼면 뒤이어 오는 RESULT가
      // 무시되어 실제로는 허용된 권한이 denied로 멈추는 교착이 생김.
      if (state === 'requesting') return state;
      // idle에서는 이미 허용된 권한(콜드스타트 등)만 반영한다. denied/blocked는
      // 사용자가 "앨범 선택"을 실행해 START를 트리거하기 전까지 노출하지 않는다
      // (권한 요청/차단 화면은 요청 시점에만 보여준다는 설계 원칙 유지).
      if (state === 'idle') {
        return event.result.status === 'granted' ? resultToState(event.result) : state;
      }
      return resultToState(event.result);
    default:
      return state;
  }
}
