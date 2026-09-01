import { fireEvent, render, screen } from '@testing-library/react-native';
import { Linking } from 'react-native';

import { OPEN_SOURCE_LICENSES } from '../../legal/openSourceLicenses';
import { OpenSourceLicensesScreen } from '../OpenSourceLicensesScreen';

test('의존성 패키지 이름과 라이선스를 보여준다', async () => {
  await render(<OpenSourceLicensesScreen />);

  const first = OPEN_SOURCE_LICENSES[0];
  expect(screen.getByText(first.name)).toBeTruthy();
  expect(screen.getAllByText(first.license).length).toBeGreaterThan(0);
});

test('항목을 누르면 저장소 홈페이지를 연다', async () => {
  const openURLSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
  await render(<OpenSourceLicensesScreen />);

  const first = OPEN_SOURCE_LICENSES[0];
  await fireEvent.press(screen.getByTestId(`oss-license-item-${first.name}`));

  expect(openURLSpy).toHaveBeenCalledWith(first.homepage);
});
