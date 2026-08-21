import { useCallback, useEffect, useReducer } from 'react';
import { AppState, Linking } from 'react-native';
import * as MediaLibrary from 'expo-media-library';

import { initialPermissionFlowState, permissionFlowReducer } from './flow';
import type { MediaPermissionResult, PermissionFlowState } from './types';

// 사진 접근만 요청한다. READ_MEDIA_AUDIO(배경음악용 기기 음악)는 그 맥락이 생기는
// 음악 선택 시점(Phase 2, 7번)에 별도로 요청 — 지금 함께 요청하면 rationale 화면이
// "왜 필요한지" 설명하는 근거(요청 시점의 맥락)가 사라진다.
const GRANULAR_PERMISSIONS: MediaLibrary.GranularPermission[] = ['photo'];

function toResult(response: MediaLibrary.PermissionResponse): MediaPermissionResult {
  return {
    status: response.status,
    canAskAgain: response.canAskAgain,
    accessPrivileges: response.accessPrivileges,
  };
}

export interface UseMediaLibraryPermissionResult {
  state: PermissionFlowState;
  start: () => void;
  confirmRationale: () => Promise<void>;
  cancelRationale: () => void;
  openSettings: () => Promise<void>;
}

export function useMediaLibraryPermission(): UseMediaLibraryPermissionResult {
  const [state, dispatch] = useReducer(permissionFlowReducer, initialPermissionFlowState);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState !== 'active') return;
      MediaLibrary.getPermissionsAsync(false, GRANULAR_PERMISSIONS).then((response) => {
        dispatch({ type: 'RECHECK', result: toResult(response) });
      });
    });
    return () => subscription.remove();
  }, []);

  const start = useCallback(() => dispatch({ type: 'START' }), []);
  const cancelRationale = useCallback(() => dispatch({ type: 'CANCEL_RATIONALE' }), []);

  const confirmRationale = useCallback(async () => {
    dispatch({ type: 'CONFIRM_RATIONALE' });
    const response = await MediaLibrary.requestPermissionsAsync(false, GRANULAR_PERMISSIONS);
    dispatch({ type: 'RESULT', result: toResult(response) });
  }, []);

  const openSettings = useCallback(async () => {
    await Linking.openSettings();
  }, []);

  return { state, start, confirmRationale, cancelRationale, openSettings };
}
