import { buildAssetIdMap } from '../albumRekey';

const item = (id: string, filename: string | null) => ({ id, filename });

describe('buildAssetIdMap', () => {
  it('MediaStore 이동처럼 id가 유지되면 같은 id끼리 대응시킨다', () => {
    expect(buildAssetIdMap([item('1', 'a.jpg'), item('2', 'b.jpg')], [item('1', 'a.jpg'), item('2', 'b.jpg')])).toEqual({
      '1': '1',
      '2': '2',
    });
  });

  it('파일을 직접 옮겨 id가 바뀌면 파일명으로 짝짓는다', () => {
    expect(buildAssetIdMap([item('1', 'a.jpg'), item('2', 'b.jpg')], [item('10', 'b.jpg'), item('11', 'a.jpg')])).toEqual({
      '1': '11',
      '2': '10',
    });
  });

  it('새 앨범에 같은 파일명이 여럿이면 어느 쪽인지 알 수 없어 짝짓지 않는다', () => {
    expect(buildAssetIdMap([item('1', 'a.jpg')], [item('10', 'a.jpg'), item('11', 'a.jpg')])).toEqual({});
  });

  it('파일명이 없거나 새 앨범에 없는 항목은 대응표에서 빠진다', () => {
    expect(buildAssetIdMap([item('1', null), item('2', 'gone.jpg')], [item('10', 'other.jpg')])).toEqual({});
  });

  it('이미 id로 짝지어진 새 항목은 파일명 짝짓기에서 다시 쓰지 않는다', () => {
    expect(buildAssetIdMap([item('1', 'a.jpg'), item('2', 'a.jpg')], [item('1', 'a.jpg')])).toEqual({ '1': '1' });
  });
});
