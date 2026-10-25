export const MAX_FOLDER_NAME_LENGTH = 50;

export type FolderNameProblem = 'empty' | 'tooLong' | 'invalidChars' | 'exists';

export type FolderNameResult = { ok: true; name: string } | { ok: false; problem: FolderNameProblem };

// expo-media-library(Android)가 폴더 경로를 만들 때 쓰는 검증이 글자·숫자·밑줄·공백·하이픈만 통과시킨다
// (RelativePath의 `[\w -]+`). 그 밖의 문자(점, 괄호, 슬래시 등)를 넘기면 네이티브에서 던져 버려
// 사용자에게는 "취소"와 구분되지 않으므로, 입력 단계에서 같은 범위로 미리 막는다.
// 한글을 포함한 모든 언어의 글자(\p{L})·숫자(\p{N})를 허용하는 것이 의도다.
const ALLOWED_NAME = /^[\p{L}\p{N}_ -]+$/u;

/**
 * 새 폴더 이름을 검증하고 앞뒤 공백을 정리한 이름을 돌려준다.
 * existingTitles: 이미 있는 앨범 제목 — 같은 이름이면 "새" 폴더가 아니라 그 폴더로 합쳐지므로 막는다
 * (대소문자 무시: 파일시스템에서 사실상 같은 폴더로 취급되는 경우를 피함).
 */
export function validateNewFolderName(input: string, existingTitles: readonly string[]): FolderNameResult {
  const name = input.trim();
  if (name.length === 0) return { ok: false, problem: 'empty' };
  if ([...name].length > MAX_FOLDER_NAME_LENGTH) return { ok: false, problem: 'tooLong' };
  if (!ALLOWED_NAME.test(name)) return { ok: false, problem: 'invalidChars' };
  const lower = name.toLowerCase();
  if (existingTitles.some((title) => title.trim().toLowerCase() === lower)) return { ok: false, problem: 'exists' };
  return { ok: true, name };
}
