export type MediaPermissionStatus = 'granted' | 'denied' | 'undetermined';

export type MediaAccessPrivilege = 'all' | 'limited' | 'none';

export interface MediaPermissionResult {
  status: MediaPermissionStatus;
  canAskAgain: boolean;
  accessPrivileges?: MediaAccessPrivilege;
}

export type PermissionFlowState =
  | 'idle'
  | 'rationale'
  | 'requesting'
  | 'granted'
  | 'partial_unsupported'
  | 'denied'
  | 'blocked';

export type PermissionFlowEvent =
  | { type: 'START' }
  | { type: 'CONFIRM_RATIONALE' }
  | { type: 'CANCEL_RATIONALE' }
  | { type: 'RESULT'; result: MediaPermissionResult }
  | { type: 'RECHECK'; result: MediaPermissionResult };
