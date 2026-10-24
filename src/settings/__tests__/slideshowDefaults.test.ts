import {
  FALLBACK_ORDER_MODE,
  FALLBACK_REPEAT_MODE,
  FALLBACK_SORT_CRITERION,
  FALLBACK_SORT_DIRECTION,
  FALLBACK_TRANSITION_INTERVAL_SEC,
  isOrderMode,
  isRepeatMode,
  isSortCriterion,
  isSortDirection,
  parseDefaultMusicTracks,
  parseTransitionIntervalSec,
  serializeDefaultMusicTracks,
  resolveSlideshowDefaults,
  TRANSITION_INTERVAL_MAX_SEC,
  TRANSITION_INTERVAL_MIN_SEC,
  type DefaultMusicTrack,
} from '../slideshowDefaults';

describe('parseTransitionIntervalSec', () => {
  test('null이면 fallback을 반환한다', () => {
    expect(parseTransitionIntervalSec(null)).toBe(FALLBACK_TRANSITION_INTERVAL_SEC);
  });

  test('숫자가 아니면 fallback을 반환한다', () => {
    expect(parseTransitionIntervalSec('abc')).toBe(FALLBACK_TRANSITION_INTERVAL_SEC);
  });

  test('범위 내 값은 반올림해 그대로 반환한다', () => {
    expect(parseTransitionIntervalSec('7')).toBe(7);
    expect(parseTransitionIntervalSec('6.6')).toBe(7);
  });

  test('최소/최대 범위를 벗어나면 clamp한다', () => {
    expect(parseTransitionIntervalSec('0')).toBe(TRANSITION_INTERVAL_MIN_SEC);
    expect(parseTransitionIntervalSec('999')).toBe(TRANSITION_INTERVAL_MAX_SEC);
  });
});

describe('타입 가드', () => {
  test('isOrderMode', () => {
    expect(isOrderMode('sequential')).toBe(true);
    expect(isOrderMode('random')).toBe(true);
    expect(isOrderMode('other')).toBe(false);
    expect(isOrderMode(null)).toBe(false);
  });

  test('isRepeatMode', () => {
    expect(isRepeatMode('once')).toBe(true);
    expect(isRepeatMode('loop')).toBe(true);
    expect(isRepeatMode('other')).toBe(false);
  });

  test('isSortCriterion', () => {
    expect(isSortCriterion('creation_time')).toBe(true);
    expect(isSortCriterion('filename')).toBe(true);
    expect(isSortCriterion('other')).toBe(false);
  });

  test('isSortDirection', () => {
    expect(isSortDirection('asc')).toBe(true);
    expect(isSortDirection('desc')).toBe(true);
    expect(isSortDirection('other')).toBe(false);
  });
});

describe('resolveSlideshowDefaults', () => {
  test('전부 null이면 fallback 값들을 반환한다', () => {
    expect(
      resolveSlideshowDefaults({
        transitionIntervalSec: null,
        orderMode: null,
        repeatMode: null,
        sortCriterion: null,
        sortDirection: null,
      })
    ).toEqual({
      transitionIntervalSec: FALLBACK_TRANSITION_INTERVAL_SEC,
      orderMode: FALLBACK_ORDER_MODE,
      repeatMode: FALLBACK_REPEAT_MODE,
      sortCriterion: FALLBACK_SORT_CRITERION,
      sortDirection: FALLBACK_SORT_DIRECTION,
    });
  });

  test('유효한 raw 값은 그대로 파싱해 반영한다', () => {
    expect(
      resolveSlideshowDefaults({
        transitionIntervalSec: '7',
        orderMode: 'random',
        repeatMode: 'once',
        sortCriterion: 'filename',
        sortDirection: 'desc',
      })
    ).toEqual({
      transitionIntervalSec: 7,
      orderMode: 'random',
      repeatMode: 'once',
      sortCriterion: 'filename',
      sortDirection: 'desc',
    });
  });

  test('알 수 없는 값이 섞여 있으면 그 항목만 fallback으로 대체한다', () => {
    expect(
      resolveSlideshowDefaults({
        transitionIntervalSec: '7',
        orderMode: 'garbage',
        repeatMode: 'once',
        sortCriterion: 'garbage',
        sortDirection: 'desc',
      })
    ).toEqual({
      transitionIntervalSec: 7,
      orderMode: FALLBACK_ORDER_MODE,
      repeatMode: 'once',
      sortCriterion: FALLBACK_SORT_CRITERION,
      sortDirection: 'desc',
    });
  });
});

describe('parseDefaultMusicTracks', () => {
  const calm: DefaultMusicTrack = {
    sourceType: 'bundled',
    sourceValue: 'calm',
    title: 'Calm Piano',
    artist: 'Alex',
    coverUri: null,
  };

  test('null이거나 비어 있으면 빈 목록이다', () => {
    expect(parseDefaultMusicTracks(null)).toEqual([]);
    expect(parseDefaultMusicTracks('[]')).toEqual([]);
  });

  test('JSON이 깨졌거나 배열이 아니면 빈 목록이다', () => {
    expect(parseDefaultMusicTracks('{not json')).toEqual([]);
    expect(parseDefaultMusicTracks('{"a":1}')).toEqual([]);
  });

  test('serialize한 값을 그대로 복원한다(순서 유지)', () => {
    const device: DefaultMusicTrack = {
      sourceType: 'device',
      sourceValue: '42',
      title: null,
      artist: null,
      coverUri: 'file:///c.jpg',
    };
    const tracks = [calm, device];
    expect(parseDefaultMusicTracks(serializeDefaultMusicTracks(tracks))).toEqual(tracks);
  });

  test('알 수 없는 sourceType·빈 sourceValue·객체가 아닌 항목은 버린다', () => {
    const raw = JSON.stringify([calm, { ...calm, sourceType: 'cloud' }, { ...calm, sourceValue: '' }, 3, null]);
    expect(parseDefaultMusicTracks(raw)).toEqual([calm]);
  });

  test('같은 트랙이 중복되면 처음 것만 남긴다', () => {
    expect(parseDefaultMusicTracks(JSON.stringify([calm, { ...calm, title: 'dup' }]))).toEqual([calm]);
  });

  test('문자열이 아닌 title/artist/coverUri는 null로 처리한다', () => {
    const raw = JSON.stringify([{ sourceType: 'device', sourceValue: '1', title: 5, artist: {}, coverUri: false }]);
    expect(parseDefaultMusicTracks(raw)).toEqual([
      { sourceType: 'device', sourceValue: '1', title: null, artist: null, coverUri: null },
    ]);
  });
});
