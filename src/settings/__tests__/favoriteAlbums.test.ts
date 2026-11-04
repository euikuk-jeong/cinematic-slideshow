import {
  addFavoriteDirectories,
  parseFavoriteAlbumDirectories,
  partitionFavoriteAlbums,
  removeFavoriteDirectories,
  replaceFavoriteDirectory,
} from '../favoriteAlbums';

describe('parseFavoriteAlbumDirectories', () => {
  it('저장값이 없거나 형식이 틀리면 빈 목록', () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(parseFavoriteAlbumDirectories(null)).toEqual([]);
    expect(parseFavoriteAlbumDirectories('not json')).toEqual([]);
    expect(parseFavoriteAlbumDirectories('{"a":1}')).toEqual([]);
  });

  it('문자열만 남기고 중복을 없앤다', () => {
    expect(parseFavoriteAlbumDirectories(JSON.stringify(['/a', 3, '', '/a', '/b']))).toEqual(['/a', '/b']);
  });
});

describe('add / remove / replace', () => {
  it('추가는 이미 있는 경로를 다시 넣지 않는다', () => {
    expect(addFavoriteDirectories(['/a'], ['/a', '/b'])).toEqual(['/a', '/b']);
  });

  it('제거는 주어진 경로만 뺀다', () => {
    expect(removeFavoriteDirectories(['/a', '/b', '/c'], ['/b', '/x'])).toEqual(['/a', '/c']);
  });

  it('경로 교체는 즐겨찾기였을 때만 일어난다', () => {
    expect(replaceFavoriteDirectory(['/a', '/b'], '/a', '/z')).toEqual(['/b', '/z']);
    expect(replaceFavoriteDirectory(['/b'], '/a', '/z')).toEqual(['/b']);
  });
});

describe('partitionFavoriteAlbums', () => {
  const albums = [
    { id: '1', dir: '/x' },
    { id: '2', dir: '/y' },
    { id: '3', dir: null },
    { id: '4', dir: '/z' },
  ];

  it('입력(정렬) 순서를 유지하며 즐겨찾기와 나머지로 나눈다', () => {
    const result = partitionFavoriteAlbums(albums, ['/z', '/x'], (album) => album.dir);
    expect(result.favorites.map((a) => a.id)).toEqual(['1', '4']);
    expect(result.others.map((a) => a.id)).toEqual(['2', '3']);
  });

  it('경로를 모르는 앨범과 목록에 없는 즐겨찾기 경로는 무시한다', () => {
    const result = partitionFavoriteAlbums(albums, ['/gone'], (album) => album.dir);
    expect(result.favorites).toEqual([]);
    expect(result.others).toHaveLength(4);
  });
});
