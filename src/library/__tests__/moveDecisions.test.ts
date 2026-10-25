import { decideNewFolderMove, decideTargetMove, directMutation } from '../moveDecisions';

const ROOT = '/storage/emulated/0';

describe('directMutation', () => {
  it('이동/복사 모드에 맞는 직접 작업을 만든다', () => {
    expect(directMutation('move', '/x')).toEqual({ kind: 'moveDirect', destinationDir: '/x' });
    expect(directMutation('copy', '/x')).toEqual({ kind: 'copyDirect', destinationDir: '/x' });
  });
});

describe('decideTargetMove', () => {
  it('미디어 폴더 안의 앨범은 권한 없이 MediaStore 작업', () => {
    const target = { id: 'a', title: '가족', folderPath: `file://${ROOT}/Pictures/가족` };
    expect(decideTargetMove('move', target)).toEqual({ type: 'mutation', mutation: { kind: 'move', targetAlbumId: 'a' } });
    expect(decideTargetMove('copy', target)).toEqual({ type: 'mutation', mutation: { kind: 'copy', targetAlbumId: 'a' } });
  });

  it('경로를 모르는 앨범도 MediaStore 작업', () => {
    expect(decideTargetMove('move', { id: 'a', title: 'x' })).toEqual({
      type: 'mutation',
      mutation: { kind: 'move', targetAlbumId: 'a' },
    });
  });

  it('미디어 폴더 밖 앨범은 폴더 경로로 직접 이동', () => {
    const target = { id: 'b', title: '_Private_2026', folderPath: `file://${ROOT}/_MyData/Photo/_Private_2026` };
    expect(decideTargetMove('move', target)).toEqual({
      type: 'direct',
      destinationDir: `${ROOT}/_MyData/Photo/_Private_2026`,
      title: '_Private_2026',
    });
  });
});

describe('decideNewFolderMove', () => {
  it('Pictures 아래 새 폴더는 MediaStore 작업(복사는 copyToNew)', () => {
    expect(decideNewFolderMove('move', `${ROOT}/Pictures`, '여행')).toEqual({
      type: 'mutation',
      mutation: { kind: 'moveToNew', folderName: '여행' },
    });
    expect(decideNewFolderMove('copy', `${ROOT}/Pictures/가족`, '2024')).toEqual({
      type: 'mutation',
      mutation: { kind: 'copyToNew', folderName: '가족/2024' },
    });
  });

  it('그 밖의 위치는 직접 이동', () => {
    expect(decideNewFolderMove('move', `${ROOT}/DCIM`, 'Trip')).toEqual({
      type: 'direct',
      destinationDir: `${ROOT}/DCIM/Trip`,
      title: 'Trip',
    });
  });
});
