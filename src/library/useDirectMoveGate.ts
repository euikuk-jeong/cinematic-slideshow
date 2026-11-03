import { useCallback, useRef, useState } from 'react';

import { grantDirectoryFor } from '../photos/directMove';
import { findFolderGrant, requestFolderAccess } from '../photos/fileMover';
import { displayPath } from './folderLocation';

interface PendingMove<T> {
  payload: T;
  title: string;
  destinationDir: string;
}

export type FolderAccessDenial = 'mismatch' | 'error';

export interface DirectMoveGate<T> {
  /**
   * 미디어 폴더 밖 위치로 옮기기·복사를 시작할 때 호출한다. 어떤 작업인지(이동/복사, 목적 폴더, 이름 변경 문맥 등)는
   * 호출 시점의 payload에 담아 넘긴다 — 폴더 선택기에 다녀오는 사이 화면 상태가 달라져 있을 수 있다.
   */
  request: (payload: T, title: string, destinationDir: string) => void;
  /** 권한 안내 다이얼로그 상태(FolderAccessModal에 그대로 넘긴다). */
  rationale: {
    visible: boolean;
    folderTitle: string;
    /** 폴더 선택기에서 골라 달라고 할 폴더(화면 표시용 경로). */
    grantFolder: string;
    onContinue: () => void;
    onCancel: () => void;
  };
}

/**
 * 미디어 폴더 밖으로의 이동·복사 권한 흐름(SAF): 대상 폴더를 포함하는 폴더 권한을 이미 받아 두었으면 바로 실행하고,
 * 아니면 왜 필요한지와 어느 폴더를 고르면 되는지 알리는 다이얼로그 → 시스템 폴더 선택기 → 고른 폴더가 대상 폴더를
 * 포함하면 이어서 실행한다. 선택기에서는 아무 폴더나 고를 수 있으므로 포함하지 않으면 onDenied('mismatch')로 알린다.
 * 선택기를 취소하면 조용히 끝낸다. 권한은 앱 시작이 아니라 이 작업을 실제로 시도하는 시점에만 요청한다.
 */
export function useDirectMoveGate<T>(
  run: (payload: T) => void,
  onDenied: (reason: FolderAccessDenial, grantFolder: string) => void
): DirectMoveGate<T> {
  const [pending, setPending] = useState<PendingMove<T> | null>(null);
  // 선택기는 비동기로 돌아오므로 그 시점의 최신 run/onDenied를 쓰도록 ref로 들고 있는다.
  const latest = useRef({ run, onDenied });
  latest.current = { run, onDenied };

  const request = useCallback((payload: T, title: string, destinationDir: string) => {
    if (findFolderGrant(destinationDir)) {
      latest.current.run(payload);
      return;
    }
    setPending({ payload, title, destinationDir });
  }, []);

  const onContinue = useCallback(() => {
    const waiting = pending;
    setPending(null);
    if (!waiting) return;
    const grantFolder = grantFolderLabel(waiting.destinationDir);
    requestFolderAccess(waiting.destinationDir)
      .then((result) => {
        if (result.status === 'granted') latest.current.run(waiting.payload);
        else if (result.status === 'mismatch') latest.current.onDenied('mismatch', grantFolder);
      })
      .catch((e) => {
        console.warn('[useDirectMoveGate] folder access request failed', e);
        latest.current.onDenied('error', grantFolder);
      });
  }, [pending]);

  const onCancel = useCallback(() => setPending(null), []);

  return {
    request,
    rationale: {
      visible: pending !== null,
      folderTitle: pending?.title ?? '',
      grantFolder: pending ? grantFolderLabel(pending.destinationDir) : '',
      onContinue,
      onCancel,
    },
  };
}

function grantFolderLabel(destinationDir: string): string {
  const grantDir = grantDirectoryFor(destinationDir);
  return grantDir ? displayPath(grantDir) : displayPath(destinationDir);
}
