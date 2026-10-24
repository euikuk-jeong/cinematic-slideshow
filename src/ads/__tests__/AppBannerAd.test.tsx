import { act, render, screen } from '@testing-library/react-native';

import { AD_RETRY_DELAYS_MS, AppBannerAd } from '../AppBannerAd';

let mockDiagnostics = false;
jest.mock('../adDiagnostics', () => ({
  get SHOW_AD_DIAGNOSTICS() {
    return mockDiagnostics;
  },
}));

// 라이브러리 mock: 마지막으로 렌더된 BannerAd의 props와 load() 호출 횟수를 노출한다.
const mockAd: { props: Record<string, any> | null; loadCalls: number } = { props: null, loadCalls: 0 };
jest.mock('react-native-google-mobile-ads', () => {
  const React = require('react');
  class BannerAd extends React.Component<Record<string, any>> {
    load() {
      mockAd.loadCalls += 1;
    }
    render() {
      mockAd.props = this.props;
      return null;
    }
  }
  return {
    BannerAd,
    BannerAdSize: { ANCHORED_ADAPTIVE_BANNER: 'ANCHORED_ADAPTIVE_BANNER' },
    TestIds: { BANNER: 'test-banner' },
  };
});

const NO_FILL = { code: 'googleMobileAds/error-code-no-fill', message: 'no fill' };

async function failLoad(error = NO_FILL) {
  await act(async () => {
    mockAd.props?.onAdFailedToLoad(error);
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  mockAd.props = null;
  mockAd.loadCalls = 0;
  mockDiagnostics = false;
});
afterEach(() => {
  jest.useRealTimers();
});

test('로드에 실패하면 간격을 늘려가며 다시 요청하고, 횟수를 다 쓰면 더 요청하지 않는다', async () => {
  await render(<AppBannerAd />);

  for (let i = 0; i < AD_RETRY_DELAYS_MS.length; i += 1) {
    await failLoad();
    expect(mockAd.loadCalls).toBe(i);
    await act(async () => {
      jest.advanceTimersByTime(AD_RETRY_DELAYS_MS[i] - 1);
    });
    expect(mockAd.loadCalls).toBe(i);
    await act(async () => {
      jest.advanceTimersByTime(1);
    });
    expect(mockAd.loadCalls).toBe(i + 1);
  }

  await failLoad(); // 재시도를 모두 소진한 뒤의 실패
  await act(async () => {
    jest.advanceTimersByTime(10 * 60 * 1000);
  });
  expect(mockAd.loadCalls).toBe(AD_RETRY_DELAYS_MS.length);
});

test('재시도 대기 중에는 광고 자리(최소 높이)를 유지하고, 모두 실패한 뒤에는 접는다', async () => {
  await render(<AppBannerAd />);
  const minHeightOf = () => {
    const style = screen.getByTestId('banner-ad').props.style.flat(Infinity).filter(Boolean);
    return style.find((s: { minHeight?: number }) => s.minHeight !== undefined)?.minHeight;
  };
  expect(minHeightOf()).toBe(50);

  await failLoad();
  expect(minHeightOf()).toBe(50);

  for (let i = 1; i <= AD_RETRY_DELAYS_MS.length; i += 1) {
    await act(async () => {
      jest.advanceTimersByTime(AD_RETRY_DELAYS_MS[i - 1]);
    });
    await failLoad();
  }
  expect(minHeightOf()).toBeUndefined();
});

test('재시도 중 로드에 성공하면 재시도 횟수가 초기화돼, 이후 실패에도 처음부터 다시 시도한다', async () => {
  await render(<AppBannerAd />);
  await failLoad();
  await act(async () => {
    jest.advanceTimersByTime(AD_RETRY_DELAYS_MS[0]);
  });
  expect(mockAd.loadCalls).toBe(1);

  await act(async () => {
    mockAd.props?.onAdLoaded();
  });
  await failLoad();
  await act(async () => {
    jest.advanceTimersByTime(AD_RETRY_DELAYS_MS[0]);
  });
  expect(mockAd.loadCalls).toBe(2);
});

test('언마운트하면 예약된 재시도를 취소한다', async () => {
  const { unmount } = await render(<AppBannerAd />);
  await failLoad();
  await unmount();
  await act(async () => {
    jest.advanceTimersByTime(AD_RETRY_DELAYS_MS[0]);
  });
  expect(mockAd.loadCalls).toBe(0);
});

test('진단 모드가 꺼져 있으면(배포·개발 빌드) 오류 코드를 보여주지 않는다', async () => {
  await render(<AppBannerAd />);
  await failLoad();
  expect(screen.queryByTestId('banner-ad-diagnostic')).toBeNull();
});

test('진단 모드(preview)에서는 오류 코드와 재시도 횟수를 보여준다', async () => {
  mockDiagnostics = true;
  await render(<AppBannerAd />);
  expect(screen.queryByTestId('banner-ad-diagnostic')).toBeNull();

  await failLoad();
  expect(screen.getByTestId('banner-ad-diagnostic')).toHaveTextContent(
    'ad error: googleMobileAds/error-code-no-fill (0/3 retries)'
  );

  await act(async () => {
    mockAd.props?.onAdLoaded();
  });
  expect(screen.queryByTestId('banner-ad-diagnostic')).toBeNull();
});
