import {
  mutationOutcome,
  nothingDoneNotice,
  pruneSelection,
  summarizeMutation,
  supportsFileManagement,
  toggleSelection,
} from '../gallerySelection';

describe('supportsFileManagement', () => {
  it('Android 11(API 30) 이상에서만 지원한다', () => {
    expect(supportsFileManagement('android', 30)).toBe(true);
    expect(supportsFileManagement('android', 34)).toBe(true);
    expect(supportsFileManagement('android', 29)).toBe(false);
    expect(supportsFileManagement('android', 24)).toBe(false);
  });

  it('iOS·web은 지원하지 않는다', () => {
    expect(supportsFileManagement('ios', '17.0')).toBe(false);
    expect(supportsFileManagement('web', 30)).toBe(false);
  });

  it('Version이 문자열로 와도 숫자로 비교한다', () => {
    expect(supportsFileManagement('android', '33')).toBe(true);
    expect(supportsFileManagement('android', '29')).toBe(false);
  });
});

describe('toggleSelection', () => {
  it('없는 id는 추가하고 있는 id는 뺀다', () => {
    const a = toggleSelection(new Set(), 'x');
    expect([...a]).toEqual(['x']);
    expect([...toggleSelection(a, 'x')]).toEqual([]);
  });

  it('원본 집합을 바꾸지 않는다', () => {
    const original = new Set(['a']);
    toggleSelection(original, 'b');
    expect([...original]).toEqual(['a']);
  });
});

describe('pruneSelection', () => {
  it('목록에 없는 id를 걸러낸다', () => {
    const pruned = pruneSelection(new Set(['a', 'b', 'c']), [{ id: 'a' }, { id: 'c' }]);
    expect([...pruned].sort()).toEqual(['a', 'c']);
  });

  it('목록이 비면 선택도 빈다', () => {
    expect(pruneSelection(new Set(['a']), []).size).toBe(0);
  });
});

describe('summarizeMutation / mutationOutcome', () => {
  it('재조회 목록에서 사라진 id는 removed, 남은 id는 remaining으로 나눈다', () => {
    const summary = summarizeMutation(['a', 'b', 'c'], [{ id: 'b' }, { id: 'z' }]);
    expect(summary.removedIds).toEqual(['a', 'c']);
    expect(summary.remainingIds).toEqual(['b']);
    expect(mutationOutcome(summary)).toBe('partial');
  });

  it('전부 사라졌으면 success', () => {
    const summary = summarizeMutation(['a', 'b'], [{ id: 'z' }]);
    expect(mutationOutcome(summary)).toBe('success');
  });

  it('하나도 사라지지 않았으면(취소/실패) nothingDone', () => {
    const summary = summarizeMutation(['a', 'b'], [{ id: 'a' }, { id: 'b' }]);
    expect(summary.removedIds).toEqual([]);
    expect(mutationOutcome(summary)).toBe('nothingDone');
  });

  it('요청 id가 없으면 success(처리할 것이 없음)', () => {
    expect(mutationOutcome(summarizeMutation([], [{ id: 'a' }]))).toBe('success');
  });
});

describe('nothingDoneNotice', () => {
  it('예외가 없거나 시스템 다이얼로그 취소 문구면 일반 안내', () => {
    expect(nothingDoneNotice(null)).toEqual({ key: 'mutationNothingDone' });
    expect(nothingDoneNotice(new Error("User didn't grant write permission to requested files."))).toEqual({
      key: 'mutationNothingDone',
    });
    expect(nothingDoneNotice(new Error(''))).toEqual({ key: 'mutationNothingDone' });
  });

  it('그 밖의 예외는 네이티브 메시지를 그대로 담는다', () => {
    expect(nothingDoneNotice(new Error('Invalid relative path: Pictures/a.b/'))).toEqual({
      key: 'mutationFailed',
      detail: 'Invalid relative path: Pictures/a.b/',
    });
    expect(nothingDoneNotice('plain string error')).toEqual({ key: 'mutationFailed', detail: 'plain string error' });
  });

  it('너무 긴 메시지는 잘라낸다', () => {
    const notice = nothingDoneNotice(new Error('x'.repeat(500)));
    expect(notice.key).toBe('mutationFailed');
    expect(notice.key === 'mutationFailed' && notice.detail.length).toBeLessThanOrEqual(141);
  });
});
