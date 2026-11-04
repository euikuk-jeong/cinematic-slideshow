import { BUNDLED_MUSIC_TRACKS } from '../../assets/music/bundled';
import { fadeVolumeAt, findBundledMusicFile, formatMusicTrackLabel, resolveMusicCoverSource } from './musicPlaylist';

describe('fadeVolumeAt', () => {
  test('시작·끝 시점은 from·to이고, 중간은 dB가 일정하게 변하는 지수 보간이다', () => {
    expect(fadeVolumeAt(1, 0.1, 0, 1000)).toBe(1);
    // 1→0.1(-20dB)의 절반 시점은 -10dB = sqrt(0.1) — 선형 보간(0.55)보다 낮다.
    expect(fadeVolumeAt(1, 0.1, 500, 1000)).toBeCloseTo(Math.sqrt(0.1));
    expect(fadeVolumeAt(1, 0.1, 1000, 1000)).toBe(0.1);
  });

  test('구간마다 같은 비율(dB)로 변한다 — 끝에서 뚝 떨어지지 않음', () => {
    const at = (ms: number) => fadeVolumeAt(1, 0.1, ms, 9000);
    expect(at(3000) / at(0)).toBeCloseTo(at(9000) / at(6000));
  });

  test('볼륨을 올릴 때도 같은 곡선을 쓴다', () => {
    expect(fadeVolumeAt(0.1, 1, 500, 1000)).toBeCloseTo(Math.sqrt(0.1));
  });

  test('한쪽이 0이면 로그 보간이 불가해 선형으로 옮겨간다', () => {
    expect(fadeVolumeAt(0, 1, 500, 1000)).toBeCloseTo(0.5);
    expect(fadeVolumeAt(1, 0, 500, 1000)).toBeCloseTo(0.5);
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
