import { act, renderHook } from '@testing-library/react-native';

import { useDirectMoveGate } from '../useDirectMoveGate';

const mockFindGrant = jest.fn();
const mockRequestAccess = jest.fn();
jest.mock('../../photos/fileMover', () => ({
  findFolderGrant: (dir: string) => mockFindGrant(dir),
  requestFolderAccess: (dir: string) => mockRequestAccess(dir),
}));

const DEST = '/storage/emulated/0/_MyData/Photo/_Private_2026';
// 작업(이동/복사, 목적 폴더)은 요청 시점에 정해져 게이트가 그대로 들고 있다가 실행한다.
const MUTATION = { kind: 'moveDirect', destinationDir: DEST } as const;
const GRANT = { treeDocId: 'primary:_MyData', destinationDocId: 'primary:_MyData/Photo/_Private_2026' };

beforeEach(() => {
  jest.clearAllMocks();
  mockFindGrant.mockReturnValue(null);
});

describe('useDirectMoveGate', () => {
  it('대상 폴더를 포함하는 권한이 이미 있으면 안내 없이 바로 실행한다', async () => {
    mockFindGrant.mockReturnValue(GRANT);
    const run = jest.fn();
    const { result } = await renderHook(() => useDirectMoveGate(run, jest.fn()));
    await act(async () => result.current.request(MUTATION, '_Private_2026', DEST));
    expect(mockFindGrant).toHaveBeenCalledWith(DEST);
    expect(run).toHaveBeenCalledWith(MUTATION);
    expect(result.current.rationale.visible).toBe(false);
    expect(mockRequestAccess).not.toHaveBeenCalled();
  });

  it('권한이 없으면 고를 최상위 폴더를 알려주는 안내를 먼저 보여주고, 아직 실행하지 않는다', async () => {
    const run = jest.fn();
    const { result } = await renderHook(() => useDirectMoveGate(run, jest.fn()));
    await act(async () => result.current.request(MUTATION, '_Private_2026', DEST));
    expect(result.current.rationale.visible).toBe(true);
    expect(result.current.rationale.folderTitle).toBe('_Private_2026');
    expect(result.current.rationale.grantFolder).toBe('/_MyData');
    expect(run).not.toHaveBeenCalled();
    expect(mockRequestAccess).not.toHaveBeenCalled();
  });

  it('폴더 선택기에서 대상 폴더를 포함하는 폴더를 고르면 이어서 실행한다', async () => {
    mockRequestAccess.mockResolvedValue({ status: 'granted', grant: GRANT });
    const run = jest.fn();
    const { result } = await renderHook(() => useDirectMoveGate(run, jest.fn()));
    await act(async () => result.current.request(MUTATION, '_Private_2026', DEST));
    await act(async () => result.current.rationale.onContinue());
    expect(mockRequestAccess).toHaveBeenCalledWith(DEST);
    expect(result.current.rationale.visible).toBe(false);
    expect(run).toHaveBeenCalledWith(MUTATION);
  });

  it('다른 폴더를 고르면 실행하지 않고 고를 폴더를 담아 mismatch로 알린다', async () => {
    mockRequestAccess.mockResolvedValue({ status: 'mismatch', pickedDirectory: '/storage/emulated/0/Books' });
    const run = jest.fn();
    const onDenied = jest.fn();
    const { result } = await renderHook(() => useDirectMoveGate(run, onDenied));
    await act(async () => result.current.request(MUTATION, '_Private_2026', DEST));
    await act(async () => result.current.rationale.onContinue());
    expect(run).not.toHaveBeenCalled();
    expect(onDenied).toHaveBeenCalledWith('mismatch', '/_MyData');
  });

  it('선택기를 취소하면 조용히 끝낸다', async () => {
    mockRequestAccess.mockResolvedValue({ status: 'cancelled' });
    const run = jest.fn();
    const onDenied = jest.fn();
    const { result } = await renderHook(() => useDirectMoveGate(run, onDenied));
    await act(async () => result.current.request(MUTATION, '_Private_2026', DEST));
    await act(async () => result.current.rationale.onContinue());
    expect(run).not.toHaveBeenCalled();
    expect(onDenied).not.toHaveBeenCalled();
  });

  it('선택기 호출이 실패하면 error로 알린다', async () => {
    mockRequestAccess.mockRejectedValue(new Error('boom'));
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const run = jest.fn();
    const onDenied = jest.fn();
    const { result } = await renderHook(() => useDirectMoveGate(run, onDenied));
    await act(async () => result.current.request(MUTATION, '_Private_2026', DEST));
    await act(async () => result.current.rationale.onContinue());
    expect(run).not.toHaveBeenCalled();
    expect(onDenied).toHaveBeenCalledWith('error', '/_MyData');
  });

  it('안내에서 취소하면 선택기를 열지 않고 아무 일도 없다', async () => {
    const run = jest.fn();
    const onDenied = jest.fn();
    const { result } = await renderHook(() => useDirectMoveGate(run, onDenied));
    await act(async () => result.current.request(MUTATION, '_Private_2026', DEST));
    await act(async () => result.current.rationale.onCancel());
    expect(result.current.rationale.visible).toBe(false);
    expect(mockRequestAccess).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
    expect(onDenied).not.toHaveBeenCalled();
  });
});
