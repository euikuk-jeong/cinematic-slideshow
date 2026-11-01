import { daysUntilExpiry, overdueItems, sortTrashItems, toTrashItem, withRetention, type TrashItem } from '../trash';

const DAY = 24 * 60 * 60 * 1000;
const base: TrashItem = {
  id: 'content://media/external/images/media/1',
  filename: 'a.jpg',
  isVideo: false,
  takenAt: null,
  modifiedAt: null,
  expiresAt: null,
  size: 0,
  relativePath: null,
};

describe('daysUntilExpiry', () => {
  const now = 1_000_000_000_000;

  it('남은 시간을 일 단위로 올림한다', () => {
    expect(daysUntilExpiry({ expiresAt: now + 29 * DAY + 1 }, now)).toBe(30);
    expect(daysUntilExpiry({ expiresAt: now + DAY }, now)).toBe(1);
    expect(daysUntilExpiry({ expiresAt: now + 1 }, now)).toBe(1);
  });

  it('이미 지났으면 0(음수 없음)', () => {
    expect(daysUntilExpiry({ expiresAt: now - 5 * DAY }, now)).toBe(0);
    expect(daysUntilExpiry({ expiresAt: now }, now)).toBe(0);
  });

  it('만료 시각을 모르면 null', () => {
    expect(daysUntilExpiry({ expiresAt: null }, now)).toBeNull();
  });
});

describe('toTrashItem', () => {
  it('네이티브 응답 한 줄을 TrashItem으로 바꾼다', () => {
    expect(
      toTrashItem({
        id: 'content://media/external/video/media/9',
        filename: 'v.mp4',
        isVideo: true,
        takenAt: 100,
        modifiedAt: 200,
        expiresAt: 300,
        size: 4096,
        relativePath: 'Movies/Trip/',
      })
    ).toEqual({
      id: 'content://media/external/video/media/9',
      filename: 'v.mp4',
      isVideo: true,
      takenAt: 100,
      modifiedAt: 200,
      expiresAt: 300,
      size: 4096,
      relativePath: 'Movies/Trip/',
    });
  });

  it('빠진·잘못된 필드는 안전한 기본값으로 채운다', () => {
    expect(toTrashItem({ id: 'x', filename: 5, isVideo: 'yes', takenAt: 'n', expiresAt: NaN })).toEqual({
      id: 'x',
      filename: null,
      isVideo: false,
      takenAt: null,
      modifiedAt: null,
      expiresAt: null,
      size: 0,
      relativePath: null,
    });
  });

  it('id가 없거나 객체가 아니면 버린다', () => {
    expect(toTrashItem(null)).toBeNull();
    expect(toTrashItem('str')).toBeNull();
    expect(toTrashItem({ filename: 'a' })).toBeNull();
    expect(toTrashItem({ id: '' })).toBeNull();
  });
});

describe('sortTrashItems', () => {
  it('곧 지워질 항목이 먼저, 만료 시각을 모르는 항목은 뒤', () => {
    const items = [
      { ...base, id: 'late', expiresAt: 300 },
      { ...base, id: 'unknown', expiresAt: null },
      { ...base, id: 'soon', expiresAt: 100 },
    ];
    expect(sortTrashItems(items).map((item) => item.id)).toEqual(['soon', 'late', 'unknown']);
  });

  it('원본 배열을 바꾸지 않는다', () => {
    const items = [
      { ...base, id: 'b', expiresAt: 2 },
      { ...base, id: 'a', expiresAt: 1 },
    ];
    sortTrashItems(items);
    expect(items.map((item) => item.id)).toEqual(['b', 'a']);
  });
});

describe('withRetention', () => {
  const now = 1_000_000_000_000;
  // 휴지통으로 보낸 지 3일 지난 항목: OS 만료는 27일 뒤.
  const item = { ...base, expiresAt: now + 27 * DAY };

  it('30일이면 만료 시각을 그대로 둔다', () => {
    expect(withRetention([item], 30)[0].expiresAt).toBe(item.expiresAt);
  });

  it('더 짧은 기간이면 보낸 시각부터 그 기간만큼으로 만료를 당긴다', () => {
    // 7일 보관: 보낸 지 3일 → 4일 남음.
    expect(daysUntilExpiry(withRetention([item], 7)[0], now)).toBe(4);
    expect(daysUntilExpiry(withRetention([item], 14)[0], now)).toBe(11);
  });

  it('30일보다 길게 줘도 OS 만료보다 늦추지 않는다', () => {
    expect(withRetention([item], 90)[0].expiresAt).toBe(item.expiresAt);
  });

  it('만료를 모르는 항목은 그대로 두고 원본 배열은 바꾸지 않는다', () => {
    const unknown = { ...base, expiresAt: null };
    const input = [item, unknown];
    const result = withRetention(input, 7);
    expect(result[1].expiresAt).toBeNull();
    expect(input[0].expiresAt).toBe(now + 27 * DAY);
  });
});

describe('overdueItems', () => {
  const now = 1_000_000_000_000;

  it('만료 시각이 지났거나 지금인 항목만 고른다', () => {
    const past = { ...base, id: 'past', expiresAt: now - 1 };
    const exact = { ...base, id: 'exact', expiresAt: now };
    const future = { ...base, id: 'future', expiresAt: now + 1 };
    expect(overdueItems([past, exact, future], now).map((i) => i.id)).toEqual(['past', 'exact']);
  });

  it('만료를 모르는 항목은 지난 것으로 보지 않는다', () => {
    expect(overdueItems([{ ...base, expiresAt: null }], now)).toEqual([]);
  });

  it('7일 보관에서 8일 전에 보낸 항목은 기간 경과다', () => {
    // 8일 전에 보냄 → OS 만료는 22일 뒤 → 7일 기준으로 당기면 1일 전.
    const sent8DaysAgo = { ...base, expiresAt: now + 22 * DAY };
    expect(overdueItems(withRetention([sent8DaysAgo], 7), now)).toHaveLength(1);
    expect(overdueItems(withRetention([sent8DaysAgo], 30), now)).toHaveLength(0);
  });
});
