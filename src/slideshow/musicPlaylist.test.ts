import { BUNDLED_MUSIC_TRACKS } from '../../assets/music/bundled';
import { findBundledMusicFile } from './musicPlaylist';

test('존재하는 id는 해당 곡의 file(require 결과)을 반환한다', () => {
  const first = BUNDLED_MUSIC_TRACKS[0];
  expect(findBundledMusicFile(first.id)).toBe(first.file);
});

test('존재하지 않는 id는 null을 반환한다', () => {
  expect(findBundledMusicFile('no-such-track')).toBeNull();
});
