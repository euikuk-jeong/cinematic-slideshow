import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { folderPathToDirectory } from '../photos/directMove';
import { isAllFilesAccessGranted, openAllFilesAccessSettings } from '../photos/fileMover';
import type { MoveTarget } from './moveTargets';

interface PendingMove {
  destinationDir: string;
  title: string;
}

export interface DirectMoveGate {
  /** MediaStore가 거부하는 폴더(모든 파일 접근이 필요한 대상)를 골랐을 때 호출한다. */
  request: (target: MoveTarget) => void;
  /** 권한 안내 다이얼로그 상태(AllFilesAccessModal에 그대로 넘긴다). */
  rationale: { visible: boolean; folderTitle: string; onOpenSettings: () => void; onCancel: () => void };
}

/**
 * 모든 파일 접근이 필요한 이동의 권한 흐름: 이미 허용돼 있으면 바로 실행하고, 아니면 왜 필요한지 설명하는
 * 다이얼로그 → 시스템 설정 화면 → 앱으로 돌아왔을 때 허용됐으면 이어서 실행, 아니면 onDenied로 알린다.
 * 권한은 앱 시작이 아니라 이 이동을 실제로 시도하는 시점에만 요청한다.
 */
export function useDirectMoveGate(run: (destinationDir: string) => void, onDenied: () => void): DirectMoveGate {
  const [pending, setPending] = useState<PendingMove | null>(null);
  const [rationaleVisible, setRationaleVisible] = useState(false);
  const awaitingSettings = useRef(false);
  // AppState 콜백은 설정 화면에 다녀온 뒤에 불리므로, 그 시점의 최신 run/onDenied를 쓰도록 ref로 들고 있는다.
  const latest = useRef({ run, onDenied, pending });
  latest.current = { run, onDenied, pending };

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active' || !awaitingSettings.current) return;
      awaitingSettings.current = false;
      const { pending: waiting, run: runMove, onDenied: denied } = latest.current;
      setPending(null);
      if (!waiting) return;
      if (isAllFilesAccessGranted()) runMove(waiting.destinationDir);
      else denied();
    });
    return () => subscription.remove();
  }, []);

  const request = useCallback((target: MoveTarget) => {
    const destinationDir = folderPathToDirectory(target.folderPath);
    if (!destinationDir) {
      latest.current.onDenied();
      return;
    }
    if (isAllFilesAccessGranted()) {
      latest.current.run(destinationDir);
      return;
    }
    setPending({ destinationDir, title: target.title });
    setRationaleVisible(true);
  }, []);

  const onOpenSettings = useCallback(() => {
    awaitingSettings.current = true;
    setRationaleVisible(false);
    openAllFilesAccessSettings();
  }, []);

  const onCancel = useCallback(() => {
    awaitingSettings.current = false;
    setRationaleVisible(false);
    setPending(null);
  }, []);

  return {
    request,
    rationale: { visible: rationaleVisible, folderTitle: pending?.title ?? '', onOpenSettings, onCancel },
  };
}
