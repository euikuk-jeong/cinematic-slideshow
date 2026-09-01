import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';

import { SlideshowPlayerScreen } from '../SlideshowPlayerScreen';
import * as db from '../../db/client';
import type { MusicTrack, SlideshowSettings } from '../../db/types';

const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ goBack: mockGoBack }),
}));

jest.mock('../../db/client', () => ({
  getSlideshowSettingsByAlbumId: jest.fn(),
  getSlideshowDefaults: jest.fn().mockResolvedValue({
    transitionIntervalSec: 5,
    orderMode: 'sequential',
    repeatMode: 'once',
    sortCriterion: 'creation_time',
    sortDirection: 'asc',
  }),
  getSelectedPhotoIds: jest.fn(),
  getMusicTracksBySettingsId: jest.fn(),
}));

interface FakeAssetMetadata {
  id: string;
  filename: string | null;
  creationTime: number | null;
}

let mockQueryResult: FakeAssetMetadata[] = [];
// getUri()가 한 번만 실패하고 이후엔 성공하도록 만들고 싶은 id들 — 삭제된 사진 등으로
// uri 조회가 실패해도 자동전환 타이머 체인이 끊기지 않는지 검증하는 테스트 전용.
let mockFailOnceIds = new Set<string>();

jest.mock('expo-media-library', () => ({
  Album: jest.fn().mockImplementation((id: string) => ({ id })),
  Query: jest.fn().mockImplementation(() => ({
    album: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    exeForMetadata: jest.fn().mockImplementation(() => Promise.resolve(mockQueryResult)),
  })),
  Asset: jest.fn().mockImplementation((id: string) => ({
    getUri: jest.fn().mockImplementation(() => {
      if (mockFailOnceIds.has(id)) {
        mockFailOnceIds.delete(id);
        return Promise.reject(new Error('mock getUri failure'));
      }
      return Promise.resolve(`file:///${id}.jpg`);
    }),
  })),
  AssetField: { MEDIA_TYPE: 'mediaType' },
  MediaType: { IMAGE: 'image' },
}));

const mockLockAsync = jest.fn().mockResolvedValue(undefined);
const mockUnlockAsync = jest.fn().mockResolvedValue(undefined);
jest.mock('expo-screen-orientation', () => ({
  OrientationLock: { LANDSCAPE: 'LANDSCAPE', PORTRAIT_UP: 'PORTRAIT_UP' },
  lockAsync: (...args: unknown[]) => mockLockAsync(...args),
  unlockAsync: (...args: unknown[]) => mockUnlockAsync(...args),
}));

const mockedDb = db as jest.Mocked<typeof db>;

const routeProps = { route: { params: { albumId: 1, deviceAlbumId: 'device-album-1' } } } as any;

// 실제 타이머를 쓰되(이 프로젝트의 다른 화면 테스트들과 동일한 방식 — fake timers 미사용),
// 전환간격을 아주 짧게(ms 단위) 잡아 테스트를 빠르게 만든다. transitionIntervalSec은
// UI 슬라이더가 2~10초로 제한할 뿐 DB/컴포넌트 레벨에서 검증하지 않아 테스트에서 자유롭게 줄일 수 있다.
const settings: SlideshowSettings = {
  id: 1,
  albumId: 1,
  transitionIntervalSec: 4,
  orderMode: 'sequential',
  repeatMode: 'loop',
  sortCriterion: 'creation_time',
  sortDirection: 'asc',
  updatedAt: '2026-08-30T00:00:00.000Z',
};

const musicTrack1: MusicTrack = {
  id: 1,
  sourceType: 'bundled',
  sourceValue: 'calm',
  title: 'Calm Piano',
  artist: 'Alex Morgan',
  coverUri: null,
  createdAt: '2026-08-30T00:00:00.000Z',
};
const musicTrack2: MusicTrack = {
  id: 2,
  sourceType: 'bundled',
  sourceValue: 'calm_2',
  title: 'Evening Calm Piano',
  artist: 'andriih',
  coverUri: null,
  createdAt: '2026-08-30T00:00:00.000Z',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockedDb.getSelectedPhotoIds.mockResolvedValue([]);
  mockedDb.getMusicTracksBySettingsId.mockResolvedValue([]);
  mockFailOnceIds = new Set();
});

test('사진이 없으면 안내 문구를 보여준다', async () => {
  mockedDb.getSlideshowSettingsByAlbumId.mockResolvedValue(settings);
  mockQueryResult = [];
  await render(<SlideshowPlayerScreen {...routeProps} />);
  expect(await screen.findByText('표시할 사진이 없어요')).toBeTruthy();
});

test('설정이 없으면(신규 앨범) 기본값으로 첫 사진을 보여준다', async () => {
  mockedDb.getSlideshowSettingsByAlbumId.mockResolvedValue(null);
  mockQueryResult = [{ id: 'p1', filename: 'a.jpg', creationTime: 100 }];
  await render(<SlideshowPlayerScreen {...routeProps} />);
  expect(await screen.findByTestId('slideshow-close')).toBeTruthy();
});

test('선택된 사진이 있으면 그것만 재생 대상이 된다 — 1장만 남으면 loop여도 그대로 유지한다', async () => {
  mockedDb.getSlideshowSettingsByAlbumId.mockResolvedValue({ ...settings, transitionIntervalSec: 0.02 });
  mockedDb.getSelectedPhotoIds.mockResolvedValue(['p2']);
  mockQueryResult = [
    { id: 'p1', filename: 'a.jpg', creationTime: 100 },
    { id: 'p2', filename: 'b.jpg', creationTime: 200 },
  ];
  await render(<SlideshowPlayerScreen {...routeProps} />);
  await screen.findByTestId('slideshow-close');

  // 전환 애니메이션(700ms 고정, src/slideshow/transitions.ts)까지 act() 안에서 실제로
  // 끝나도록 넉넉히 기다린다 — 짧게 기다리면 애니메이션 콜백이 act() 밖에서 setState를
  // 트리거해 "not wrapped in act" 경고가 난다.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 800));
  });

  expect(mockGoBack).not.toHaveBeenCalled();
});

test('전환 간격+전환 애니메이션(700ms)이 끝나면 다음 사진으로 넘어간다', async () => {
  mockedDb.getSlideshowSettingsByAlbumId.mockResolvedValue({ ...settings, transitionIntervalSec: 0.05 });
  mockQueryResult = [
    { id: 'p1', filename: 'a.jpg', creationTime: 100 },
    { id: 'p2', filename: 'b.jpg', creationTime: 200 },
  ];
  await render(<SlideshowPlayerScreen {...routeProps} />);

  const photo = await screen.findByTestId('slideshow-photo');
  expect(photo.props.source.uri).toBe('file:///p1.jpg');

  await waitFor(
    async () => {
      const current = await screen.findByTestId('slideshow-photo');
      expect(current.props.source.uri).toBe('file:///p2.jpg');
    },
    { timeout: 3000 }
  );
});

test('once 모드에서 마지막 사진 다음 전환 시점에 뒤로가기 대신 종료 배너를 띄우고 마지막 사진에 멈춘다', async () => {
  mockedDb.getSlideshowSettingsByAlbumId.mockResolvedValue({ ...settings, repeatMode: 'once', transitionIntervalSec: 0.02 });
  mockQueryResult = [{ id: 'p1', filename: 'a.jpg', creationTime: 100 }];
  await render(<SlideshowPlayerScreen {...routeProps} />);
  await screen.findByTestId('slideshow-close');

  await screen.findByTestId('slideshow-ended-banner');
  expect(mockGoBack).not.toHaveBeenCalled();
  const current = await screen.findByTestId('slideshow-photo');
  expect(current.props.source.uri).toBe('file:///p1.jpg');
});

test('종료 배너가 뜬 뒤 이전 버튼을 누르면 배너가 사라진다', async () => {
  mockedDb.getSlideshowSettingsByAlbumId.mockResolvedValue({ ...settings, repeatMode: 'once', transitionIntervalSec: 0.02 });
  mockQueryResult = [
    { id: 'p1', filename: 'a.jpg', creationTime: 100 },
    { id: 'p2', filename: 'b.jpg', creationTime: 200 },
  ];
  await render(<SlideshowPlayerScreen {...routeProps} />);
  await screen.findByTestId('slideshow-ended-banner');

  await fireEvent.press(await screen.findByTestId('slideshow-prev'));

  await waitFor(() => expect(screen.queryByTestId('slideshow-ended-banner')).toBeNull());

  // 전환 애니메이션(700ms 고정)까지 act() 안에서 끝나도록 기다린다 — 그렇지 않으면 이
  // 테스트가 끝난 뒤에도 남아있는 runTransition의 setState가 다음 테스트 도중 act() 밖에서
  // 실행돼 "not wrapped in act" 경고가 난다(위 "선택된 사진이 있으면..." 테스트와 동일 이유).
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 800));
  });
});

test('설정에 저장된 정렬 기준/방향으로 재생 순서를 정한다(파일명 내림차순)', async () => {
  mockedDb.getSlideshowSettingsByAlbumId.mockResolvedValue({ ...settings, sortCriterion: 'filename', sortDirection: 'desc' });
  mockQueryResult = [
    { id: 'p1', filename: 'a.jpg', creationTime: 100 },
    { id: 'p2', filename: 'b.jpg', creationTime: 200 },
  ];
  await render(<SlideshowPlayerScreen {...routeProps} />);

  const photo = await screen.findByTestId('slideshow-photo');
  expect(photo.props.source.uri).toBe('file:///p2.jpg');
});

test('닫기 버튼을 누르면 뒤로가기 한다', async () => {
  mockedDb.getSlideshowSettingsByAlbumId.mockResolvedValue(settings);
  mockQueryResult = [{ id: 'p1', filename: 'a.jpg', creationTime: 100 }];
  await render(<SlideshowPlayerScreen {...routeProps} />);

  await fireEvent.press(await screen.findByTestId('slideshow-close'));

  expect(mockGoBack).toHaveBeenCalledTimes(1);
});

test('다음 버튼을 누르면 자동 전환 간격을 기다리지 않고 바로 다음 사진으로 전환한다', async () => {
  // 자동 전환은 충분히 길게(10초) 잡아 이 테스트 시간 안엔 저절로 안 넘어가게 한다 —
  // 넘어간다면 그게 다음 버튼 때문인지 자동전환 때문인지 구분이 안 됨.
  mockedDb.getSlideshowSettingsByAlbumId.mockResolvedValue({ ...settings, transitionIntervalSec: 10 });
  mockQueryResult = [
    { id: 'p1', filename: 'a.jpg', creationTime: 100 },
    { id: 'p2', filename: 'b.jpg', creationTime: 200 },
  ];
  await render(<SlideshowPlayerScreen {...routeProps} />);

  const photo = await screen.findByTestId('slideshow-photo');
  expect(photo.props.source.uri).toBe('file:///p1.jpg');

  await fireEvent.press(await screen.findByTestId('slideshow-next'));

  await waitFor(async () => {
    const current = await screen.findByTestId('slideshow-photo');
    expect(current.props.source.uri).toBe('file:///p2.jpg');
  });
});

test('이전 버튼을 첫 사진에서 누르면(loop) 마지막 사진으로 전환한다', async () => {
  mockedDb.getSlideshowSettingsByAlbumId.mockResolvedValue({ ...settings, transitionIntervalSec: 10 });
  mockQueryResult = [
    { id: 'p1', filename: 'a.jpg', creationTime: 100 },
    { id: 'p2', filename: 'b.jpg', creationTime: 200 },
    { id: 'p3', filename: 'c.jpg', creationTime: 300 },
  ];
  await render(<SlideshowPlayerScreen {...routeProps} />);
  await screen.findByTestId('slideshow-photo');

  await fireEvent.press(await screen.findByTestId('slideshow-prev'));

  await waitFor(async () => {
    const current = await screen.findByTestId('slideshow-photo');
    expect(current.props.source.uri).toBe('file:///p3.jpg');
  });
});

test('이전 버튼을 once 모드 첫 사진에서 누르면 아무 일도 일어나지 않는다', async () => {
  mockedDb.getSlideshowSettingsByAlbumId.mockResolvedValue({ ...settings, repeatMode: 'once', transitionIntervalSec: 10 });
  mockQueryResult = [
    { id: 'p1', filename: 'a.jpg', creationTime: 100 },
    { id: 'p2', filename: 'b.jpg', creationTime: 200 },
  ];
  await render(<SlideshowPlayerScreen {...routeProps} />);
  await screen.findByTestId('slideshow-photo');

  await fireEvent.press(await screen.findByTestId('slideshow-prev'));

  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 200));
  });
  const current = await screen.findByTestId('slideshow-photo');
  expect(current.props.source.uri).toBe('file:///p1.jpg');
  expect(mockGoBack).not.toHaveBeenCalled();
});

test('일시정지 버튼을 누르면 자동 전환이 멈추고, 다시 누르면 재개한다', async () => {
  mockedDb.getSlideshowSettingsByAlbumId.mockResolvedValue({ ...settings, transitionIntervalSec: 0.05 });
  mockQueryResult = [
    { id: 'p1', filename: 'a.jpg', creationTime: 100 },
    { id: 'p2', filename: 'b.jpg', creationTime: 200 },
  ];
  await render(<SlideshowPlayerScreen {...routeProps} />);
  await screen.findByTestId('slideshow-photo');

  await fireEvent.press(await screen.findByTestId('slideshow-play-pause'));
  expect(await screen.findByText('▶')).toBeTruthy();

  // 일시정지 중엔 전환 간격(50ms)+애니메이션(700ms)이 지나도 넘어가지 않아야 한다.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 300));
  });
  const stillFirst = await screen.findByTestId('slideshow-photo');
  expect(stillFirst.props.source.uri).toBe('file:///p1.jpg');

  await fireEvent.press(await screen.findByTestId('slideshow-play-pause'));
  expect(await screen.findByText('❙❙')).toBeTruthy();

  await waitFor(async () => {
    const current = await screen.findByTestId('slideshow-photo');
    expect(current.props.source.uri).toBe('file:///p2.jpg');
  });
});

test('중간 사진의 uri 조회가 한 번 실패해도 자동전환 타이머 체인이 끊기지 않고 다음 시도에서 이어서 재생된다', async () => {
  // 이 테스트만 쓰는 새 id를 사용 — resolvePhotoUri()의 모듈 스코프 캐시가 다른 테스트에서
  // 먼저 성공 resolve한 id를 재사용하면 이 테스트에서 getUri()가 아예 호출되지 않아
  // mockFailOnceIds가 무의미해진다.
  mockedDb.getSlideshowSettingsByAlbumId.mockResolvedValue({ ...settings, transitionIntervalSec: 0.05 });
  mockQueryResult = [
    { id: 'r1', filename: 'a.jpg', creationTime: 100 },
    { id: 'r2', filename: 'b.jpg', creationTime: 200 },
    { id: 'r3', filename: 'c.jpg', creationTime: 300 },
  ];
  mockFailOnceIds.add('r2');
  await render(<SlideshowPlayerScreen {...routeProps} />);

  const first = await screen.findByTestId('slideshow-photo');
  expect(first.props.source.uri).toBe('file:///r1.jpg');

  // r2로의 첫 시도는 실패 → 재예약 → 같은 자리에서 재시도 → 성공 → r3까지 이어진다.
  // 고정 sleep 대신 waitFor(폴링)로 확인 — 전체 스위트를 함께 돌릴 때의 타이밍 변동에
  // 더 안정적이다(고정 sleep 방식은 부하가 클 때 간헐적으로 실패하는 것을 확인함).
  await waitFor(
    async () => {
      const current = await screen.findByTestId('slideshow-photo');
      expect(current.props.source.uri).toBe('file:///r2.jpg');
    },
    { timeout: 5000 }
  );
  await waitFor(
    async () => {
      const current = await screen.findByTestId('slideshow-photo');
      expect(current.props.source.uri).toBe('file:///r3.jpg');
    },
    { timeout: 5000 }
  );
});

test('로드가 끝나면 툴바(이전/일시정지/다음)가 노출된 상태로 시작한다', async () => {
  mockedDb.getSlideshowSettingsByAlbumId.mockResolvedValue(settings);
  mockQueryResult = [{ id: 'p1', filename: 'a.jpg', creationTime: 100 }];
  await render(<SlideshowPlayerScreen {...routeProps} />);

  const toolbar = await screen.findByTestId('slideshow-toolbar');
  expect(toolbar.props.style).toEqual(expect.arrayContaining([expect.objectContaining({ opacity: 1 })]));
});

test('배경음악이 있으면 재생 시작 시 좌측 하단에 트랙 정보 토스트를 띄운다', async () => {
  mockedDb.getSlideshowSettingsByAlbumId.mockResolvedValue(settings);
  mockedDb.getMusicTracksBySettingsId.mockResolvedValue([musicTrack1]);
  mockQueryResult = [{ id: 'p1', filename: 'a.jpg', creationTime: 100 }];
  await render(<SlideshowPlayerScreen {...routeProps} />);

  const toast = await screen.findByTestId('slideshow-music-toast');
  expect(await screen.findByText('Calm Piano · Alex Morgan')).toBeTruthy();
  expect(toast.props.style).toEqual(expect.arrayContaining([expect.objectContaining({ opacity: 1 })]));
});

test('배경음악이 없으면 음악 토글/이전곡/다음곡 버튼을 보여주지 않는다', async () => {
  mockedDb.getSlideshowSettingsByAlbumId.mockResolvedValue(settings);
  mockQueryResult = [{ id: 'p1', filename: 'a.jpg', creationTime: 100 }];
  await render(<SlideshowPlayerScreen {...routeProps} />);
  await screen.findByTestId('slideshow-toolbar');

  expect(screen.queryByTestId('slideshow-music-toggle')).toBeNull();
});

test('트랙이 1곡이면 음악 토글만 보여주고 이전곡/다음곡 버튼은 숨긴다', async () => {
  mockedDb.getSlideshowSettingsByAlbumId.mockResolvedValue(settings);
  mockedDb.getMusicTracksBySettingsId.mockResolvedValue([musicTrack1]);
  mockQueryResult = [{ id: 'p1', filename: 'a.jpg', creationTime: 100 }];
  await render(<SlideshowPlayerScreen {...routeProps} />);

  await screen.findByTestId('slideshow-music-toggle');
  expect(screen.queryByTestId('slideshow-music-prev')).toBeNull();
  expect(screen.queryByTestId('slideshow-music-next')).toBeNull();
});

test('트랙이 2곡 이상이면 이전곡/다음곡 버튼도 보여준다', async () => {
  mockedDb.getSlideshowSettingsByAlbumId.mockResolvedValue(settings);
  mockedDb.getMusicTracksBySettingsId.mockResolvedValue([musicTrack1, musicTrack2]);
  mockQueryResult = [{ id: 'p1', filename: 'a.jpg', creationTime: 100 }];
  await render(<SlideshowPlayerScreen {...routeProps} />);

  expect(await screen.findByTestId('slideshow-music-prev')).toBeTruthy();
  expect(await screen.findByTestId('slideshow-music-next')).toBeTruthy();
});

test('음악정지(♫) 버튼을 누르면 꺼진 상태로 표시되고, 다시 누르면 켜진 상태로 돌아온다', async () => {
  mockedDb.getSlideshowSettingsByAlbumId.mockResolvedValue(settings);
  mockedDb.getMusicTracksBySettingsId.mockResolvedValue([musicTrack1]);
  mockQueryResult = [{ id: 'p1', filename: 'a.jpg', creationTime: 100 }];
  await render(<SlideshowPlayerScreen {...routeProps} />);

  const toggle = await screen.findByTestId('slideshow-music-toggle');
  expect(within(toggle).getByText('♫').props.style).toEqual(
    expect.arrayContaining([expect.objectContaining({ opacity: 1 })])
  );

  await fireEvent.press(toggle);
  expect(within(await screen.findByTestId('slideshow-music-toggle')).getByText('♫').props.style).toEqual(
    expect.arrayContaining([expect.objectContaining({ opacity: 0.4 })])
  );

  await fireEvent.press(await screen.findByTestId('slideshow-music-toggle'));
  expect(within(await screen.findByTestId('slideshow-music-toggle')).getByText('♫').props.style).toEqual(
    expect.arrayContaining([expect.objectContaining({ opacity: 1 })])
  );
});

test('사진 일시정지 버튼을 눌러도 음악 재생 상태(♫ 켜짐)는 그대로 유지된다 — 사진과 음악은 독립이다', async () => {
  mockedDb.getSlideshowSettingsByAlbumId.mockResolvedValue({ ...settings, transitionIntervalSec: 0.05 });
  mockedDb.getMusicTracksBySettingsId.mockResolvedValue([musicTrack1]);
  mockQueryResult = [{ id: 'p1', filename: 'a.jpg', creationTime: 100 }];
  await render(<SlideshowPlayerScreen {...routeProps} />);
  await screen.findByTestId('slideshow-music-toggle');

  await fireEvent.press(await screen.findByTestId('slideshow-play-pause'));
  expect(await screen.findByText('▶')).toBeTruthy();

  expect(within(await screen.findByTestId('slideshow-music-toggle')).getByText('♫').props.style).toEqual(
    expect.arrayContaining([expect.objectContaining({ opacity: 1 })])
  );
});

test('상단에 현재 사진 순서/총 사진 수를 표시하고, 다음 사진으로 넘어가면 갱신된다', async () => {
  mockedDb.getSlideshowSettingsByAlbumId.mockResolvedValue({ ...settings, transitionIntervalSec: 10 });
  mockQueryResult = [
    { id: 'p1', filename: 'a.jpg', creationTime: 100 },
    { id: 'p2', filename: 'b.jpg', creationTime: 200 },
  ];
  await render(<SlideshowPlayerScreen {...routeProps} />);
  expect(await screen.findByText('1/2')).toBeTruthy();

  await fireEvent.press(await screen.findByTestId('slideshow-next'));

  await waitFor(async () => {
    expect(await screen.findByText('2/2')).toBeTruthy();
  });
});

test('회전 버튼을 누르면 가로로 강제 잠금하고, 다시 누르면 세로로 되돌린다', async () => {
  mockedDb.getSlideshowSettingsByAlbumId.mockResolvedValue(settings);
  mockQueryResult = [{ id: 'p1', filename: 'a.jpg', creationTime: 100 }];
  await render(<SlideshowPlayerScreen {...routeProps} />);

  await fireEvent.press(await screen.findByTestId('slideshow-rotate'));
  await waitFor(() => expect(mockLockAsync).toHaveBeenLastCalledWith('LANDSCAPE'));

  await fireEvent.press(await screen.findByTestId('slideshow-rotate'));
  await waitFor(() => expect(mockLockAsync).toHaveBeenLastCalledWith('PORTRAIT_UP'));
});

test('화면을 벗어나면 회전 잠금을 해제한다', async () => {
  mockedDb.getSlideshowSettingsByAlbumId.mockResolvedValue(settings);
  mockQueryResult = [{ id: 'p1', filename: 'a.jpg', creationTime: 100 }];
  const { unmount } = await render(<SlideshowPlayerScreen {...routeProps} />);
  await screen.findByTestId('slideshow-close');

  await unmount();

  expect(mockUnlockAsync).toHaveBeenCalledTimes(1);
});
