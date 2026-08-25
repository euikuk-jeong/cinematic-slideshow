import { fireEvent, render, screen } from '@testing-library/react-native';

import { AppSettingsScreen } from '../AppSettingsScreen';

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
