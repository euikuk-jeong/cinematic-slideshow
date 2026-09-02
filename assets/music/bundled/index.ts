export type BundledMusicCategory = 'calm' | 'emotional' | 'upbeat' | 'warm_nostalgic' | 'epic';

// 픽커 UI에서 카테고리 섹션을 항상 이 순서로 노출한다.
export const BUNDLED_MUSIC_CATEGORY_ORDER: readonly BundledMusicCategory[] = [
  'calm',
  'emotional',
  'upbeat',
  'warm_nostalgic',
  'epic',
];

export interface BundledMusicTrack {
  // DB의 music_tracks.source_value로 저장되는 안정 식별자 — 카테고리당 곡이 하나였을 때는
  // category를 그대로 썼지만, 카테고리당 여러 곡이 생기면서 곡 단위 고유 id가 필요해졌다.
  // 기존 5곡은 이미 기기에 저장된 source_value('calm' 등)와의 호환을 위해 category와
  // 동일한 값을 그대로 id로 유지하고, 신규 곡만 `${category}_2`로 구분한다.
  id: string;
  category: BundledMusicCategory;
  file: number;
  cover: number;
  title: string;
  artist: string;
  // Pixabay 출처 페이지 — 확인 전인 곡은 빈 문자열(doc/todo/todo.md에 확인 필요 항목으로 남김).
  sourceUrl: string;
}

// 커버는 각 mp3의 임베디드 ID3 커버를 빌드 타임에 한 번 추출해 정적 이미지로 저장한 것
// (스크립트 실행 결과, ./covers/*.jpg|png) — 런타임에 태그를 파싱하지 않는다. 번들 트랙은
// 고정된 소수 집합이라 파싱 대상이 아니라 에셋 관리 대상으로 취급(기기 음악과 다름).
export const BUNDLED_MUSIC_TRACKS: readonly BundledMusicTrack[] = [
  {
    id: 'calm',
    category: 'calm',
    file: require('./alex-morgan-calm-piano-541028.mp3'),
    cover: require('./covers/calm.jpg'),
    title: 'Calm Piano',
    artist: 'Alex Morgan',
    sourceUrl: 'https://pixabay.com/music/modern-classical-calm-piano-541028/',
  },
  {
    id: 'calm_2',
    category: 'calm',
    file: require('./andriih-evening-calm-piano-580085.mp3'),
    cover: require('./covers/calm_2.jpg'),
    title: 'Evening Calm Piano',
    artist: 'andriih',
    sourceUrl: 'https://pixabay.com/music/small-drama-evening-calm-piano-580085/',
  },
  {
    id: 'emotional',
    category: 'emotional',
    file: require('./paulyudin-emotional-emotional-music-573976.mp3'),
    cover: require('./covers/emotional.jpg'),
    title: 'Emotional',
    artist: 'PaulYudin',
    sourceUrl: 'https://pixabay.com/music/build-up-scenes-emotional-emotional-music-573976/',
  },
  {
    id: 'emotional_2',
    category: 'emotional',
    file: require('./alex-morgan-emotional-545518.mp3'),
    cover: require('./covers/emotional_2.jpg'),
    title: 'Emotional',
    artist: 'Alex Morgan',
    sourceUrl: 'https://pixabay.com/music/beautiful-plays-emotional-545518/',
  },
  {
    id: 'upbeat',
    category: 'upbeat',
    file: require('./jonasblakewood-summer-pop-546980.mp3'),
    cover: require('./covers/upbeat.jpg'),
    title: 'Summer Pop',
    artist: 'JonasBlakewood',
    sourceUrl: 'https://pixabay.com/music/pop-summer-pop-546980/',
  },
  {
    id: 'upbeat_2',
    category: 'upbeat',
    file: require('./lightbeatsmusic-positive-dream-upbeat-pop-513937.mp3'),
    cover: require('./covers/upbeat_2.png'),
    title: 'Positive Dream Upbeat Pop',
    artist: 'LightBeatsMusic',
    sourceUrl: 'https://pixabay.com/music/pop-positive-dream-upbeat-pop-513937/',
  },
  {
    id: 'warm_nostalgic',
    category: 'warm_nostalgic',
    file: require('./andriig-warm-nostalgic-sentimental-music-471262.mp3'),
    cover: require('./covers/warm_nostalgic.jpg'),
    title: 'Warm Nostalgic Sentimental Music',
    artist: 'andriig',
    sourceUrl: 'https://pixabay.com/music/acoustic-group-warm-nostalgic-sentimental-music-471262/',
  },
  {
    id: 'warm_nostalgic_2',
    category: 'warm_nostalgic',
    file: require('./tunetank-nostalgic-acoustic-guitar-348939.mp3'),
    cover: require('./covers/warm_nostalgic_2.jpg'),
    title: 'Nostalgic Acoustic Guitar',
    artist: 'Tunetank',
    sourceUrl: 'https://pixabay.com/music/acoustic-group-nostalgic-acoustic-guitar-348939/',
  },
  {
    id: 'epic',
    category: 'epic',
    file: require('./paulyudin-epic-piano-154655.mp3'),
    cover: require('./covers/epic.jpg'),
    title: 'Epic Piano',
    artist: 'PaulYudin',
    sourceUrl: 'https://pixabay.com/music/main-title-epic-piano-154655/',
  },
  {
    id: 'epic_2',
    category: 'epic',
    file: require('./alex-morgan-majestic-triumphant-epic-music-583277.mp3'),
    cover: require('./covers/epic_2.jpg'),
    title: 'Majestic Triumphant Epic Music',
    artist: 'Alex Morgan',
    sourceUrl: 'https://pixabay.com/music/orchestral-majestic-triumphant-epic-music-583277/',
  },
];
