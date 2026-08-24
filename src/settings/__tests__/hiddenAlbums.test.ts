import {
  notifyHiddenAlbumIdsChanged,
  parseHiddenAlbumIds,
  subscribeToHiddenAlbumIdsChanged,
} from '../hiddenAlbums';

describe('parseHiddenAlbumIds', () => {
  test('null이면 빈 배열', () => {
    expect(parseHiddenAlbumIds(null)).toEqual([]);
  });

  test('빈 문자열이면 빈 배열', () => {
    expect(parseHiddenAlbumIds('')).toEqual([]);
  });

  test('JSON이 아니면 빈 배열', () => {
    expect(parseHiddenAlbumIds('not json')).toEqual([]);
  });

  test('배열이 아닌 JSON이면 빈 배열', () => {
    expect(parseHiddenAlbumIds('{"a":1}')).toEqual([]);
  });

  test('문자열이 아닌 원소는 걸러낸다', () => {
    expect(parseHiddenAlbumIds('["a", 1, null, "b"]')).toEqual(['a', 'b']);
  });

  test('정상적인 문자열 배열은 그대로 반환', () => {
    expect(parseHiddenAlbumIds('["a", "b"]')).toEqual(['a', 'b']);
  });
});

describe('subscribeToHiddenAlbumIdsChanged / notifyHiddenAlbumIdsChanged', () => {
  test('notify 시 구독한 리스너가 호출된다', () => {
    const listener = jest.fn();
    const unsubscribe = subscribeToHiddenAlbumIdsChanged(listener);

    notifyHiddenAlbumIdsChanged();

    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  test('구독 해제 후에는 호출되지 않는다', () => {
    const listener = jest.fn();
    const unsubscribe = subscribeToHiddenAlbumIdsChanged(listener);
    unsubscribe();

    notifyHiddenAlbumIdsChanged();

    expect(listener).not.toHaveBeenCalled();
  });
});
