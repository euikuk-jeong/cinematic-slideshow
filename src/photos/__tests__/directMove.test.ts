import {
  directoryToDocId,
  docIdToDirectory,
  findCoveringGrant,
  folderPathToDirectory,
  grantDirectoryFor,
  isDirectMoveDestinationAllowed,
} from '../directMove';

describe('folderPathToDirectory', () => {
  it('앨범 캐시의 folderPath를 디코딩된 폴더 절대 경로로 바꾼다', () => {
    expect(folderPathToDirectory('file:///storage/emulated/0/_MyData/Photo/_Private_2026')).toBe(
      '/storage/emulated/0/_MyData/Photo/_Private_2026'
    );
    expect(folderPathToDirectory('file:///storage/emulated/0/_MyData/Photo/')).toBe('/storage/emulated/0/_MyData/Photo');
    expect(folderPathToDirectory('file:///storage/emulated/0/Pictures/%EC%97%AC%ED%96%89')).toBe(
      '/storage/emulated/0/Pictures/여행'
    );
  });

  it('없거나 해석할 수 없으면 null', () => {
    expect(folderPathToDirectory(undefined)).toBeNull();
    expect(folderPathToDirectory('')).toBeNull();
    expect(folderPathToDirectory('content://x')).toBeNull();
    expect(folderPathToDirectory('/')).toBeNull();
    expect(folderPathToDirectory('file:///storage/%E0%A4%A')).toBeNull();
  });
});

describe('directoryToDocId / docIdToDirectory', () => {
  it('내장 저장소 경로와 SAF 문서 id를 서로 바꾼다', () => {
    expect(directoryToDocId('/storage/emulated/0/_MyData/Photo')).toBe('primary:_MyData/Photo');
    expect(directoryToDocId('/sdcard/_MyData')).toBe('primary:_MyData');
    expect(directoryToDocId('/storage/emulated/0')).toBe('primary:');
    expect(docIdToDirectory('primary:_MyData/Photo')).toBe('/storage/emulated/0/_MyData/Photo');
    expect(docIdToDirectory('primary:')).toBe('/storage/emulated/0');
  });

  it('내장 저장소가 아니면 null(SD 카드·다른 사용자 공간)', () => {
    expect(directoryToDocId('/storage/1A2B-3C4D/DCIM')).toBeNull();
    expect(directoryToDocId('/storage/emulated/10/DCIM')).toBeNull();
    expect(docIdToDirectory('1A2B-3C4D:DCIM')).toBeNull();
    expect(docIdToDirectory('nonsense')).toBeNull();
  });
});

describe('grantDirectoryFor', () => {
  it('최상위 폴더에서 권한을 받는다', () => {
    expect(grantDirectoryFor('/storage/emulated/0/_MyData/Photo/_Private_2026')).toBe('/storage/emulated/0/_MyData');
    expect(grantDirectoryFor('/storage/emulated/0/_MyData')).toBe('/storage/emulated/0/_MyData');
    expect(grantDirectoryFor('/sdcard/Books/x')).toBe('/sdcard/Books');
  });

  it('Download·Android 아래는 선택기가 루트를 막으므로 한 단계 더 내려간다', () => {
    expect(grantDirectoryFor('/storage/emulated/0/Download/Trip/2026')).toBe('/storage/emulated/0/Download/Trip');
    expect(grantDirectoryFor('/storage/emulated/0/Android/media/com.a/x')).toBe('/storage/emulated/0/Android/media');
  });

  it('고를 수 있는 폴더가 없으면 null', () => {
    expect(grantDirectoryFor('/storage/emulated/0')).toBeNull();
    expect(grantDirectoryFor('/storage/emulated/0/Download')).toBeNull();
    expect(grantDirectoryFor('/storage/emulated/0/download')).toBeNull();
    expect(grantDirectoryFor('/storage/emulated/0/Android')).toBeNull();
    expect(grantDirectoryFor('/storage/emulated/0/Android/data/com.a.b/files')).toBeNull();
    expect(grantDirectoryFor('/storage/emulated/0/Android/OBB')).toBeNull();
    expect(grantDirectoryFor('/storage/1A2B-3C4D/DCIM')).toBeNull();
  });

  it('isDirectMoveDestinationAllowed는 권한을 받을 폴더가 있는지와 같다', () => {
    expect(isDirectMoveDestinationAllowed('/storage/emulated/0/_MyData/Photo')).toBe(true);
    expect(isDirectMoveDestinationAllowed('/storage/emulated/0/Download')).toBe(false);
    expect(isDirectMoveDestinationAllowed('/storage/emulated/0/Android/data/x')).toBe(false);
  });
});

describe('findCoveringGrant', () => {
  it('대상 폴더를 포함하는 권한과 그 아래 대상 문서 id를 돌려준다', () => {
    expect(findCoveringGrant(['primary:Books', 'primary:_MyData'], '/storage/emulated/0/_MyData/Photo/New')).toEqual({
      treeDocId: 'primary:_MyData',
      destinationDocId: 'primary:_MyData/Photo/New',
    });
  });

  it('권한 폴더 자체도 포함으로 본다', () => {
    expect(findCoveringGrant(['primary:_MyData'], '/storage/emulated/0/_MyData')).toEqual({
      treeDocId: 'primary:_MyData',
      destinationDocId: 'primary:_MyData',
    });
  });

  it('대소문자는 구분하지 않되 권한 폴더 표기는 네이티브가 준 그대로 쓴다', () => {
    expect(findCoveringGrant(['primary:_mydata'], '/storage/emulated/0/_MyData/Photo')).toEqual({
      treeDocId: 'primary:_mydata',
      destinationDocId: 'primary:_mydata/Photo',
    });
  });

  it('이름이 앞부분만 같은 형제 폴더나 하위 폴더 권한은 포함으로 보지 않는다', () => {
    expect(findCoveringGrant(['primary:_My'], '/storage/emulated/0/_MyData/Photo')).toBeNull();
    expect(findCoveringGrant(['primary:_MyData/Photo/Sub'], '/storage/emulated/0/_MyData/Photo')).toBeNull();
    expect(findCoveringGrant([], '/storage/emulated/0/_MyData')).toBeNull();
    expect(findCoveringGrant(['1A2B-3C4D:DCIM'], '/storage/emulated/0/DCIM')).toBeNull();
  });
});
