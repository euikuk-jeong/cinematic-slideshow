import { fireEvent, render, screen } from '@testing-library/react-native';
import { Linking } from 'react-native';

import { AppInfoScreen } from '../AppInfoScreen';
import appConfig from '../../../app.json';

test('앱 아이콘, 버전, GitHub 주소를 보여준다', async () => {
  await render(<AppInfoScreen />);
  expect(screen.getByTestId('app-info-icon')).toBeTruthy();
  expect(screen.getByText(appConfig.expo.name)).toBeTruthy();
  expect(screen.getByText(`버전 ${appConfig.expo.version}`)).toBeTruthy();
  expect(screen.getByText('https://github.com/euikuk-jeong/cinematic-slideshow')).toBeTruthy();
});

test('GitHub 주소를 누르면 브라우저로 연다', async () => {
  const openURLSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
  await render(<AppInfoScreen />);

  await fireEvent.press(screen.getByTestId('app-info-github-link'));

  expect(openURLSpy).toHaveBeenCalledWith('https://github.com/euikuk-jeong/cinematic-slideshow');
});
