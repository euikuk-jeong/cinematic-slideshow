import { fireEvent, render, screen } from '@testing-library/react-native';
import { Platform } from 'react-native';

import { HiddenAlbumsScreen } from '../HiddenAlbumsScreen';
import { getAppSetting, setAppSetting } from '../../db/client';
import { notifyHiddenFolderPathsChanged } from '../../settings/hiddenFolders';

jest.mock('../../db/client', () => ({
  getAppSetting: jest.fn().mockResolvedValue(null),
  setAppSetting: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../settings/hiddenFolders', () => ({
  ...jest.requireActual('../../settings/hiddenFolders'),
  notifyHiddenFolderPathsChanged: jest.fn(),
}));

const mockedGetAppSetting = getAppSetting as jest.MockedFunction<typeof getAppSetting>;
const mockedSetAppSetting = setAppSetting as jest.MockedFunction<typeof setAppSetting>;
const mockedNotify = notifyHiddenFolderPathsChanged as jest.MockedFunction<typeof notifyHiddenFolderPathsChanged>;

const originalOS = Platform.OS;

function setCache(albums: { id: string; title: string; folderPath: string }[]) {
  mockedGetAppSetting.mockImplementation((key: string) => {
    if (key === 'album_thumbnail_cache') return Promise.resolve(JSON.stringify(albums));
    if (key === 'album_list_hidden_folder_paths') return Promise.resolve(null);
    return Promise.resolve(null);
  });
}

beforeEach(() => {
  Platform.OS = 'android';
  mockedGetAppSetting.mockReset();
  mockedGetAppSetting.mockResolvedValue(null);
  mockedSetAppSetting.mockClear();
  mockedNotify.mockClear();
});

afterEach(() => {
  Platform.OS = originalOS;
});

describe('Android — 트리 화면', () => {
  test('앨범 대표 캐시가 없으면 안내 문구를 보여준다', async () => {
    await render(<HiddenAlbumsScreen />);
    expect(await screen.findByText('앨범 목록 화면을 먼저 연 뒤 다시 시도해주세요')).toBeTruthy();
  });

  test('자식이 하나뿐인 경로 체인은 한 줄로 병합돼 표시된다', async () => {
    setCache([{ id: '1', title: '카톡 이미지', folderPath: '/a/Android/data/com.kakao.talk/files/img' }]);
    await render(<HiddenAlbumsScreen />);
    expect(await screen.findByText('/a/Android/data/com.kakao.talk/files/img')).toBeTruthy();
  });

  test('형제 앨범 2개는 상위 폴더 아래 각각 행으로 나뉜다', async () => {
    setCache([
      { id: '1', title: '카메라', folderPath: '/a/DCIM/Camera' },
      { id: '2', title: '스크린샷', folderPath: '/a/Pictures/Screenshots' },
    ]);
    await render(<HiddenAlbumsScreen />);
    expect(await screen.findByText('DCIM/Camera')).toBeTruthy();
    expect(screen.getByText('Pictures/Screenshots')).toBeTruthy();
  });

  test('상위 폴더 스위치를 끄면 저장되고 변경을 알린다', async () => {
    setCache([{ id: '1', title: '카메라', folderPath: '/a/DCIM/Camera' }]);
    await render(<HiddenAlbumsScreen />);
    await screen.findByText('/a/DCIM/Camera');

    await fireEvent(screen.getByTestId('hidden-folder-switch-/a/DCIM/Camera'), 'valueChange', false);

    expect(mockedSetAppSetting).toHaveBeenCalledWith('album_list_hidden_folder_paths', JSON.stringify(['/a/DCIM/Camera']));
    expect(mockedNotify).toHaveBeenCalled();
  });

  test('상위 폴더가 숨겨지면 하위 항목 스위치는 비활성화된다', async () => {
    mockedGetAppSetting.mockImplementation((key: string) => {
      if (key === 'album_thumbnail_cache')
        return Promise.resolve(
          JSON.stringify([
            { id: '1', title: '카카오톡', folderPath: '/a/Android/data/com.kakao.talk/files' },
            { id: '2', title: '페이스북', folderPath: '/a/Android/data/com.facebook.orca/files' },
          ])
        );
      if (key === 'album_list_hidden_folder_paths') return Promise.resolve(JSON.stringify(['/a/Android/data']));
      return Promise.resolve(null);
    });
    await render(<HiddenAlbumsScreen />);
    await screen.findByText('/a/Android/data');

    // Android 네이티브 Switch 목업은 value/disabled를 각각 on/enabled(반전) prop으로 노출한다.
    const switchProps = screen.getByTestId('hidden-folder-switch-/a/Android/data/com.kakao.talk/files').props;
    expect(switchProps.on).toBe(false);
    expect(switchProps.enabled).toBe(false);
  });

  test('상위 폴더 행을 접으면 하위 항목이 목록에서 사라진다', async () => {
    setCache([
      { id: '1', title: '카메라', folderPath: '/a/DCIM/Camera' },
      { id: '2', title: '스크린샷', folderPath: '/a/Pictures/Screenshots' },
    ]);
    await render(<HiddenAlbumsScreen />);
    await screen.findByText('DCIM/Camera');

    await fireEvent.press(screen.getByTestId('hidden-folder-toggle-/a'));

    expect(screen.queryByText('DCIM/Camera')).toBeNull();
  });

  test('검색어를 입력하면 트리 대신 매치된 경로만 평탄하게 보여준다', async () => {
    setCache([
      { id: '1', title: '카메라', folderPath: '/a/DCIM/Camera' },
      { id: '2', title: '스크린샷', folderPath: '/a/Pictures/Screenshots' },
    ]);
    await render(<HiddenAlbumsScreen />);
    await screen.findByText('DCIM/Camera');

    await fireEvent.changeText(screen.getByTestId('hidden-albums-search-input'), 'camera');

    expect(screen.getByText('DCIM/Camera')).toBeTruthy();
    expect(screen.queryByText('Pictures/Screenshots')).toBeNull();
  });

  test('검색 결과가 없으면 전용 안내 문구를 보여준다', async () => {
    setCache([{ id: '1', title: '카메라', folderPath: '/a/DCIM/Camera' }]);
    await render(<HiddenAlbumsScreen />);
    await screen.findByText('/a/DCIM/Camera');

    await fireEvent.changeText(screen.getByTestId('hidden-albums-search-input'), '존재하지않음');

    expect(screen.getByText('검색 결과가 없어요')).toBeTruthy();
  });
});

describe('iOS — 평탄 앨범 목록', () => {
  beforeEach(() => {
    Platform.OS = 'ios';
  });

  test('트리 없이 앨범 제목을 이름순 평탄 목록으로 보여준다', async () => {
    setCache([
      { id: '1', title: '여행 사진', folderPath: '/ios/asset-1' },
      { id: '2', title: '가족', folderPath: '/ios/asset-2' },
    ]);
    await render(<HiddenAlbumsScreen />);

    expect(await screen.findByText('가족')).toBeTruthy();
    expect(screen.getByText('여행 사진')).toBeTruthy();
    expect(screen.queryByTestId(/hidden-folder-toggle-/)).toBeNull();
  });

  test('개별 앨범 스위치를 끄면 그 앨범의 folderPath만 숨김 처리된다', async () => {
    setCache([{ id: '1', title: '여행 사진', folderPath: '/ios/asset-1' }]);
    await render(<HiddenAlbumsScreen />);
    await screen.findByText('여행 사진');

    await fireEvent(screen.getByTestId('hidden-album-switch-1'), 'valueChange', false);

    expect(mockedSetAppSetting).toHaveBeenCalledWith('album_list_hidden_folder_paths', JSON.stringify(['/ios/asset-1']));
    expect(mockedNotify).toHaveBeenCalled();
  });
});
