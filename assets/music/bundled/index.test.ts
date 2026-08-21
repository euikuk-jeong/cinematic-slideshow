import { BUNDLED_MUSIC_TRACKS } from './index';

describe('BUNDLED_MUSIC_TRACKS', () => {
  it('has exactly 5 tracks', () => {
    expect(BUNDLED_MUSIC_TRACKS).toHaveLength(5);
  });

  it('has a unique category per track', () => {
    const categories = BUNDLED_MUSIC_TRACKS.map((track) => track.category);
    expect(new Set(categories).size).toBe(categories.length);
  });

  it('resolves a bundled asset module for every track', () => {
    for (const track of BUNDLED_MUSIC_TRACKS) {
      expect(track.file).toBeDefined();
      expect(track.title.length).toBeGreaterThan(0);
      expect(track.artist.length).toBeGreaterThan(0);
      expect(track.sourceUrl).toMatch(/^https:\/\/pixabay\.com\//);
    }
  });
});
