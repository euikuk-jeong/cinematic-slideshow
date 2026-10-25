import {
  childDirectories,
  collectKnownDirectories,
  displayPath,
  isMediaStoreLocation,
  parentDirectory,
  planNewFolder,
  storageRootOf,
} from '../folderLocation';

const ROOT = '/storage/emulated/0';

describe('storageRootOf', () => {
  it('내부 저장소 루트를 찾는다(사용자 번호·sdcard 별칭 포함)', () => {
    expect(storageRootOf(`${ROOT}/DCIM/Camera`)).toBe(ROOT);
    expect(storageRootOf('/storage/emulated/10/Pictures')).toBe('/storage/emulated/10');
    expect(storageRootOf('/sdcard/Pictures')).toBe('/sdcard');
    expect(storageRootOf('/data/user/0/x')).toBeNull();
  });
});

describe('collectKnownDirectories', () => {
  it('앨범 폴더와 그 조상(저장소 루트 아래)을 모으고 표준 미디어 폴더를 항상 포함한다', () => {
    const known = collectKnownDirectories([
      `file://${ROOT}/_MyData/Photo/_Private_2026`,
      `file://${ROOT}/Pictures/%EA%B0%80%EC%A1%B1`,
      undefined,
    ]);
    expect(known).toEqual(
      expect.arrayContaining([
        ROOT,
        `${ROOT}/Pictures`,
        `${ROOT}/DCIM`,
        `${ROOT}/Movies`,
        `${ROOT}/_MyData`,
        `${ROOT}/_MyData/Photo`,
        `${ROOT}/_MyData/Photo/_Private_2026`,
        `${ROOT}/Pictures/가족`,
      ])
    );
  });

  it('경로가 하나도 없어도 기본 저장소의 표준 폴더를 돌려준다', () => {
    expect(collectKnownDirectories([])).toEqual(
      expect.arrayContaining([ROOT, `${ROOT}/Pictures`, `${ROOT}/DCIM`, `${ROOT}/Movies`])
    );
  });

  it('중복 없이 정렬해서 돌려준다', () => {
    const known = collectKnownDirectories([`file://${ROOT}/Pictures/a`, `file://${ROOT}/Pictures/a`]);
    expect(new Set(known).size).toBe(known.length);
  });
});

describe('parentDirectory / childDirectories / displayPath', () => {
  it('상위 폴더는 저장소 루트에서 멈춘다', () => {
    expect(parentDirectory(`${ROOT}/Pictures/가족`)).toBe(`${ROOT}/Pictures`);
    expect(parentDirectory(`${ROOT}/Pictures`)).toBe(ROOT);
    expect(parentDirectory(ROOT)).toBeNull();
  });

  it('바로 아래 하위 폴더만 돌려준다', () => {
    const known = collectKnownDirectories([`file://${ROOT}/Pictures/a/b`]);
    expect(childDirectories(known, `${ROOT}/Pictures`)).toEqual([`${ROOT}/Pictures/a`]);
  });

  it('화면 표시 경로는 저장소 루트를 뗀다', () => {
    expect(displayPath(`${ROOT}/Pictures/가족`)).toBe('/Pictures/가족');
    expect(displayPath(ROOT)).toBe('/');
  });
});

describe('isMediaStoreLocation / planNewFolder', () => {
  it('Pictures와 그 하위(허용 글자만)는 MediaStore로 만들 수 있다', () => {
    expect(isMediaStoreLocation(`${ROOT}/Pictures`)).toBe(true);
    expect(isMediaStoreLocation(`${ROOT}/Pictures/가족 사진`)).toBe(true);
  });

  it('Pictures 밖이거나 라이브러리가 못 받는 글자(점 등)가 낀 구간이 있으면 아니다', () => {
    expect(isMediaStoreLocation(`${ROOT}/DCIM`)).toBe(false);
    expect(isMediaStoreLocation(`${ROOT}/_MyData/Photo`)).toBe(false);
    expect(isMediaStoreLocation(`${ROOT}/Pictures/a.b`)).toBe(false);
    expect(isMediaStoreLocation(ROOT)).toBe(false);
  });

  it('Pictures 바로 아래 새 폴더는 이름만, 하위 위치는 하위 경로를 붙여 MediaStore로 만든다', () => {
    expect(planNewFolder(`${ROOT}/Pictures`, '여행')).toEqual({ kind: 'mediaStore', folderName: '여행' });
    expect(planNewFolder(`${ROOT}/Pictures/가족`, '2024')).toEqual({ kind: 'mediaStore', folderName: '가족/2024' });
  });

  it('그 밖의 위치는 파일 직접 이동(모든 파일 접근)으로 만든다', () => {
    expect(planNewFolder(`${ROOT}/DCIM`, 'Trip')).toEqual({ kind: 'direct', destinationDir: `${ROOT}/DCIM/Trip` });
    expect(planNewFolder(`${ROOT}/_MyData/Photo`, '2026')).toEqual({
      kind: 'direct',
      destinationDir: `${ROOT}/_MyData/Photo/2026`,
    });
    expect(planNewFolder(`${ROOT}/Pictures/a.b`, 'x')).toEqual({
      kind: 'direct',
      destinationDir: `${ROOT}/Pictures/a.b/x`,
    });
  });
});
