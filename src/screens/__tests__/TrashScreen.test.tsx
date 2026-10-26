import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { TrashScreen } from '../TrashScreen';

let mockAvailable = true;
const mockListTrash = jest.fn();
const mockRestore = jest.fn();
const mockDeleteForever = jest.fn();
jest.mock('../../photos/mediaTrash', () => ({
  isTrashAvailable: () => mockAvailable,
  listTrash: () => mockListTrash(),
  restoreFromTrash: (ids: string[]) => mockRestore(ids),
  deleteFromTrash: (ids: string[]) => mockDeleteForever(ids),
}));

// 실제 useFocusEffect는 네비게이터의 focus 이벤트에 의존한다 — 마운트 시 한 번 포커스된 것처럼 실행한다.
jest.mock('@react-navigation/native', () => {
  const { useEffect } = jest.requireActual('react');
  return {
    ...jest.requireActual('@react-navigation/native'),
    useFocusEffect: (callback: () => void | (() => void)) => {
      useEffect(() => callback(), [callback]);
    },
  };
});

const DAY = 24 * 60 * 60 * 1000;
const photo = (n: number, daysLeft: number | null) => ({
  id: `content://media/external/images/media/${n}`,
  filename: `p${n}.jpg`,
  isVideo: false,
  takenAt: null,
  modifiedAt: null,
  expiresAt: daysLeft === null ? null : Date.now() + daysLeft * DAY - 1000,
  size: 100,
  relativePath: 'Pictures/',
});
const video = (n: number) => ({ ...photo(n, 10), id: `content://media/external/video/media/${n}`, isVideo: true });
const idOf = (n: number) => `content://media/external/images/media/${n}`;

beforeEach(() => {
  jest.clearAllMocks();
  mockAvailable = true;
  mockListTrash.mockResolvedValue([photo(1, 3), photo(2, 20), video(3)]);
  mockRestore.mockResolvedValue(true);
  mockDeleteForever.mockResolvedValue(true);
});

describe('TrashScreen', () => {
  it('휴지통 항목을 남은 일수와 함께 보여준다(영상은 ▶ 표시)', async () => {
    await render(<TrashScreen />);
    expect(await screen.findByTestId(`trash-item-${idOf(1)}`)).toBeTruthy();
    expect(screen.getByTestId(`trash-days-${idOf(1)}`)).toHaveTextContent('3일 남음');
    expect(screen.getByTestId(`trash-days-${idOf(2)}`)).toHaveTextContent('20일 남음');
    expect(screen.getByText('▶')).toBeTruthy();
    expect(screen.getByText(/약 30일 동안 보관/)).toBeTruthy();
  });

  it('비어 있으면 안내를 보여주고 작업 바는 숨긴다', async () => {
    mockListTrash.mockResolvedValue([]);
    await render(<TrashScreen />);
    expect(await screen.findByTestId('trash-empty')).toBeTruthy();
    expect(screen.queryByTestId('trash-bar')).toBeNull();
  });

  it('이 기기에서 휴지통을 쓸 수 없으면 목록을 조회하지 않고 안내한다', async () => {
    mockAvailable = false;
    await render(<TrashScreen />);
    expect(screen.getByTestId('trash-unavailable')).toBeTruthy();
    expect(mockListTrash).not.toHaveBeenCalled();
  });

  it('조회에 실패하면 다시 시도할 수 있다', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockListTrash.mockRejectedValueOnce(new Error('boom'));
    await render(<TrashScreen />);
    await fireEvent.press(await screen.findByTestId('trash-retry'));
    expect(await screen.findByTestId(`trash-item-${idOf(1)}`)).toBeTruthy();
    warn.mockRestore();
  });

  it('탭하면 선택이 토글되고 선택이 없으면 복원은 비활성이다', async () => {
    await render(<TrashScreen />);
    await screen.findByTestId(`trash-item-${idOf(1)}`);
    expect(screen.getByTestId('trash-restore').props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(screen.getByTestId(`trash-item-${idOf(1)}`));
    expect(screen.getByTestId(`trash-select-check-${idOf(1)}`)).toBeTruthy();
    expect(screen.getByTestId('trash-selection-count')).toHaveTextContent('1개 선택');
    expect(screen.getByTestId('trash-restore').props.accessibilityState.disabled).toBe(false);
    await fireEvent.press(screen.getByTestId(`trash-item-${idOf(1)}`));
    expect(screen.queryByTestId(`trash-select-check-${idOf(1)}`)).toBeNull();
  });

  it('복원: 선택한 항목을 복원하고 목록을 다시 불러온다', async () => {
    await render(<TrashScreen />);
    await fireEvent.press(await screen.findByTestId(`trash-item-${idOf(2)}`));
    mockListTrash.mockResolvedValue([photo(1, 3), video(3)]);
    await fireEvent.press(screen.getByTestId('trash-restore'));
    expect(mockRestore).toHaveBeenCalledWith([idOf(2)]);
    expect(await screen.findByText('1개를 복원했어요')).toBeTruthy();
    await waitFor(() => expect(screen.queryByTestId(`trash-item-${idOf(2)}`)).toBeNull());
    expect(screen.getByTestId('trash-selection-count')).toHaveTextContent('0개 선택');
  });

  it('영구 삭제: 선택한 항목만 지운다', async () => {
    await render(<TrashScreen />);
    await fireEvent.press(await screen.findByTestId(`trash-item-${idOf(1)}`));
    expect(screen.getByTestId('trash-delete')).toHaveTextContent('영구 삭제');
    await fireEvent.press(screen.getByTestId('trash-delete'));
    expect(mockDeleteForever).toHaveBeenCalledWith([idOf(1)]);
    expect(await screen.findByText('1개를 영구 삭제했어요')).toBeTruthy();
  });

  it('선택이 없을 때의 "비우기"는 휴지통 전체를 영구 삭제한다', async () => {
    await render(<TrashScreen />);
    await screen.findByTestId(`trash-item-${idOf(1)}`);
    expect(screen.getByTestId('trash-delete')).toHaveTextContent('비우기');
    await fireEvent.press(screen.getByTestId('trash-delete'));
    expect(mockDeleteForever).toHaveBeenCalledWith([idOf(1), idOf(2), 'content://media/external/video/media/3']);
  });

  it('전체 선택 후 복원하면 전부 복원한다', async () => {
    await render(<TrashScreen />);
    await screen.findByTestId(`trash-item-${idOf(1)}`);
    await fireEvent.press(screen.getByTestId('trash-select-all'));
    expect(screen.getByTestId('trash-selection-count')).toHaveTextContent('3개 선택');
    await fireEvent.press(screen.getByTestId('trash-restore'));
    expect(mockRestore).toHaveBeenCalledWith([idOf(1), idOf(2), 'content://media/external/video/media/3']);
  });

  it('시스템 다이얼로그를 취소하면 선택을 유지하고 안내한다', async () => {
    mockRestore.mockResolvedValue(false);
    await render(<TrashScreen />);
    await fireEvent.press(await screen.findByTestId(`trash-item-${idOf(1)}`));
    await fireEvent.press(screen.getByTestId('trash-restore'));
    expect(await screen.findByTestId('trash-notice')).toHaveTextContent(/취소했거나 허용되지 않아/);
    expect(screen.getByTestId(`trash-select-check-${idOf(1)}`)).toBeTruthy();
  });

  it('작업이 예외로 실패해도 화면이 멈추지 않고 안내한다', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockRestore.mockRejectedValue(new Error('boom'));
    await render(<TrashScreen />);
    await fireEvent.press(await screen.findByTestId(`trash-item-${idOf(1)}`));
    await fireEvent.press(screen.getByTestId('trash-restore'));
    expect(await screen.findByTestId('trash-notice')).toBeTruthy();
    warn.mockRestore();
  });
});
