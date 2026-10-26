import { daysUntilExpiry, sortTrashItems, toTrashItem, type TrashItem } from '../trash';

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
