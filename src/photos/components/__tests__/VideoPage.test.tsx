import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { startActivityAsync } from 'expo-intent-launcher';

import { VideoPage, type VideoPageProps } from '../VideoPage';

type FakePlayer = {
  play: jest.Mock;
  pause: jest.Mock;
  seekBy: jest.Mock;
  loop: boolean;
  currentTime: number;
  duration: number;
  __emit: (name: string, payload?: unknown) => void;
};

const videoMock = jest.requireMock('expo-video') as { __players: FakePlayer[]; useVideoPlayer: jest.Mock };

function lastPlayer(): FakePlayer {
  return videoMock.__players[videoMock.__players.length - 1];
}

const baseProps: VideoPageProps = {
  testIdPrefix: 'v',
  uri: 'file:///a.mp4',
  assetId: 'content://media/external/video/media/7',
  durationMs: 65000,
  viewport: { width: 750, height: 1334 },
  active: true,
  controlsVisible: true,
  controlsBottomOffset: 64,
  onTap: jest.fn(),
  onRetry: jest.fn(),
};

beforeEach(() => {
  videoMock.__players.length = 0;
  jest.clearAllMocks();
});

test('자동재생·반복 없이 시작한다', async () => {
  await render(<VideoPage {...baseProps} />);
  expect(lastPlayer().play).not.toHaveBeenCalled();
  expect(lastPlayer().loop).toBe(false);
});

test('재생 버튼은 play, 다시 누르면 pause를 호출한다', async () => {
  await render(<VideoPage {...baseProps} />);
  await fireEvent.press(screen.getByTestId('v-video-toggle'));
  expect(lastPlayer().play).toHaveBeenCalledTimes(1);
  await fireEvent.press(screen.getByTestId('v-video-toggle'));
  expect(lastPlayer().pause).toHaveBeenCalledTimes(1);
});

test('±10초 버튼은 seekBy(±10)를 호출한다', async () => {
  await render(<VideoPage {...baseProps} />);
  await fireEvent.press(screen.getByTestId('v-video-forward10'));
  expect(lastPlayer().seekBy).toHaveBeenLastCalledWith(10);
  await fireEvent.press(screen.getByTestId('v-video-back10'));
  expect(lastPlayer().seekBy).toHaveBeenLastCalledWith(-10);
});

test('앞으로 건너뛰기는 영상 끝을 넘지 않고, 뒤로는 0 아래로 내려가지 않는다', async () => {
  await render(<VideoPage {...baseProps} />);
  lastPlayer().duration = 65;
  lastPlayer().currentTime = 60;
  await fireEvent.press(screen.getByTestId('v-video-forward10'));
  expect(lastPlayer().currentTime).toBe(65);
  lastPlayer().currentTime = 3;
  await fireEvent.press(screen.getByTestId('v-video-back10'));
  expect(lastPlayer().currentTime).toBe(0);
});

test('현재/전체 시간을 m:ss로 표시하고 timeUpdate에 따라 갱신한다', async () => {
  await render(<VideoPage {...baseProps} />);
  expect(screen.getByTestId('v-video-time')).toHaveTextContent('0:00 / 1:05');
  await act(async () => {
    lastPlayer().__emit('timeUpdate', { currentTime: 12 });
  });
  expect(screen.getByTestId('v-video-time')).toHaveTextContent('0:12 / 1:05');
});

test('플레이어가 알려주는 길이로 전체 시간을 갱신한다', async () => {
  await render(<VideoPage {...baseProps} durationMs={null} />);
  lastPlayer().duration = 90;
  await act(async () => {
    lastPlayer().__emit('statusChange', { status: 'readyToPlay' });
  });
  expect(screen.getByTestId('v-video-time')).toHaveTextContent('0:00 / 1:30');
});

test('재생 상태 이벤트에 따라 버튼 라벨이 바뀐다', async () => {
  await render(<VideoPage {...baseProps} />);
  expect(screen.getByTestId('v-video-toggle').props.accessibilityLabel).toBe('재생');
  await act(async () => {
    lastPlayer().__emit('playingChange', { isPlaying: true });
  });
  expect(screen.getByTestId('v-video-toggle').props.accessibilityLabel).toBe('일시정지');
});

test('페이지가 비활성화되면 일시정지한다', async () => {
  const view = await render(<VideoPage {...baseProps} />);
  expect(lastPlayer().pause).not.toHaveBeenCalled();
  await view.rerender(<VideoPage {...baseProps} active={false} />);
  expect(lastPlayer().pause).toHaveBeenCalledTimes(1);
});

test('비활성 상태에서 다시 활성화돼도 자동으로 재생하지 않는다(이어보기는 사용자가 재생)', async () => {
  const view = await render(<VideoPage {...baseProps} />);
  await view.rerender(<VideoPage {...baseProps} active={false} />);
  await view.rerender(<VideoPage {...baseProps} active />);
  expect(lastPlayer().play).not.toHaveBeenCalled();
});

test('영상 영역을 탭하면 onTap(크롬 토글)이 호출된다', async () => {
  await render(<VideoPage {...baseProps} />);
  await fireEvent.press(screen.getByTestId('v-video-surface'));
  expect(baseProps.onTap).toHaveBeenCalledTimes(1);
});

test('controlsVisible=false면 컨트롤이 숨는다', async () => {
  await render(<VideoPage {...baseProps} controlsVisible={false} />);
  expect(screen.queryByTestId('v-video-toggle')).toBeNull();
});

test('재생 오류가 나면 오류 화면과 재시도 버튼을 보여주고 console.warn으로 드러낸다', async () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  await render(<VideoPage {...baseProps} />);
  await act(async () => {
    lastPlayer().__emit('statusChange', { status: 'error' });
  });
  expect(screen.getByTestId('v-video-error')).toBeTruthy();
  expect(warn).toHaveBeenCalled();
  await fireEvent.press(screen.getByTestId('v-video-retry'));
  expect(baseProps.onRetry).toHaveBeenCalledTimes(1);
  warn.mockRestore();
});

test('컨트롤에 접근성 라벨이 있다', async () => {
  await render(<VideoPage {...baseProps} />);
  expect(screen.getByTestId('v-video-back10').props.accessibilityLabel).toBe('10초 뒤로');
  expect(screen.getByTestId('v-video-forward10').props.accessibilityLabel).toBe('10초 앞으로');
});

describe('다른 앱으로 열기', () => {
  const mockedStart = startActivityAsync as jest.MockedFunction<typeof startActivityAsync>;
  let originalOS: typeof Platform.OS;

  beforeEach(() => {
    originalOS = Platform.OS;
    Platform.OS = 'android';
    mockedStart.mockReset().mockResolvedValue({ resultCode: 0 });
  });
  afterEach(() => {
    Platform.OS = originalOS;
  });

  test('내장 플레이어를 멈추고 에셋 id(content URI)로 외부 플레이어를 연다', async () => {
    await render(<VideoPage {...baseProps} />);

    await fireEvent.press(screen.getByTestId('v-video-external'));

    expect(lastPlayer().pause).toHaveBeenCalled();
    await waitFor(() =>
      expect(mockedStart).toHaveBeenCalledWith('android.intent.action.VIEW', {
        data: 'content://media/external/video/media/7',
        type: 'video/*',
        flags: 1,
      })
    );
    expect(screen.queryByTestId('v-video-external-failed')).toBeNull();
  });

  test('열 수 있는 앱이 없으면 안내 문구를 보여준다', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockedStart.mockRejectedValue(new Error('No Activity found'));
    await render(<VideoPage {...baseProps} />);

    await fireEvent.press(screen.getByTestId('v-video-external'));

    expect(await screen.findByTestId('v-video-external-failed')).toBeTruthy();
    warn.mockRestore();
  });

  test('내장 재생이 실패한 화면에서도 외부 플레이어로 열 수 있다', async () => {
    await render(<VideoPage {...baseProps} />);
    await act(async () => {
      lastPlayer().__emit('statusChange', { status: 'error' });
    });

    await fireEvent.press(await screen.findByTestId('v-video-external'));

    await waitFor(() => expect(mockedStart).toHaveBeenCalledTimes(1));
  });

  test('Android가 아니면 버튼을 보여주지 않는다', async () => {
    Platform.OS = 'ios';
    await render(<VideoPage {...baseProps} />);

    expect(screen.queryByTestId('v-video-external')).toBeNull();
  });
});
