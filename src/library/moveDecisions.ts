import type { MediaMutation } from '../photos/mediaMutations';
import { planNewFolder } from './folderLocation';
import { blockedTopDirectory, type MoveTarget } from './moveTargets';
import { folderPathToDirectory } from '../photos/directMove';

export type MoveMode = 'move' | 'copy';

/**
 * 이동·복사 다이얼로그에서 고른 결과로 무엇을 할지:
 * - mutation: 바로 실행할 작업(권한 불필요 — MediaStore 경로)
 * - direct: 모든 파일 접근으로 파일을 직접 옮겨야 하는 작업(권한 안내를 거친 뒤 destinationDir로 실행)
 */
export type MoveDecision =
  | { type: 'mutation'; mutation: MediaMutation }
  | { type: 'direct'; destinationDir: string; title: string };

export function directMutation(mode: MoveMode, destinationDir: string): MediaMutation {
  return mode === 'copy' ? { kind: 'copyDirect', destinationDir } : { kind: 'moveDirect', destinationDir };
}

/** 기존 앨범을 골랐을 때. MediaStore가 거부하는 폴더(미디어 폴더 밖)는 직접 이동으로 보낸다. */
export function decideTargetMove(mode: MoveMode, target: MoveTarget): MoveDecision {
  if (blockedTopDirectory(target.folderPath) !== null) {
    const destinationDir = folderPathToDirectory(target.folderPath);
    if (destinationDir) return { type: 'direct', destinationDir, title: target.title };
  }
  return {
    type: 'mutation',
    mutation:
      mode === 'copy'
        ? { kind: 'copy', targetAlbumId: target.id }
        : { kind: 'move', targetAlbumId: target.id },
  };
}

/** 새 폴더(상위 폴더 + 이름)를 만들어 보낼 때. */
export function decideNewFolderMove(mode: MoveMode, parentDir: string, name: string): MoveDecision {
  const plan = planNewFolder(parentDir, name);
  if (plan.kind === 'direct') return { type: 'direct', destinationDir: plan.destinationDir, title: name };
  return {
    type: 'mutation',
    mutation:
      mode === 'copy'
        ? { kind: 'copyToNew', folderName: plan.folderName }
        : { kind: 'moveToNew', folderName: plan.folderName },
  };
}
