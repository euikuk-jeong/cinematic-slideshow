import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useAudioPlaylist } from 'expo-audio';

import { BUNDLED_MUSIC_TRACKS } from '../../../assets/music/bundled';
import { getMusicTracksBySettingsId } from '../../db/client';
import { MUSIC_END_FADE_OUT_MS, MUSIC_RESTORE_FADE_MS } from '../musicPlaylist';
import { useSlideshowMusic } from '../useSlideshowMusic';

jest.mock('../../db/client', () => ({
  getMusicTracksBySettingsId: jest.fn(),
}));
// 번들 트랙만 쓰므로 기기 음원 조회(MediaLibrary.Asset)는 호출되지 않는다 — import 시 throw만 막는다.
jest.mock('expo-media-library', () => ({ Asset: jest.fn() }));

const mockedGetTracks = getMusicTracksBySettingsId as jest.MockedFunction<typeof getMusicTracksBySettingsId>;
const mockedUseAudioPlaylist = useAudioPlaylist as jest.Mock;

// 전역 mock(jest.setup.js)은 렌더마다 새 객체를 돌려주므로, 볼륨 변화를 추적할 수 있게 같은 객체를 돌려준다.
function stablePlaylist() {
  const playlist = {
    volume: 1,
    play: jest.fn(),
    pause: jest.fn(),
    next: jest.fn(),
    previous: jest.fn(),
  };
  mockedUseAudioPlaylist.mockImplementation(() => playlist);
  return playlist;
}

beforeEach(() => {
  jest.useFakeTimers();
  mockedGetTracks.mockResolvedValue([
    {
      id: 1,
      sourceType: 'bundled',
      sourceValue: BUNDLED_MUSIC_TRACKS[0].id,
      title: null,
      artist: null,
      coverUri: null,
      createdAt: '',
    },
  ]);
});

afterEach(() => {
  jest.useRealTimers();
  mockedUseAudioPlaylist.mockReset();
});

async function renderMusic() {
  const playlist = stablePlaylist();
  const hook = await renderHook(() => useSlideshowMusic(1));
  await waitFor(() => expect(hook.result.current.trackCount).toBe(1));
  playlist.play.mockClear();
  return { ...hook, playlist };
}

test('종료 시 음악을 멈추지 않고 볼륨을 10초에 걸쳐 기본값의 10%로 줄인다', async () => {
  const { result, playlist } = await renderMusic();

  await act(async () => result.current.lowerMusicForEnd());
  await act(async () => {
    jest.advanceTimersByTime(MUSIC_END_FADE_OUT_MS / 2);
  });
  // 절반 시점: -10dB(≈0.316) 근처 — 한 번에 떨어지지 않고, 선형(0.55)보다 낮게 고르게 줄어든다.
  expect(playlist.volume).toBeGreaterThan(0.25);
  expect(playlist.volume).toBeLessThan(0.4);

  await act(async () => {
    jest.advanceTimersByTime(MUSIC_END_FADE_OUT_MS);
  });
  expect(playlist.volume).toBe(0.1);
  expect(playlist.pause).not.toHaveBeenCalled();
  expect(result.current.musicOn).toBe(true);
});

test('종료 상태에서 벗어나면 1.5초 만에 기본 볼륨으로 되돌린다', async () => {
  const { result, playlist } = await renderMusic();

  await act(async () => result.current.lowerMusicForEnd());
  await act(async () => {
    jest.advanceTimersByTime(MUSIC_END_FADE_OUT_MS * 2);
  });
  expect(playlist.volume).toBe(0.1);

  await act(async () => result.current.restoreMusicVolume());
  await act(async () => {
    jest.advanceTimersByTime(MUSIC_RESTORE_FADE_MS / 2);
  });
  expect(playlist.volume).toBeGreaterThan(0.1);
  expect(playlist.volume).toBeLessThan(1);

  await act(async () => {
    jest.advanceTimersByTime(MUSIC_RESTORE_FADE_MS);
  });
  expect(playlist.volume).toBe(1);
});

test('페이드 도중 반대로 바꾸면 현재 볼륨에서 이어서 옮겨간다(튀지 않음)', async () => {
  const { result, playlist } = await renderMusic();

  await act(async () => result.current.lowerMusicForEnd());
  await act(async () => {
    jest.advanceTimersByTime(MUSIC_END_FADE_OUT_MS / 2);
  });
  const midVolume = playlist.volume;

  await act(async () => result.current.restoreMusicVolume());
  await act(async () => {
    jest.advanceTimersByTime(200);
  });
  // 1로 즉시 튀거나 0.1로 떨어지지 않고 중간값 근처에서 올라가기 시작한다.
  expect(playlist.volume).toBeGreaterThanOrEqual(midVolume);
  expect(playlist.volume).toBeLessThan(1);

  await act(async () => {
    jest.advanceTimersByTime(MUSIC_RESTORE_FADE_MS * 2);
  });
  expect(playlist.volume).toBe(1);
});

test('재생목록 native 객체가 이미 해제돼 볼륨 설정이 throw해도 화면이 죽지 않는다', async () => {
  const { result, playlist } = await renderMusic();
  Object.defineProperty(playlist, 'volume', {
    set() {
      throw new Error('Cannot use shared object that was already released');
    },
    get() {
      return 1;
    },
  });

  await act(async () => result.current.lowerMusicForEnd());
  await act(async () => {
    jest.advanceTimersByTime(MUSIC_END_FADE_OUT_MS * 2);
  });
  expect(playlist.pause).not.toHaveBeenCalled();
});

test('언마운트되면 진행 중인 페이드를 멈춘다', async () => {
  const { result, playlist, unmount } = await renderMusic();

  await act(async () => result.current.lowerMusicForEnd());
  await act(async () => {
    jest.advanceTimersByTime(MUSIC_END_FADE_OUT_MS / 3);
  });
  await unmount();
  const volumeAtUnmount = playlist.volume;
  jest.advanceTimersByTime(MUSIC_END_FADE_OUT_MS * 2);
  expect(playlist.volume).toBe(volumeAtUnmount);
});
