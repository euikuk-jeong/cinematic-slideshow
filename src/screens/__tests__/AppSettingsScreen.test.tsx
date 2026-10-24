import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { AppSettingsScreen } from '../AppSettingsScreen';
import { getAppSetting, setAppSetting } from '../../db/client';

jest.mock('../../db/client', () => ({
  getAppSetting: jest.fn(),
  setAppSetting: jest.fn(),
}));
const mockedGetAppSetting = getAppSetting as jest.MockedFunction<typeof getAppSetting>;
const mockedSetAppSetting = setAppSetting as jest.MockedFunction<typeof setAppSetting>;

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: mockNavigate }),
}));

const mockSetPreference = jest.fn();
let mockPreference: 'light' | 'dark' | 'system' = 'system';
jest.mock('../../theme/ThemeContext', () => ({
  useAppTheme: () => ({
    colors: jest.requireActual('../../theme/colors').lightColors,
    scheme: 'light',
    get preference() {
      return mockPreference;
    },
    setPreference: mockSetPreference,
  }),
}));

beforeEach(() => {
  mockedGetAppSetting.mockReset().mockResolvedValue(null);
  mockedSetAppSetting.mockReset().mockResolvedValue(undefined);
  mockNavigate.mockClear();
  mockSetPreference.mockClear();
  mockPreference = 'system';
});

test('제외된 폴더 항목을 보여준다', async () => {
  await render(<AppSettingsScreen />);
  expect(screen.getByText('제외된 폴더')).toBeTruthy();
});

test('제외된 폴더 항목을 누르면 관리 화면으로 이동한다', async () => {
  await render(<AppSettingsScreen />);

  await fireEvent.press(screen.getByTestId('app-settings-hidden-albums'));

  expect(mockNavigate).toHaveBeenCalledWith('HiddenAlbums');
});

test('슬라이드쇼 기본 설정 항목을 보여준다', async () => {
  await render(<AppSettingsScreen />);
  expect(screen.getByText('슬라이드쇼 기본 설정')).toBeTruthy();
});

test('슬라이드쇼 기본 설정 항목을 누르면 설정 화면으로 이동한다', async () => {
  await render(<AppSettingsScreen />);

  await fireEvent.press(screen.getByTestId('app-settings-slideshow-defaults'));

  expect(mockNavigate).toHaveBeenCalledWith('SlideshowDefaults');
});

test('테마 옵션 3개(라이트/다크/시스템 설정)를 보여준다', async () => {
  await render(<AppSettingsScreen />);

  expect(screen.getByTestId('app-settings-theme-light')).toBeTruthy();
  expect(screen.getByTestId('app-settings-theme-dark')).toBeTruthy();
  expect(screen.getByTestId('app-settings-theme-system')).toBeTruthy();
});

test('다크 옵션을 누르면 setPreference가 dark로 호출된다', async () => {
  await render(<AppSettingsScreen />);

  await fireEvent.press(screen.getByTestId('app-settings-theme-dark'));

  expect(mockSetPreference).toHaveBeenCalledWith('dark');
});

describe('영상 접근 안내 표시 토글', () => {
  test('저장된 값이 없으면 켜져 있다(안내를 보여준다)', async () => {
    await render(<AppSettingsScreen />);
    await waitFor(() => expect(screen.getByTestId('app-settings-video-banner-toggle').props.value).toBe(true));
  });

  test('배너를 닫아둔 상태면 꺼져 있고, 켜면 닫힘 상태가 해제되어 저장된다', async () => {
    mockedGetAppSetting.mockResolvedValue('1');
    await render(<AppSettingsScreen />);
    await waitFor(() => expect(screen.getByTestId('app-settings-video-banner-toggle').props.value).toBe(false));
    await fireEvent(screen.getByTestId('app-settings-video-banner-toggle'), 'valueChange', true);
    expect(mockedSetAppSetting).toHaveBeenCalledWith('gallery_video_banner_dismissed', '0');
    expect(screen.getByTestId('app-settings-video-banner-toggle').props.value).toBe(true);
  });

  test('끄면 닫힘 상태로 저장된다', async () => {
    await render(<AppSettingsScreen />);
    await waitFor(() => expect(screen.getByTestId('app-settings-video-banner-toggle').props.value).toBe(true));
    await fireEvent(screen.getByTestId('app-settings-video-banner-toggle'), 'valueChange', false);
    expect(mockedSetAppSetting).toHaveBeenCalledWith('gallery_video_banner_dismissed', '1');
  });
});
