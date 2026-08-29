import { fireEvent, render, screen } from '@testing-library/react-native';
import { Platform } from 'react-native';

import { MusicPickerModal } from '../MusicPickerModal';
import { useMediaLibraryPermission } from '../../permissions/useMediaLibraryPermission';
import type { UseMediaLibraryPermissionResult } from '../../permissions/useMediaLibraryPermission';

jest.mock('../../permissions/useMediaLibraryPermission');

// resolveTrackMetadata는 music-metadata(동적 import 기반 파서)를 거치는데, Jest VM은
// --experimental-vm-modules 없이 동적 import를 실행할 수 없어 실제 호출 시 죽는다
// (src/music/__tests__/tagReader.test.ts 상단 설명 참고). 여기서는 태그가 없는 것으로
// 취급 — 행은 파일명/아티스트 없음으로 렌더링된다(기존 기대값과 동일).
jest.mock('../../music/resolveTrackMetadata', () => ({
  resolveDeviceTrackMetadata: jest.fn().mockResolvedValue(null),
}));

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
  return {
    id,
    getFilename: () => Promise.resolve(filename),
    getUri: () => Promise.resolve(uri),
    getInfo: () => Promise.resolve({ id, filename, uri }),
  };
}

const NO_SELECTION = new Set<string>();

const ROOT_FOLDER = '/storage/emulated/0';
const MUSIC_FOLDER = '/storage/emulated/0/Music';
const PODCASTS_FOLDER = '/storage/emulated/0/Podcasts';

async function switchToFlatMode() {
  await fireEvent.press(await screen.findByTestId('picker-mode-flat'));
}

// buildFolderTree는 자식이 하나뿐인 체인만 병합하므로, /storage/emulated/0 아래
// Music/Podcasts 두 갈래로 나뉘는 이 픽스처는 루트에 병합 없는 상위 폴더 하나만
// 노출한다 — 실제로 그 안까지 들어가야 Music/Podcasts가 보인다.
// fireEvent를 await해야(v14 testing-library 관례, render()와 동일) act() 플러시가
// 완료된 뒤 다음 조회로 넘어간다 — 그렇지 않으면 연속 탐색에서 상태 갱신을 놓친다.
async function openMusicFolder() {
  await fireEvent.press(await screen.findByTestId('picker-mode-folder'));
  await fireEvent.press(await screen.findByTestId(`folder-row-${ROOT_FOLDER}`));
  await fireEvent.press(screen.getByTestId(`folder-row-${MUSIC_FOLDER}`));
}

async function openPodcastsFolder() {
  await fireEvent.press(screen.getByTestId(`folder-row-${ROOT_FOLDER}`));
  await fireEvent.press(screen.getByTestId(`folder-row-${PODCASTS_FOLDER}`));
}

let originalOS: typeof Platform.OS;

beforeEach(() => {
  originalOS = Platform.OS;
  Platform.OS = 'android';
  mockExe.mockResolvedValue([
    makeAsset('audio-1', 'song-one.mp3', `${MUSIC_FOLDER}/song-one.mp3`),
    makeAsset('audio-2', 'song-two.mp3', `${PODCASTS_FOLDER}/song-two.mp3`),
  ]);
});

afterEach(() => {
  Platform.OS = originalOS;
});

test('기본으로 "기본음악" 탭이 열리고, 권한 흐름은 시작하지 않는다', async () => {
  const start = jest.fn();
  mockPermission({ state: 'idle', isReady: true, start });
  await render(<MusicPickerModal visible onClose={jest.fn()} onSelectTracks={jest.fn()} alreadySelectedKeys={NO_SELECTION} />);

  expect(await screen.findByText('Calm Piano')).toBeTruthy();
  expect(screen.getByText('Alex Morgan')).toBeTruthy();
  expect(start).not.toHaveBeenCalled();
});

test('기본음악 탭에서 제목으로 검색하면 부분일치하는 곡만 보인다', async () => {
  mockPermission({ state: 'idle' });
  await render(<MusicPickerModal visible onClose={jest.fn()} onSelectTracks={jest.fn()} alreadySelectedKeys={NO_SELECTION} />);
  await screen.findByText('Calm Piano');

  await fireEvent.changeText(screen.getByTestId('picker-search-input'), 'summer');

  expect(screen.queryByText('Calm Piano')).toBeNull();
  expect(screen.getByText('Summer Pop')).toBeTruthy();
});

test('기본음악 탭에서 가수명으로도 검색된다', async () => {
  mockPermission({ state: 'idle' });
  await render(<MusicPickerModal visible onClose={jest.fn()} onSelectTracks={jest.fn()} alreadySelectedKeys={NO_SELECTION} />);
  await screen.findByText('Calm Piano');

  await fireEvent.changeText(screen.getByTestId('picker-search-input'), 'paulyudin');

  expect(screen.getByText('Emotional')).toBeTruthy();
  expect(screen.getByText('Epic Piano')).toBeTruthy();
  expect(screen.queryByText('Calm Piano')).toBeNull();
});

test('이미 재생목록에 있는 기본음악은 목록에서 빠진다', async () => {
  mockPermission({ state: 'idle' });
  await render(
    <MusicPickerModal
      visible
      onClose={jest.fn()}
      onSelectTracks={jest.fn()}
      alreadySelectedKeys={new Set(['bundled:calm'])}
    />
  );
  await screen.findByText('Emotional');

  expect(screen.queryByText('Calm Piano')).toBeNull();
});

test('기본음악을 체크하고 확정하면 onSelectTracks가 sourceType과 함께 호출된다', async () => {
  mockPermission({ state: 'idle' });
  const onSelectTracks = jest.fn();
  const onClose = jest.fn();
  await render(
    <MusicPickerModal visible onClose={onClose} onSelectTracks={onSelectTracks} alreadySelectedKeys={NO_SELECTION} />
  );
  await screen.findByText('Calm Piano');

  await fireEvent.press(screen.getByTestId('music-row-bundled:calm'));
  await fireEvent.press(screen.getByTestId('confirm-selection-button'));

  expect(onSelectTracks).toHaveBeenCalledWith([
    { sourceType: 'bundled', sourceValue: 'calm', title: 'Calm Piano', artist: 'Alex Morgan', coverUri: null },
  ]);
  expect(onClose).toHaveBeenCalled();
});

test('iOS에서는 "전체"/"폴더" 탭이 보이지 않고 기본음악만 제공된다', async () => {
  Platform.OS = 'ios';
  const start = jest.fn();
  mockPermission({ state: 'idle', isReady: true, start });
  await render(<MusicPickerModal visible onClose={jest.fn()} onSelectTracks={jest.fn()} alreadySelectedKeys={NO_SELECTION} />);
  await screen.findByText('Calm Piano');

  expect(screen.queryByTestId('picker-mode-flat')).toBeNull();
  expect(screen.queryByTestId('picker-mode-folder')).toBeNull();
  expect(start).not.toHaveBeenCalled();
});

test('rationale 상태면 "전체" 탭에서 오디오용 설명 화면을 보여준다', async () => {
  mockPermission({ state: 'rationale' });
  await render(<MusicPickerModal visible onClose={jest.fn()} onSelectTracks={jest.fn()} alreadySelectedKeys={NO_SELECTION} />);
  await switchToFlatMode();
  expect(screen.getByText('음악 접근 권한이 필요해요')).toBeTruthy();
});

test('rationale을 취소하면 모달은 닫히지 않고 기본음악 탭으로 돌아간다', async () => {
  const cancelRationale = jest.fn();
  mockPermission({ state: 'rationale', cancelRationale });
  const onClose = jest.fn();
  await render(<MusicPickerModal visible onClose={onClose} onSelectTracks={jest.fn()} alreadySelectedKeys={NO_SELECTION} />);
  await switchToFlatMode();

  await fireEvent.press(screen.getByText('취소'));

  expect(cancelRationale).toHaveBeenCalled();
  expect(onClose).not.toHaveBeenCalled();
});

test('blocked 상태면 "전체" 탭에서 오디오용 차단 안내를 보여준다', async () => {
  mockPermission({ state: 'blocked' });
  await render(<MusicPickerModal visible onClose={jest.fn()} onSelectTracks={jest.fn()} alreadySelectedKeys={NO_SELECTION} />);
  await switchToFlatMode();
  expect(screen.getByText('음악 접근 권한이 꺼져 있어요')).toBeTruthy();
});

test('"전체" 탭으로 전환하면 그때 권한 흐름을 시작한다', async () => {
  const start = jest.fn();
  mockPermission({ state: 'idle', isReady: true, start });
  await render(<MusicPickerModal visible onClose={jest.fn()} onSelectTracks={jest.fn()} alreadySelectedKeys={NO_SELECTION} />);
  expect(start).not.toHaveBeenCalled();

  await switchToFlatMode();

  expect(start).toHaveBeenCalled();
});

test('"전체" 탭은 기기 음악 전체를 이름순으로 보여준다', async () => {
  mockExe.mockResolvedValue([
    makeAsset('audio-z', 'zebra.mp3', `${MUSIC_FOLDER}/zebra.mp3`),
    makeAsset('audio-a', 'apple.mp3', `${MUSIC_FOLDER}/apple.mp3`),
  ]);
  mockPermission({ state: 'granted' });
  await render(<MusicPickerModal visible onClose={jest.fn()} onSelectTracks={jest.fn()} alreadySelectedKeys={NO_SELECTION} />);
  await switchToFlatMode();
  await screen.findByText('apple.mp3');

  const rows = screen.getAllByText(/\.mp3$/);
  expect(rows.map((row) => row.props.children)).toEqual(['apple.mp3', 'zebra.mp3']);
});

test('"전체" 탭에서 검색하면 제목에 부분일치하는 곡만 보인다', async () => {
  mockPermission({ state: 'granted' });
  await render(<MusicPickerModal visible onClose={jest.fn()} onSelectTracks={jest.fn()} alreadySelectedKeys={NO_SELECTION} />);
  await switchToFlatMode();
  await screen.findByText('song-one.mp3');

  await fireEvent.changeText(screen.getByTestId('picker-search-input'), 'two');

  expect(screen.queryByText('song-one.mp3')).toBeNull();
  expect(screen.getByText('song-two.mp3')).toBeTruthy();
});

test('검색 결과가 없으면 안내 문구를 보여준다', async () => {
  mockPermission({ state: 'granted' });
  await render(<MusicPickerModal visible onClose={jest.fn()} onSelectTracks={jest.fn()} alreadySelectedKeys={NO_SELECTION} />);
  await switchToFlatMode();
  await screen.findByText('song-one.mp3');

  await fireEvent.changeText(screen.getByTestId('picker-search-input'), 'zzz');

  expect(await screen.findByText('검색 결과가 없어요')).toBeTruthy();
});

test('탭을 전환하면 검색어는 초기화된다', async () => {
  mockPermission({ state: 'granted' });
  await render(<MusicPickerModal visible onClose={jest.fn()} onSelectTracks={jest.fn()} alreadySelectedKeys={NO_SELECTION} />);
  await switchToFlatMode();
  await screen.findByText('song-one.mp3');
  await fireEvent.changeText(screen.getByTestId('picker-search-input'), 'two');
  expect(screen.queryByText('song-one.mp3')).toBeNull();

  await fireEvent.press(screen.getByTestId('picker-mode-bundled'));
  await fireEvent.press(screen.getByTestId('picker-mode-flat'));

  expect(await screen.findByText('song-one.mp3')).toBeTruthy();
});

test('이미 재생목록에 있는 기기 음악은 "전체"/"폴더" 탭 모두에서 빠진다', async () => {
  mockPermission({ state: 'granted' });
  await render(
    <MusicPickerModal
      visible
      onClose={jest.fn()}
      onSelectTracks={jest.fn()}
      alreadySelectedKeys={new Set(['device:audio-1'])}
    />
  );
  await switchToFlatMode();
  await screen.findByText('song-two.mp3');
  expect(screen.queryByText('song-one.mp3')).toBeNull();

  // audio-1이 제외돼 Music 폴더 쪽 가지가 통째로 사라지므로, 폴더 탭 루트에는
  // Podcasts 하나만(단일 체인이라 병합된 라벨로) 남는다.
  await fireEvent.press(screen.getByTestId('picker-mode-folder'));
  await fireEvent.press(await screen.findByTestId(`folder-row-${PODCASTS_FOLDER}`));

  expect(screen.getByText('song-two.mp3')).toBeTruthy();
  expect(screen.queryByText('song-one.mp3')).toBeNull();
});

test('"전체" 탭에서 파일을 체크하고 확정하면 onSelectTracks가 device sourceType과 함께 호출된다', async () => {
  mockPermission({ state: 'granted' });
  const onSelectTracks = jest.fn();
  await render(
    <MusicPickerModal visible onClose={jest.fn()} onSelectTracks={onSelectTracks} alreadySelectedKeys={NO_SELECTION} />
  );
  await switchToFlatMode();
  await screen.findByText('song-one.mp3');

  await fireEvent.press(screen.getByTestId('music-row-device:audio-1'));
  await fireEvent.press(screen.getByTestId('confirm-selection-button'));

  expect(onSelectTracks).toHaveBeenCalledWith([
    { sourceType: 'device', sourceValue: 'audio-1', title: 'song-one.mp3', artist: null, coverUri: null },
  ]);
});

test('기본음악 탭에서 체크한 뒤 다른 탭으로 이동해도 선택은 유지된다', async () => {
  mockPermission({ state: 'granted' });
  await render(<MusicPickerModal visible onClose={jest.fn()} onSelectTracks={jest.fn()} alreadySelectedKeys={NO_SELECTION} />);
  await screen.findByText('Calm Piano');

  await fireEvent.press(screen.getByTestId('music-row-bundled:calm'));
  await switchToFlatMode();

  expect(screen.getByText('선택한 1곡 추가')).toBeTruthy();
});

test('"폴더" 탭으로 전환하면 루트에서 최상위 폴더를 보여준다(파일은 하위 폴더에 있어 루트에는 없음)', async () => {
  mockPermission({ state: 'granted' });
  await render(<MusicPickerModal visible onClose={jest.fn()} onSelectTracks={jest.fn()} alreadySelectedKeys={NO_SELECTION} />);

  await fireEvent.press(await screen.findByTestId('picker-mode-folder'));

  expect(await screen.findByTestId(`folder-row-${ROOT_FOLDER}`)).toBeTruthy();
  expect(screen.queryByText('song-one.mp3')).toBeNull();
});

test('폴더를 계속 탭해 들어가면 그 폴더 안의 파일이 보이고, 상단 breadcrumb에 폴더명이 추가된다', async () => {
  mockPermission({ state: 'granted' });
  await render(<MusicPickerModal visible onClose={jest.fn()} onSelectTracks={jest.fn()} alreadySelectedKeys={NO_SELECTION} />);

  await openMusicFolder();

  expect(screen.getByText('song-one.mp3')).toBeTruthy();
  expect(screen.queryByText('song-two.mp3')).toBeNull();
  expect(screen.getByText('Music')).toBeTruthy();
});

test('루트 breadcrumb을 탭하면 최상위 폴더 목록으로 돌아간다', async () => {
  mockPermission({ state: 'granted' });
  await render(<MusicPickerModal visible onClose={jest.fn()} onSelectTracks={jest.fn()} alreadySelectedKeys={NO_SELECTION} />);
  await openMusicFolder();

  await fireEvent.press(screen.getByTestId('breadcrumb-root'));

  expect(screen.getByTestId(`folder-row-${ROOT_FOLDER}`)).toBeTruthy();
  expect(screen.queryByText('song-one.mp3')).toBeNull();
});

test('중간 breadcrumb을 탭하면 그 단계로 돌아간다', async () => {
  mockPermission({ state: 'granted' });
  await render(<MusicPickerModal visible onClose={jest.fn()} onSelectTracks={jest.fn()} alreadySelectedKeys={NO_SELECTION} />);
  await openMusicFolder();

  await fireEvent.press(screen.getByTestId('breadcrumb-0'));

  expect(screen.getByTestId(`folder-row-${MUSIC_FOLDER}`)).toBeTruthy();
  expect(screen.queryByText('song-one.mp3')).toBeNull();
});

test('파일을 체크하면 선택 개수가 늘고, "선택한 N곡 추가"를 누르면 onSelectTracks가 선택된 항목들과 함께 호출된 뒤 닫힌다', async () => {
  mockPermission({ state: 'granted' });
  const onSelectTracks = jest.fn();
  const onClose = jest.fn();
  await render(
    <MusicPickerModal visible onClose={onClose} onSelectTracks={onSelectTracks} alreadySelectedKeys={NO_SELECTION} />
  );
  await openMusicFolder();

  await fireEvent.press(screen.getByTestId('music-row-device:audio-1'));

  expect(screen.getByText('선택한 1곡 추가')).toBeTruthy();
  await fireEvent.press(screen.getByTestId('confirm-selection-button'));

  expect(onSelectTracks).toHaveBeenCalledWith([
    { sourceType: 'device', sourceValue: 'audio-1', title: 'song-one.mp3', artist: null, coverUri: null },
  ]);
  expect(onClose).toHaveBeenCalled();
});

test('서로 다른 폴더의 파일을 여러 개 체크하면 모두 함께 확정된다', async () => {
  mockPermission({ state: 'granted' });
  const onSelectTracks = jest.fn();
  await render(
    <MusicPickerModal visible onClose={jest.fn()} onSelectTracks={onSelectTracks} alreadySelectedKeys={NO_SELECTION} />
  );

  await openMusicFolder();
  await fireEvent.press(screen.getByTestId('music-row-device:audio-1'));
  await fireEvent.press(screen.getByTestId('breadcrumb-root'));
  await openPodcastsFolder();
  await fireEvent.press(screen.getByTestId('music-row-device:audio-2'));

  await fireEvent.press(screen.getByTestId('confirm-selection-button'));

  expect(onSelectTracks).toHaveBeenCalledWith([
    { sourceType: 'device', sourceValue: 'audio-1', title: 'song-one.mp3', artist: null, coverUri: null },
    { sourceType: 'device', sourceValue: 'audio-2', title: 'song-two.mp3', artist: null, coverUri: null },
  ]);
});

test('아무것도 선택하지 않으면 확정 버튼이 비활성화된다', async () => {
  mockPermission({ state: 'granted' });
  const onSelectTracks = jest.fn();
  await render(
    <MusicPickerModal visible onClose={jest.fn()} onSelectTracks={onSelectTracks} alreadySelectedKeys={NO_SELECTION} />
  );
  await openMusicFolder();

  await fireEvent.press(screen.getByTestId('confirm-selection-button'));

  expect(onSelectTracks).not.toHaveBeenCalled();
});

test('오디오 목록 조회가 실패하면 "전체" 탭에서 에러 문구를 보여준다', async () => {
  mockExe.mockRejectedValue(new Error('query failed'));
  mockPermission({ state: 'granted' });
  await render(<MusicPickerModal visible onClose={jest.fn()} onSelectTracks={jest.fn()} alreadySelectedKeys={NO_SELECTION} />);
  await switchToFlatMode();

  expect(await screen.findByText('음악 목록을 불러오지 못했어요')).toBeTruthy();
});

test('닫힌 뒤 다시 열면 기본음악 탭과 선택 상태로 초기화된다', async () => {
  mockPermission({ state: 'granted' });
  const { rerender } = await render(
    <MusicPickerModal visible onClose={jest.fn()} onSelectTracks={jest.fn()} alreadySelectedKeys={NO_SELECTION} />
  );
  await switchToFlatMode();
  await screen.findByText('song-one.mp3');
  await fireEvent.press(screen.getByTestId('music-row-device:audio-1'));

  await rerender(
    <MusicPickerModal visible={false} onClose={jest.fn()} onSelectTracks={jest.fn()} alreadySelectedKeys={NO_SELECTION} />
  );
  await rerender(
    <MusicPickerModal visible onClose={jest.fn()} onSelectTracks={jest.fn()} alreadySelectedKeys={NO_SELECTION} />
  );

  expect(await screen.findByText('Calm Piano')).toBeTruthy();
  expect(screen.queryByText('선택한 1곡 추가')).toBeNull();
});
