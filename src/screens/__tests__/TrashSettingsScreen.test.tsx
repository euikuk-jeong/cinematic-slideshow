import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { TrashSettingsScreen } from '../TrashSettingsScreen';
import { getAppSetting, setAppSetting } from '../../db/client';

jest.mock('../../db/client', () => ({
  getAppSetting: jest.fn(),
  setAppSetting: jest.fn(),
}));
const mockedGetAppSetting = getAppSetting as jest.MockedFunction<typeof getAppSetting>;
const mockedSetAppSetting = setAppSetting as jest.MockedFunction<typeof setAppSetting>;

jest.mock('../../theme/ThemeContext', () => ({
  useAppTheme: () => ({
    colors: jest.requireActual('../../theme/colors').lightColors,
    scheme: 'light',
    preference: 'system',
    setPreference: jest.fn(),
  }),
}));

beforeEach(() => {
  mockedGetAppSetting.mockReset().mockResolvedValue(null);
  mockedSetAppSetting.mockReset().mockResolvedValue(undefined);
});

const selected = (days: number) => screen.getByTestId(`trash-retention-${days}`).props.accessibilityState.selected;

test('보관 기간 선택지 3개(7·14·30일)를 보여주고 저장된 값이 없으면 30일이 선택돼 있다', async () => {
  await render(<TrashSettingsScreen />);

  for (const days of [7, 14, 30]) {
    expect(screen.getByTestId(`trash-retention-${days}`)).toBeTruthy();
  }
  await waitFor(() => expect(selected(30)).toBe(true));
  expect(mockedGetAppSetting).toHaveBeenCalledWith('trash_retention_days');
});

test('저장된 값을 선택 상태로 보여준다', async () => {
  mockedGetAppSetting.mockResolvedValue('14');
  await render(<TrashSettingsScreen />);

  await waitFor(() => expect(selected(14)).toBe(true));
  expect(selected(30)).toBe(false);
});

test('선택하면 즉시 저장한다', async () => {
  await render(<TrashSettingsScreen />);
  await waitFor(() => expect(selected(30)).toBe(true));

  await fireEvent.press(screen.getByTestId('trash-retention-7'));

  expect(mockedSetAppSetting).toHaveBeenCalledWith('trash_retention_days', '7');
  expect(selected(7)).toBe(true);
  expect(selected(30)).toBe(false);
});

test('목록에 없는 저장값(30일보다 긴 값 포함)은 기본 30일로 본다', async () => {
  mockedGetAppSetting.mockResolvedValue('90');
  await render(<TrashSettingsScreen />);

  await waitFor(() => expect(selected(30)).toBe(true));
});
