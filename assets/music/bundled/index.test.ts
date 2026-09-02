import { BUNDLED_MUSIC_CATEGORY_ORDER, BUNDLED_MUSIC_TRACKS } from './index';

describe('BUNDLED_MUSIC_TRACKS', () => {
  it('has exactly 10 tracks', () => {
    expect(BUNDLED_MUSIC_TRACKS).toHaveLength(10);
  });

  it('has a unique id per track (DB source_value로 쓰이므로 카테고리 중복과 무관하게 고유해야 함)', () => {
    const ids = BUNDLED_MUSIC_TRACKS.map((track) => track.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has every category represented', () => {
    const categories = new Set(BUNDLED_MUSIC_TRACKS.map((track) => track.category));
    expect(categories).toEqual(new Set(BUNDLED_MUSIC_CATEGORY_ORDER));
  });

  it('resolves a bundled asset module for every track', () => {
    for (const track of BUNDLED_MUSIC_TRACKS) {
      expect(track.file).toBeDefined();
      expect(track.cover).toBeDefined();
      expect(track.title.length).toBeGreaterThan(0);
      expect(track.artist.length).toBeGreaterThan(0);
      // sourceUrl은 출처 확인 전까지 빈 문자열일 수 있다(doc/todo/todo.md 참고) — 값이
      // 있다면 반드시 pixabay 링크여야 한다.
      if (track.sourceUrl) expect(track.sourceUrl).toMatch(/^https:\/\/pixabay\.com\//);
    }
  });
});
