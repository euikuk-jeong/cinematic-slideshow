import { Platform } from 'react-native';
import { startActivityAsync } from 'expo-intent-launcher';

import { openVideoInExternalPlayer } from '../externalPlayer';

const mockedStart = startActivityAsync as jest.MockedFunction<typeof startActivityAsync>;
const CONTENT_URI = 'content://media/external/video/media/42';

let originalOS: typeof Platform.OS;
beforeEach(() => {
  originalOS = Platform.OS;
  Platform.OS = 'android';
  mockedStart.mockReset().mockResolvedValue({ resultCode: 0 });
});
afterEach(() => {
  Platform.OS = originalOS;
});

test('content URI를 VIEW 인텐트(video/*, 읽기 권한 부여)로 시작한다', async () => {
  await expect(openVideoInExternalPlayer(CONTENT_URI)).resolves.toBe('opened');
  expect(mockedStart).toHaveBeenCalledWith('android.intent.action.VIEW', {
    data: CONTENT_URI,
    type: 'video/*',
    flags: 1,
  });
});

test('file:// 경로는 다른 앱에 노출할 수 없어 시작하지 않는다', async () => {
  await expect(openVideoInExternalPlayer('file:///storage/emulated/0/a.mp4')).resolves.toBe('unsupported');
  expect(mockedStart).not.toHaveBeenCalled();
});

test('Android가 아니면 시작하지 않는다', async () => {
  Platform.OS = 'ios';
  await expect(openVideoInExternalPlayer(CONTENT_URI)).resolves.toBe('unsupported');
  expect(mockedStart).not.toHaveBeenCalled();
});

test('열 수 있는 앱이 없어 실행이 실패하면 failed를 돌려주고 예외를 던지지 않는다', async () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  mockedStart.mockRejectedValue(new Error('No Activity found to handle Intent'));
  await expect(openVideoInExternalPlayer(CONTENT_URI)).resolves.toBe('failed');
  expect(warn).toHaveBeenCalled();
  warn.mockRestore();
});
