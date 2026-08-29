export type BundledMusicCategory = 'calm' | 'emotional' | 'upbeat' | 'warm_nostalgic' | 'epic';

export interface BundledMusicTrack {
  category: BundledMusicCategory;
  file: number;
  cover: number;
  title: string;
  artist: string;
  sourceUrl: string;
}

// 커버는 각 mp3의 임베디드 ID3 커버를 빌드 타임에 한 번 추출해 정적 이미지로 저장한 것
// (스크립트 실행 결과, ./covers/*.jpg) — 런타임에 태그를 파싱하지 않는다. 번들 트랙은
// 고정된 소수 집합이라 파싱 대상이 아니라 에셋 관리 대상으로 취급(기기 음악과 다름).
export const BUNDLED_MUSIC_TRACKS: readonly BundledMusicTrack[] = [
  {
    category: 'calm',
    file: require('./alex-morgan-calm-piano-541028.mp3'),
    cover: require('./covers/calm.jpg'),
    title: 'Calm Piano',
    artist: 'Alex Morgan',
    sourceUrl: 'https://pixabay.com/music/modern-classical-calm-piano-541028/',
  },
  {
    category: 'emotional',
    file: require('./paulyudin-emotional-emotional-music-573976.mp3'),
    cover: require('./covers/emotional.jpg'),
    title: 'Emotional',
    artist: 'PaulYudin',
    sourceUrl: 'https://pixabay.com/music/build-up-scenes-emotional-emotional-music-573976/',
  },
  {
    category: 'upbeat',
    file: require('./jonasblakewood-summer-pop-546980.mp3'),
    cover: require('./covers/upbeat.jpg'),
    title: 'Summer Pop',
    artist: 'JonasBlakewood',
    sourceUrl: 'https://pixabay.com/music/pop-summer-pop-546980/',
  },
  {
    category: 'warm_nostalgic',
    file: require('./andriig-warm-nostalgic-sentimental-music-471262.mp3'),
    cover: require('./covers/warm_nostalgic.jpg'),
    title: 'Warm Nostalgic Sentimental Music',
    artist: 'andriig',
    sourceUrl: 'https://pixabay.com/music/acoustic-group-warm-nostalgic-sentimental-music-471262/',
  },
  {
    category: 'epic',
    file: require('./paulyudin-epic-piano-154655.mp3'),
    cover: require('./covers/epic.jpg'),
    title: 'Epic Piano',
    artist: 'PaulYudin',
    sourceUrl: 'https://pixabay.com/music/main-title-epic-piano-154655/',
  },
];
