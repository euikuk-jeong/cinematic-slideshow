import { parseMoveTargets } from '../moveTargets';

const cache = JSON.stringify([
  { id: '3', title: 'Zebra', thumbnailUri: 'x' },
  { id: '1', title: 'Camera', thumbnailUri: 'y' },
  { id: '2', title: 'Download', thumbnailUri: 'z' },
]);

describe('parseMoveTargets', () => {
  it('현재 앨범을 제외하고 제목순으로 정렬한다', () => {
    expect(parseMoveTargets(cache, '2')).toEqual([
      { id: '1', title: 'Camera' },
      { id: '3', title: 'Zebra' },
    ]);
  });

  it('캐시가 없으면 빈 목록', () => {
    expect(parseMoveTargets(null, '1')).toEqual([]);
  });

  it('JSON이 아니면 경고를 남기고 빈 목록', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(parseMoveTargets('not json', '1')).toEqual([]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('배열이 아니거나 id/title이 문자열이 아닌 항목은 건너뛴다', () => {
    expect(parseMoveTargets('{"a":1}', '1')).toEqual([]);
    const mixed = JSON.stringify([{ id: 5, title: 'x' }, { id: '6' }, null, { id: '7', title: 'ok' }]);
    expect(parseMoveTargets(mixed, '1')).toEqual([{ id: '7', title: 'ok' }]);
  });
});
