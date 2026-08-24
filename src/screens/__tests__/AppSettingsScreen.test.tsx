import { render, screen } from '@testing-library/react-native';

import { AppSettingsScreen } from '../AppSettingsScreen';

test('준비 중 안내 문구를 보여준다', async () => {
  await render(<AppSettingsScreen />);
  expect(screen.getByText('설정 기능은 준비 중입니다')).toBeTruthy();
});
