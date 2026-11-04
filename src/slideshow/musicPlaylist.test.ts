import { BUNDLED_MUSIC_TRACKS } from '../../assets/music/bundled';
import { fadeVolumeAt, findBundledMusicFile, formatMusicTrackLabel, resolveMusicCoverSource } from './musicPlaylist';

describe('fadeVolumeAt', () => {
  test('시작·중간·끝 시점에 선형으로 옮겨간다', () => {
    expect(fadeVolumeAt(1, 0.5, 0, 1000)).toBe(1);
    expect(fadeVolumeAt(1, 0.5, 500, 1000)).toBeCloseTo(0.75);
    expect(fadeVolumeAt(1, 0.5, 1000, 1000)).toBe(0.5);
  });

  test('지속시간을 넘기면 목표값에 머문다(볼륨을 다시 올릴 때도 동일)', () => {
    expect(fadeVolumeAt(1, 0.5, 5000, 1000)).toBe(0.5);
    expect(fadeVolumeAt(0.5, 1, 5000, 1000)).toBe(1);
  });

  test('지속시간이 0 이하면 바로 목표값이고, 결과는 0~1 범위로 고정된다', () => {
    expect(fadeVolumeAt(1, 0.5, 0, 0)).toBe(0.5);
    expect(fadeVolumeAt(1, 2, 1000, 1000)).toBe(1);
    expect(fadeVolumeAt(0.2, -1, 1000, 1000)).toBe(0);
  });
});

test('존재하는 id는 해당 곡의 file(require 결과)을 반환한다', () => {
  const first = BUNDLED_MUSIC_TRACKS[0];
  expect(findBundledMusicFile(first.id)).toBe(first.file);
});

test('존재하지 않는 id는 null을 반환한다', () => {
  expect(findBundledMusicFile('no-such-track')).toBeNull();
});

test('번들 트랙의 커버는 카탈로그의 정적 커버를 반환한다', () => {
  const first = BUNDLED_MUSIC_TRACKS[0];
  expect(resolveMusicCoverSource({ sourceType: 'bundled', sourceValue: first.id, coverUri: null })).toBe(first.cover);
});

test('카탈로그에 없는 번들 id의 커버는 null이다', () => {
  expect(resolveMusicCoverSource({ sourceType: 'bundled', sourceValue: 'no-such-track', coverUri: null })).toBeNull();
});

test('기기 트랙의 커버는 DB에 저장된 coverUri를 그대로 반환한다', () => {
  expect(resolveMusicCoverSource({ sourceType: 'device', sourceValue: 'asset-1', coverUri: 'file:///cover.jpg' })).toBe(
    'file:///cover.jpg'
  );
});

test('제목+아티스트가 있으면 "제목 · 아티스트" 형식으로 표시한다', () => {
  expect(formatMusicTrackLabel({ title: 'Calm Piano', artist: 'Alex Morgan', sourceValue: 'calm' })).toBe(
    'Calm Piano · Alex Morgan'
  );
});

test('아티스트가 없으면 제목만 표시한다', () => {
  expect(formatMusicTrackLabel({ title: 'Calm Piano', artist: null, sourceValue: 'calm' })).toBe('Calm Piano');
});

test('제목이 없으면(태그 못 읽은 기기 음악) sourceValue로 대체한다', () => {
  expect(formatMusicTrackLabel({ title: null, artist: null, sourceValue: 'asset-123' })).toBe('asset-123');
});
