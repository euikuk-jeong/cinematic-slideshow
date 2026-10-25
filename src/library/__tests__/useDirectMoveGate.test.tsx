import { act, renderHook } from '@testing-library/react-native';
import { AppState } from 'react-native';

import { useDirectMoveGate } from '../useDirectMoveGate';

const mockIsGranted = jest.fn();
const mockOpenSettings = jest.fn();
jest.mock('../../photos/fileMover', () => ({
  isAllFilesAccessGranted: () => mockIsGranted(),
  openAllFilesAccessSettings: () => mockOpenSettings(),
}));

let appStateListener: ((state: string) => void) | null = null;
// 작업(이동/복사, 목적 폴더)은 요청 시점에 정해져 게이트가 그대로 들고 있다가 실행한다.
const MUTATION = { kind: 'moveDirect', destinationDir: '/storage/emulated/0/_MyData/Photo/_Private_2026' } as const;

beforeEach(() => {
  jest.clearAllMocks();
  appStateListener = null;
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, listener: (state: string) => void) => {
    appStateListener = listener;
    return { remove: jest.fn() };
  }) as never);
});

describe('useDirectMoveGate', () => {
  it('이미 허용돼 있으면 안내 없이 바로 실행한다', async () => {
    mockIsGranted.mockReturnValue(true);
    const run = jest.fn();
    const { result } = await renderHook(() => useDirectMoveGate(run, jest.fn()));
    await act(async () => result.current.request(MUTATION, '_Private_2026'));
    expect(run).toHaveBeenCalledWith(MUTATION);
    expect(result.current.rationale.visible).toBe(false);
  });

  it('허용 전이면 이유를 설명하는 안내를 먼저 보여주고, 아직 실행하지 않는다', async () => {
    mockIsGranted.mockReturnValue(false);
    const run = jest.fn();
    const { result } = await renderHook(() => useDirectMoveGate(run, jest.fn()));
    await act(async () => result.current.request(MUTATION, '_Private_2026'));
    expect(result.current.rationale.visible).toBe(true);
    expect(result.current.rationale.folderTitle).toBe('_Private_2026');
    expect(run).not.toHaveBeenCalled();
    expect(mockOpenSettings).not.toHaveBeenCalled();
  });

  it('설정을 열고 돌아왔을 때 허용돼 있으면 이어서 실행한다', async () => {
    mockIsGranted.mockReturnValue(false);
    const run = jest.fn();
    const { result } = await renderHook(() => useDirectMoveGate(run, jest.fn()));
    await act(async () => result.current.request(MUTATION, '_Private_2026'));
    await act(async () => result.current.rationale.onOpenSettings());
    expect(mockOpenSettings).toHaveBeenCalledTimes(1);
    expect(result.current.rationale.visible).toBe(false);

    mockIsGranted.mockReturnValue(true);
    await act(async () => appStateListener?.('active'));
    expect(run).toHaveBeenCalledWith(MUTATION);
  });

  it('설정에서 허용하지 않고 돌아오면 실행하지 않고 거부를 알린다', async () => {
    mockIsGranted.mockReturnValue(false);
    const run = jest.fn();
    const onDenied = jest.fn();
    const { result } = await renderHook(() => useDirectMoveGate(run, onDenied));
    await act(async () => result.current.request(MUTATION, '_Private_2026'));
    await act(async () => result.current.rationale.onOpenSettings());
    await act(async () => appStateListener?.('active'));
    expect(run).not.toHaveBeenCalled();
    expect(onDenied).toHaveBeenCalledTimes(1);
  });

  it('설정을 열지 않고 취소하면 아무 일도 없고, 이후 앱 활성화에도 반응하지 않는다', async () => {
    mockIsGranted.mockReturnValue(false);
    const run = jest.fn();
    const onDenied = jest.fn();
    const { result } = await renderHook(() => useDirectMoveGate(run, onDenied));
    await act(async () => result.current.request(MUTATION, '_Private_2026'));
    await act(async () => result.current.rationale.onCancel());
    mockIsGranted.mockReturnValue(true);
    await act(async () => appStateListener?.('active'));
    expect(run).not.toHaveBeenCalled();
    expect(onDenied).not.toHaveBeenCalled();
    expect(result.current.rationale.visible).toBe(false);
  });

});
