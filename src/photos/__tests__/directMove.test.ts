import { folderPathToDirectory, isDirectMoveDestinationAllowed, uriToFilePath } from '../directMove';

describe('uriToFilePath', () => {
  it('file:// URI를 디코딩된 절대 경로로 바꾼다(한글·공백 포함)', () => {
    expect(uriToFilePath('file:///storage/emulated/0/_MyData/Photo/a%20b.jpg')).toBe(
      '/storage/emulated/0/_MyData/Photo/a b.jpg'
    );
    expect(uriToFilePath('file:///storage/emulated/0/Pictures/%EC%97%AC%ED%96%89/x.jpg')).toBe(
      '/storage/emulated/0/Pictures/여행/x.jpg'
    );
  });

  it('절대 경로는 그대로 쓰고, content://·상대경로는 null', () => {
    expect(uriToFilePath('/storage/emulated/0/DCIM/x.jpg')).toBe('/storage/emulated/0/DCIM/x.jpg');
    expect(uriToFilePath('content://media/external/images/media/1')).toBeNull();
    expect(uriToFilePath('relative/path.jpg')).toBeNull();
  });

  it('잘못된 퍼센트 인코딩은 null', () => {
    expect(uriToFilePath('file:///storage/%E0%A4%A')).toBeNull();
  });
});

describe('folderPathToDirectory', () => {
  it('앨범 캐시의 folderPath를 폴더 절대 경로로 바꾼다', () => {
    expect(folderPathToDirectory('file:///storage/emulated/0/_MyData/Photo/_Private_2026')).toBe(
      '/storage/emulated/0/_MyData/Photo/_Private_2026'
    );
    expect(folderPathToDirectory('file:///storage/emulated/0/_MyData/Photo/')).toBe('/storage/emulated/0/_MyData/Photo');
  });

  it('없거나 해석할 수 없으면 null', () => {
    expect(folderPathToDirectory(undefined)).toBeNull();
    expect(folderPathToDirectory('')).toBeNull();
    expect(folderPathToDirectory('content://x')).toBeNull();
    expect(folderPathToDirectory('/')).toBeNull();
  });
});

describe('isDirectMoveDestinationAllowed', () => {
  it('일반 폴더와 Android/media는 허용', () => {
    expect(isDirectMoveDestinationAllowed('/storage/emulated/0/_MyData/Photo')).toBe(true);
    expect(isDirectMoveDestinationAllowed('/storage/emulated/0/Download')).toBe(true);
    expect(isDirectMoveDestinationAllowed('/storage/emulated/0/Android/media/com.a.b/x')).toBe(true);
  });

  it('Android/data·Android/obb는 OS 보호 영역이라 불허', () => {
    expect(isDirectMoveDestinationAllowed('/storage/emulated/0/Android/data/com.a.b/files')).toBe(false);
    expect(isDirectMoveDestinationAllowed('/storage/emulated/0/Android/OBB')).toBe(false);
  });
});
