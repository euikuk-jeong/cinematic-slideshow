import { fireEvent, render, screen } from '@testing-library/react-native';

import { DeviceMusicPickerModal } from '../DeviceMusicPickerModal';
import { useMediaLibraryPermission } from '../../permissions/useMediaLibraryPermission';
import type { UseMediaLibraryPermissionResult } from '../../permissions/useMediaLibraryPermission';

jest.mock('../../permissions/useMediaLibraryPermission');

jest.mock('expo-media-library', () => {
  class MockQuery {
    eq() {
      return this;
    }
    exe() {
      return Promise.resolve([
        { id: 'audio-1', getFilename: () => Promise.resolve('song-one.mp3') },
        { id: 'audio-2', getFilename: () => Promise.resolve('song-two.mp3') },
      ]);
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

test('rationale 상태면 오디오용 설명 화면을 보여준다', async () => {
  mockPermission({ state: 'rationale' });
  await render(<DeviceMusicPickerModal visible onClose={jest.fn()} onSelect={jest.fn()} />);
  expect(screen.getByText('음악 접근 권한이 필요해요')).toBeTruthy();
});

test('blocked 상태면 오디오용 차단 안내를 보여준다', async () => {
  mockPermission({ state: 'blocked' });
  await render(<DeviceMusicPickerModal visible onClose={jest.fn()} onSelect={jest.fn()} />);
  expect(screen.getByText('음악 접근 권한이 꺼져 있어요')).toBeTruthy();
});

test('granted 상태면 기기 오디오 파일 목록을 보여주고, 탭하면 onSelect·onClose가 호출된다', async () => {
  mockPermission({ state: 'granted' });
  const onSelect = jest.fn();
  const onClose = jest.fn();
  await render(<DeviceMusicPickerModal visible onClose={onClose} onSelect={onSelect} />);

  fireEvent.press(await screen.findByText('song-one.mp3'));

  expect(onSelect).toHaveBeenCalledWith({ sourceValue: 'audio-1', title: 'song-one.mp3' });
  expect(onClose).toHaveBeenCalled();
});

test('visible=false면 자동으로 권한 흐름을 시작하지 않는다', async () => {
  const start = jest.fn();
  mockPermission({ state: 'idle', isReady: true, start });
  await render(<DeviceMusicPickerModal visible={false} onClose={jest.fn()} onSelect={jest.fn()} />);
  expect(start).not.toHaveBeenCalled();
});

test('idle 상태로 열리면 권한 흐름을 시작한다', async () => {
  const start = jest.fn();
  mockPermission({ state: 'idle', isReady: true, start });
  await render(<DeviceMusicPickerModal visible onClose={jest.fn()} onSelect={jest.fn()} />);
  expect(start).toHaveBeenCalled();
});
