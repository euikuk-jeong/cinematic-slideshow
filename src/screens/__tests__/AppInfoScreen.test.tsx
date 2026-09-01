import { fireEvent, render, screen } from '@testing-library/react-native';
import { Linking } from 'react-native';

import { AppInfoScreen } from '../AppInfoScreen';
import appConfig from '../../../app.json';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: mockNavigate }),
}));

beforeEach(() => {
  mockNavigate.mockClear();
});

test('앱 아이콘, 버전, GitHub 주소를 보여준다', async () => {
  await render(<AppInfoScreen />);
  expect(screen.getByTestId('app-info-icon')).toBeTruthy();
  expect(screen.getByText(appConfig.expo.name)).toBeTruthy();
  expect(screen.getByText(`버전 ${appConfig.expo.version}`)).toBeTruthy();
  expect(screen.getByText('github.com/cinematic-slideshow')).toBeTruthy();
});

test('GitHub 주소를 누르면 브라우저로 연다', async () => {
  const openURLSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
  await render(<AppInfoScreen />);

  await fireEvent.press(screen.getByTestId('app-info-github-link'));

  expect(openURLSpy).toHaveBeenCalledWith('https://github.com/euikuk-jeong/cinematic-slideshow');
});

test('오픈소스 라이선스 항목을 누르면 목록 화면으로 이동한다', async () => {
  await render(<AppInfoScreen />);

  await fireEvent.press(screen.getByTestId('app-info-oss-licenses-link'));

  expect(mockNavigate).toHaveBeenCalledWith('OpenSourceLicenses');
});
