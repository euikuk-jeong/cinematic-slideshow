import { initialPermissionFlowState, permissionFlowReducer } from '../flow';
import type { MediaPermissionResult, PermissionFlowState } from '../types';

const granted: MediaPermissionResult = { status: 'granted', canAskAgain: true, accessPrivileges: 'all' };
const grantedLimited: MediaPermissionResult = {
  status: 'granted',
  canAskAgain: true,
  accessPrivileges: 'limited',
};
const deniedRetryable: MediaPermissionResult = { status: 'denied', canAskAgain: true, accessPrivileges: 'none' };
const deniedBlocked: MediaPermissionResult = { status: 'denied', canAskAgain: false, accessPrivileges: 'none' };

describe('permissionFlowReducer', () => {
  test('initial state is idle', () => {
    expect(initialPermissionFlowState).toBe('idle');
  });

  test('START moves idle -> rationale', () => {
    expect(permissionFlowReducer('idle', { type: 'START' })).toBe('rationale');
  });

  test('CONFIRM_RATIONALE moves rationale -> requesting', () => {
    expect(permissionFlowReducer('rationale', { type: 'CONFIRM_RATIONALE' })).toBe('requesting');
  });

  test('CANCEL_RATIONALE moves rationale -> idle', () => {
    expect(permissionFlowReducer('rationale', { type: 'CANCEL_RATIONALE' })).toBe('idle');
  });

  test('RESULT with full access moves requesting -> granted', () => {
    expect(permissionFlowReducer('requesting', { type: 'RESULT', result: granted })).toBe('granted');
  });

  test('RESULT with limited access (Android 14+ partial) moves requesting -> partial_unsupported', () => {
    expect(permissionFlowReducer('requesting', { type: 'RESULT', result: grantedLimited })).toBe(
      'partial_unsupported'
    );
  });

  test('RESULT with retryable denial moves requesting -> denied', () => {
    expect(permissionFlowReducer('requesting', { type: 'RESULT', result: deniedRetryable })).toBe('denied');
  });

  test('RESULT with non-retryable denial moves requesting -> blocked', () => {
    expect(permissionFlowReducer('requesting', { type: 'RESULT', result: deniedBlocked })).toBe('blocked');
  });

  test('denied -> START re-enters rationale (retry path)', () => {
    expect(permissionFlowReducer('denied', { type: 'START' })).toBe('rationale');
  });

  test('RECHECK updates state to reflect current OS permission (e.g. granted via Settings)', () => {
    expect(permissionFlowReducer('blocked', { type: 'RECHECK', result: granted })).toBe('granted');
  });

  test('RECHECK from partial_unsupported to granted after user switches to full access in Settings', () => {
    expect(permissionFlowReducer('partial_unsupported', { type: 'RECHECK', result: granted })).toBe('granted');
  });

  test('RECHECK is a no-op while idle (no permission ever requested yet)', () => {
    expect(permissionFlowReducer('idle', { type: 'RECHECK', result: granted })).toBe('idle');
  });

  test('RECHECK is ignored while requesting is in flight, and a later RESULT still applies', () => {
    let state: PermissionFlowState = 'rationale';
    state = permissionFlowReducer(state, { type: 'CONFIRM_RATIONALE' });
    expect(state).toBe('requesting');

    // AppState 콜백이 시스템 다이얼로그 노출 중 background/active를 오가며
    // stale한 결과로 RECHECK를 보낼 수 있는 상황을 재현.
    state = permissionFlowReducer(state, { type: 'RECHECK', result: deniedRetryable });
    expect(state).toBe('requesting');

    state = permissionFlowReducer(state, { type: 'RESULT', result: granted });
    expect(state).toBe('granted');
  });

  test('unrelated events are ignored outside their expected state (e.g. CONFIRM_RATIONALE while idle)', () => {
    expect(permissionFlowReducer('idle', { type: 'CONFIRM_RATIONALE' })).toBe('idle');
  });
});
