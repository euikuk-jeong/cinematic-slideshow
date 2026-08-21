export type BundledMusicCategory = 'calm' | 'emotional' | 'upbeat' | 'warm_nostalgic' | 'epic';

export interface BundledMusicTrack {
  category: BundledMusicCategory;
  file: number;
  title: string;
  artist: string;
  sourceUrl: string;
}

export const BUNDLED_MUSIC_TRACKS: readonly BundledMusicTrack[] = [
  {
    category: 'calm',
    file: require('./alex-morgan-calm-piano-541028.mp3'),
    title: 'Calm Piano',
    artist: 'Alex Morgan',
    sourceUrl: 'https://pixabay.com/music/modern-classical-calm-piano-541028/',
  },
  {
    category: 'emotional',
    file: require('./paulyudin-emotional-emotional-music-573976.mp3'),
    title: 'Emotional',
    artist: 'PaulYudin',
    sourceUrl: 'https://pixabay.com/music/build-up-scenes-emotional-emotional-music-573976/',
  },
  {
    category: 'upbeat',
    file: require('./jonasblakewood-summer-pop-546980.mp3'),
    title: 'Summer Pop',
    artist: 'JonasBlakewood',
    sourceUrl: 'https://pixabay.com/music/pop-summer-pop-546980/',
  },
  {
    category: 'warm_nostalgic',
    file: require('./andriig-warm-nostalgic-sentimental-music-471262.mp3'),
    title: 'Warm Nostalgic Sentimental Music',
    artist: 'andriig',
    sourceUrl: 'https://pixabay.com/music/acoustic-group-warm-nostalgic-sentimental-music-471262/',
  },
  {
    category: 'epic',
    file: require('./paulyudin-epic-piano-154655.mp3'),
    title: 'Epic Piano',
    artist: 'PaulYudin',
    sourceUrl: 'https://pixabay.com/music/main-title-epic-piano-154655/',
  },
];
