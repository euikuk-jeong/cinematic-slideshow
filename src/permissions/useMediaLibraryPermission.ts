import { useCallback, useEffect, useReducer, useState } from 'react';
import { AppState, Linking } from 'react-native';
import * as MediaLibrary from 'expo-media-library';

import { initialPermissionFlowState, permissionFlowReducer } from './flow';
import type { MediaPermissionResult, PermissionFlowState } from './types';

const DEFAULT_GRANULAR_PERMISSIONS: MediaLibrary.GranularPermission[] = ['photo'];

function toResult(response: MediaLibrary.PermissionResponse): MediaPermissionResult {
  return {
    status: response.status,
    canAskAgain: response.canAskAgain,
    accessPrivileges: response.accessPrivileges,
  };
}

export interface UseMediaLibraryPermissionResult {
  state: PermissionFlowState;
  // 콜드스타트 최초 getPermissionsAsync 조회가 끝났는지. 화면이 이 값이 true가 되기
  // 전에 idle 상태를 보고 start()를 호출하면, 이미 허용된 재방문 사용자도 조회 결과
  // (RECHECK granted)가 도착하기 전에 rationale 화면이 잠깐 떴다가 사라지는 깜빡임이
  // 생긴다 — 화면은 반드시 이 값으로 idle 시점의 auto-start를 게이팅해야 한다.
  isReady: boolean;
  start: () => void;
  confirmRationale: () => Promise<void>;
  cancelRationale: () => void;
  openSettings: () => Promise<void>;
}

// granularPermissions: 기본은 사진만. READ_MEDIA_AUDIO(배경음악용 기기 음악)는 그 맥락이
// 생기는 음악 선택 시점(앨범별 설정 화면)에 ['audio']를 넘겨 별도로 요청한다 — 앱 진입 시점에
// 함께 요청하면 rationale 화면이 "왜 필요한지" 설명하는 근거(요청 시점의 맥락)가 사라진다.
//
// 계약: 아래 useEffect/confirmRationale의 deps 배열은 이 인자를 참조하지 않는다(고정 []).
// 호출부는 반드시 모듈 최상단 상수(DEFAULT_GRANULAR_PERMISSIONS, AUDIO_GRANULAR_PERMISSIONS
// 등 안정적 참조)만 넘겨야 한다 — 렌더마다 새 배열 리터럴(예: `['audio']`)을 인라인으로
// 넘기면 deps가 이를 추적하지 않아 stale closure로 이전 값을 계속 쓰게 된다.
export function useMediaLibraryPermission(
  granularPermissions: MediaLibrary.GranularPermission[] = DEFAULT_GRANULAR_PERMISSIONS
): UseMediaLibraryPermissionResult {
  const [state, dispatch] = useReducer(permissionFlowReducer, initialPermissionFlowState);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const check = () => {
      MediaLibrary.getPermissionsAsync(false, granularPermissions)
        .then((response) => {
          if (!cancelled) dispatch({ type: 'RECHECK', result: toResult(response) });
        })
        .catch(() => {
          // 조회 실패는 무시 — idle 유지, 사용자가 "앨범 선택" 실행 시 rationale부터 재시도.
        })
        .finally(() => {
          if (!cancelled) setIsReady(true);
        });
    };
    check(); // 콜드스타트 시 이미 허용된 권한을 즉시 반영
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState !== 'active') return;
      check();
    });
    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, []);

  const start = useCallback(() => dispatch({ type: 'START' }), []);
  const cancelRationale = useCallback(() => dispatch({ type: 'CANCEL_RATIONALE' }), []);

  const confirmRationale = useCallback(async () => {
    dispatch({ type: 'CONFIRM_RATIONALE' });
    const response = await MediaLibrary.requestPermissionsAsync(false, granularPermissions);
    dispatch({ type: 'RESULT', result: toResult(response) });
  }, []);

  const openSettings = useCallback(async () => {
    await Linking.openSettings();
  }, []);

  return { state, isReady, start, confirmRationale, cancelRationale, openSettings };
}
