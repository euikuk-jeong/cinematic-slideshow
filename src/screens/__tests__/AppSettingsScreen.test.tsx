import { fireEvent, render, screen } from '@testing-library/react-native';

import { AppSettingsScreen } from '../AppSettingsScreen';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: mockNavigate }),
}));

beforeEach(() => {
  mockNavigate.mockClear();
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
