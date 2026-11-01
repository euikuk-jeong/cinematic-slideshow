import {
  DEFAULT_TRASH_ENABLED,
  DEFAULT_TRASH_RETENTION_DAYS,
  parseTrashEnabled,
  parseTrashRetentionDays,
  serializeTrashEnabled,
  TRASH_RETENTION_OPTIONS_DAYS,
} from '../trashPreference';

describe('parseTrashEnabled', () => {
  it('저장된 값이 없으면 기본값(켜짐)이다', () => {
    expect(DEFAULT_TRASH_ENABLED).toBe(true);
    expect(parseTrashEnabled(null)).toBe(true);
  });

  it('"0"만 끄고 "1"은 켠다', () => {
    expect(parseTrashEnabled('0')).toBe(false);
    expect(parseTrashEnabled('1')).toBe(true);
  });

  it('알 수 없는 값은 기본값으로 되돌린다', () => {
    expect(parseTrashEnabled('false')).toBe(true);
    expect(parseTrashEnabled('')).toBe(true);
  });

  it('serialize 결과를 다시 parse하면 같은 값이다', () => {
    expect(parseTrashEnabled(serializeTrashEnabled(true))).toBe(true);
    expect(parseTrashEnabled(serializeTrashEnabled(false))).toBe(false);
  });
});

describe('parseTrashRetentionDays', () => {
  it('값이 없으면 기본 30일이다', () => {
    expect(DEFAULT_TRASH_RETENTION_DAYS).toBe(30);
    expect(parseTrashRetentionDays(null)).toBe(30);
  });

  it('선택지에 있는 값만 인정한다', () => {
    for (const days of TRASH_RETENTION_OPTIONS_DAYS) {
      expect(parseTrashRetentionDays(String(days))).toBe(days);
    }
    expect(parseTrashRetentionDays('5')).toBe(30);
    // 안드로이드가 30일 뒤 자동 삭제하므로 그보다 긴 기간은 선택지가 아니다.
    expect(parseTrashRetentionDays('60')).toBe(30);
    expect(TRASH_RETENTION_OPTIONS_DAYS).toEqual([7, 14, 30]);
    expect(parseTrashRetentionDays('abc')).toBe(30);
    expect(parseTrashRetentionDays('')).toBe(30);
  });

  it('기본값은 선택지 안에 들어 있다', () => {
    expect(TRASH_RETENTION_OPTIONS_DAYS).toContain(DEFAULT_TRASH_RETENTION_DAYS);
  });
});
