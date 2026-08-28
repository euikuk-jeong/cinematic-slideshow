import { fireEvent, render, screen } from '@testing-library/react-native';

import { DeviceMusicPickerModal } from '../DeviceMusicPickerModal';
import { useMediaLibraryPermission } from '../../permissions/useMediaLibraryPermission';
import type { UseMediaLibraryPermissionResult } from '../../permissions/useMediaLibraryPermission';

jest.mock('../../permissions/useMediaLibraryPermission');

const mockExe = jest.fn();

jest.mock('expo-media-library', () => {
  class MockQuery {
    eq() {
      return this;
    }
    exe() {
      return mockExe();
    }
  }
  return {
    Query: MockQuery,
    AssetField: { MEDIA_TYPE: 'mediaType' },
    MediaType: { AUDIO: 'audio' },
  };
});

const mockedUseMediaLibraryPermission = useMediaLibraryPermission as jest.MockedFunction<
  typeof useMediaLibraryPermission
>;

function mockPermission(overrides: Partial<UseMediaLibraryPermissionResult>) {
  mockedUseMediaLibraryPermission.mockReturnValue({
    state: 'idle',
    isReady: true,
    start: jest.fn(),
    confirmRationale: jest.fn(),
    cancelRationale: jest.fn(),
    openSettings: jest.fn(),
    ...overrides,
  });
}

function makeAsset(id: string, filename: string, uri: string) {
  return { id, getFilename: () => Promise.resolve(filename), getUri: () => Promise.resolve(uri) };
}

const ROOT_FOLDER = '/storage/emulated/0';
const MUSIC_FOLDER = '/storage/emulated/0/Music';
const PODCASTS_FOLDER = '/storage/emulated/0/Podcasts';

// buildFolderTree는 자식이 하나뿐인 체인만 병합하므로, /storage/emulated/0 아래
// Music/Podcasts 두 갈래로 나뉘는 이 픽스처는 루트에 병합 없는 상위 폴더 하나만
// 노출한다 — 실제로 그 안까지 들어가야 Music/Podcasts가 보인다.
// fireEvent를 await해야(v14 testing-library 관례, render()와 동일) act() 플러시가
// 완료된 뒤 다음 조회로 넘어간다 — 그렇지 않으면 연속 탐색에서 상태 갱신을 놓친다.
async function openMusicFolder() {
  // 기본 화면은 전체 목록(flat) 모드라 폴더 탐색을 하려면 먼저 폴더 모드로 전환해야 한다.
  await fireEvent.press(await screen.findByTestId('picker-mode-folder'));
  await fireEvent.press(await screen.findByTestId(`folder-row-${ROOT_FOLDER}`));
  await fireEvent.press(screen.getByTestId(`folder-row-${MUSIC_FOLDER}`));
}

async function openPodcastsFolder() {
  await fireEvent.press(screen.getByTestId(`folder-row-${ROOT_FOLDER}`));
  await fireEvent.press(screen.getByTestId(`folder-row-${PODCASTS_FOLDER}`));
}

beforeEach(() => {
  mockExe.mockResolvedValue([
    makeAsset('audio-1', 'song-one.mp3', `${MUSIC_FOLDER}/song-one.mp3`),
    makeAsset('audio-2', 'song-two.mp3', `${PODCASTS_FOLDER}/song-two.mp3`),
  ]);
});

test('rationale 상태면 오디오용 설명 화면을 보여준다', async () => {
  mockPermission({ state: 'rationale' });
  await render(<DeviceMusicPickerModal visible onClose={jest.fn()} onSelectTracks={jest.fn()} />);
  expect(screen.getByText('음악 접근 권한이 필요해요')).toBeTruthy();
});

test('blocked 상태면 오디오용 차단 안내를 보여준다', async () => {
  mockPermission({ state: 'blocked' });
  await render(<DeviceMusicPickerModal visible onClose={jest.fn()} onSelectTracks={jest.fn()} />);
  expect(screen.getByText('음악 접근 권한이 꺼져 있어요')).toBeTruthy();
});

test('granted 상태면 기본으로 전체 목록(이름순, 검색바 포함)이 보인다', async () => {
  mockPermission({ state: 'granted' });
  await render(<DeviceMusicPickerModal visible onClose={jest.fn()} onSelectTracks={jest.fn()} />);

  expect(await screen.findByText('song-one.mp3')).toBeTruthy();
  expect(screen.getByText('song-two.mp3')).toBeTruthy();
  expect(screen.getByTestId('picker-search-input')).toBeTruthy();
});

test('전체 목록은 제목 가나다순으로 정렬된다', async () => {
  mockExe.mockResolvedValue([
    makeAsset('audio-z', 'zebra.mp3', `${MUSIC_FOLDER}/zebra.mp3`),
    makeAsset('audio-a', 'apple.mp3', `${MUSIC_FOLDER}/apple.mp3`),
  ]);
  mockPermission({ state: 'granted' });
  await render(<DeviceMusicPickerModal visible onClose={jest.fn()} onSelectTracks={jest.fn()} />);
  await screen.findByText('apple.mp3');

  const rows = screen.getAllByText(/\.mp3$/);
  expect(rows.map((row) => row.props.children)).toEqual(['apple.mp3', 'zebra.mp3']);
});

test('전체 목록에서 검색하면 제목에 부분일치하는 곡만 보인다', async () => {
  mockPermission({ state: 'granted' });
  await render(<DeviceMusicPickerModal visible onClose={jest.fn()} onSelectTracks={jest.fn()} />);
  await screen.findByText('song-one.mp3');

  await fireEvent.changeText(screen.getByTestId('picker-search-input'), 'two');

  expect(screen.queryByText('song-one.mp3')).toBeNull();
  expect(screen.getByText('song-two.mp3')).toBeTruthy();
});

test('검색 결과가 없으면 안내 문구를 보여준다', async () => {
  mockPermission({ state: 'granted' });
  await render(<DeviceMusicPickerModal visible onClose={jest.fn()} onSelectTracks={jest.fn()} />);
  await screen.findByText('song-one.mp3');

  await fireEvent.changeText(screen.getByTestId('picker-search-input'), 'zzz');

  expect(await screen.findByText('검색 결과가 없어요')).toBeTruthy();
});

test('검색어 지우기 버튼을 누르면 검색어가 비워지고 전체 목록이 다시 보인다', async () => {
  mockPermission({ state: 'granted' });
  await render(<DeviceMusicPickerModal visible onClose={jest.fn()} onSelectTracks={jest.fn()} />);
  await screen.findByText('song-one.mp3');

  await fireEvent.changeText(screen.getByTestId('picker-search-input'), 'two');
  expect(screen.queryByText('song-one.mp3')).toBeNull();

  await fireEvent.press(screen.getByTestId('picker-search-clear'));

  expect(await screen.findByText('song-one.mp3')).toBeTruthy();
});

test('전체 목록에서 파일을 체크하고 확정하면 onSelectTracks가 호출된다', async () => {
  mockPermission({ state: 'granted' });
  const onSelectTracks = jest.fn();
  await render(<DeviceMusicPickerModal visible onClose={jest.fn()} onSelectTracks={onSelectTracks} />);
  await screen.findByText('song-one.mp3');

  await fireEvent.press(screen.getByTestId('file-row-audio-1'));
  await fireEvent.press(screen.getByTestId('confirm-selection-button'));

  expect(onSelectTracks).toHaveBeenCalledWith([{ sourceValue: 'audio-1', title: 'song-one.mp3' }]);
});

test('전체 목록에서 체크한 뒤 폴더 모드로 전환해도 선택은 유지된다', async () => {
  mockPermission({ state: 'granted' });
  await render(<DeviceMusicPickerModal visible onClose={jest.fn()} onSelectTracks={jest.fn()} />);
  await screen.findByText('song-one.mp3');

  await fireEvent.press(screen.getByTestId('file-row-audio-1'));
  await fireEvent.press(screen.getByTestId('picker-mode-folder'));

  expect(screen.getByText('선택한 1곡 추가')).toBeTruthy();
});

test('폴더 모드로 전환하면 루트에서 최상위 폴더를 보여준다(파일은 하위 폴더에 있어 루트에는 없음)', async () => {
  mockPermission({ state: 'granted' });
  await render(<DeviceMusicPickerModal visible onClose={jest.fn()} onSelectTracks={jest.fn()} />);
  await screen.findByText('song-one.mp3');

  await fireEvent.press(screen.getByTestId('picker-mode-folder'));

  expect(await screen.findByTestId(`folder-row-${ROOT_FOLDER}`)).toBeTruthy();
  expect(screen.queryByText('song-one.mp3')).toBeNull();
});

test('폴더를 계속 탭해 들어가면 그 폴더 안의 파일이 보이고, 상단 breadcrumb에 폴더명이 추가된다', async () => {
  mockPermission({ state: 'granted' });
  await render(<DeviceMusicPickerModal visible onClose={jest.fn()} onSelectTracks={jest.fn()} />);

  await openMusicFolder();

  expect(screen.getByText('song-one.mp3')).toBeTruthy();
  expect(screen.queryByText('song-two.mp3')).toBeNull();
  expect(screen.getByText('Music')).toBeTruthy();
});

test('루트 breadcrumb을 탭하면 최상위 폴더 목록으로 돌아간다', async () => {
  mockPermission({ state: 'granted' });
  await render(<DeviceMusicPickerModal visible onClose={jest.fn()} onSelectTracks={jest.fn()} />);
  await openMusicFolder();

  await fireEvent.press(screen.getByTestId('breadcrumb-root'));

  expect(screen.getByTestId(`folder-row-${ROOT_FOLDER}`)).toBeTruthy();
  expect(screen.queryByText('song-one.mp3')).toBeNull();
});

test('중간 breadcrumb을 탭하면 그 단계로 돌아간다', async () => {
  mockPermission({ state: 'granted' });
  await render(<DeviceMusicPickerModal visible onClose={jest.fn()} onSelectTracks={jest.fn()} />);
  await openMusicFolder();

  await fireEvent.press(screen.getByTestId('breadcrumb-0'));

  expect(screen.getByTestId(`folder-row-${MUSIC_FOLDER}`)).toBeTruthy();
  expect(screen.queryByText('song-one.mp3')).toBeNull();
});

test('파일을 체크하면 선택 개수가 늘고, "선택한 N곡 추가"를 누르면 onSelectTracks가 선택된 항목들과 함께 호출된 뒤 닫힌다', async () => {
  mockPermission({ state: 'granted' });
  const onSelectTracks = jest.fn();
  const onClose = jest.fn();
  await render(<DeviceMusicPickerModal visible onClose={onClose} onSelectTracks={onSelectTracks} />);
  await openMusicFolder();

  await fireEvent.press(screen.getByTestId('file-row-audio-1'));

  expect(screen.getByText('선택한 1곡 추가')).toBeTruthy();
  await fireEvent.press(screen.getByTestId('confirm-selection-button'));

  expect(onSelectTracks).toHaveBeenCalledWith([{ sourceValue: 'audio-1', title: 'song-one.mp3' }]);
  expect(onClose).toHaveBeenCalled();
});

test('서로 다른 폴더의 파일을 여러 개 체크하면 모두 함께 확정된다', async () => {
  mockPermission({ state: 'granted' });
  const onSelectTracks = jest.fn();
  await render(<DeviceMusicPickerModal visible onClose={jest.fn()} onSelectTracks={onSelectTracks} />);

  await openMusicFolder();
  await fireEvent.press(screen.getByTestId('file-row-audio-1'));
  await fireEvent.press(screen.getByTestId('breadcrumb-root'));
  await openPodcastsFolder();
  await fireEvent.press(screen.getByTestId('file-row-audio-2'));

  await fireEvent.press(screen.getByTestId('confirm-selection-button'));

  expect(onSelectTracks).toHaveBeenCalledWith([
    { sourceValue: 'audio-1', title: 'song-one.mp3' },
    { sourceValue: 'audio-2', title: 'song-two.mp3' },
  ]);
});

test('아무것도 선택하지 않으면 확정 버튼이 비활성화된다', async () => {
  mockPermission({ state: 'granted' });
  const onSelectTracks = jest.fn();
  await render(<DeviceMusicPickerModal visible onClose={jest.fn()} onSelectTracks={onSelectTracks} />);
  await openMusicFolder();

  await fireEvent.press(screen.getByTestId('confirm-selection-button'));

  expect(onSelectTracks).not.toHaveBeenCalled();
});

test('visible=false면 자동으로 권한 흐름을 시작하지 않는다', async () => {
  const start = jest.fn();
  mockPermission({ state: 'idle', isReady: true, start });
  await render(<DeviceMusicPickerModal visible={false} onClose={jest.fn()} onSelectTracks={jest.fn()} />);
  expect(start).not.toHaveBeenCalled();
});

test('idle 상태로 열리면 권한 흐름을 시작한다', async () => {
  const start = jest.fn();
  mockPermission({ state: 'idle', isReady: true, start });
  await render(<DeviceMusicPickerModal visible onClose={jest.fn()} onSelectTracks={jest.fn()} />);
  expect(start).toHaveBeenCalled();
});

test('오디오 목록 조회가 실패하면 에러 문구를 보여준다', async () => {
  mockExe.mockRejectedValue(new Error('query failed'));
  mockPermission({ state: 'granted' });
  await render(<DeviceMusicPickerModal visible onClose={jest.fn()} onSelectTracks={jest.fn()} />);

  expect(await screen.findByText('음악 목록을 불러오지 못했어요')).toBeTruthy();
});
