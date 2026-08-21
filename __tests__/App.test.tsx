import { render, screen } from '@testing-library/react-native';

import App from '../App';

jest.mock('../src/permissions/useMediaLibraryPermission', () => ({
  useMediaLibraryPermission: () => ({
    state: 'granted',
    start: jest.fn(),
    confirmRationale: jest.fn(),
    cancelRationale: jest.fn(),
    openSettings: jest.fn(),
  }),
}));
jest.mock('expo-media-library', () => ({
  Album: { getAll: jest.fn().mockResolvedValue([]) },
}));

test('앨범 목록 화면으로 진입한다', async () => {
  await render(<App />);
  expect(await screen.findByText('사진 앨범이 없어요')).toBeTruthy();
});
