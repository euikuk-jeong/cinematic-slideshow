import { formatDuration, formatResolution } from '../mediaFormat';

describe('formatDuration (ms 입력)', () => {
  it.each([
    [0, '0:00'],
    [7000, '0:07'],
    [65000, '1:05'],
    [3600000, '60:00'],
    [3725000, '62:05'],
    [999, '0:00'],
    [1000, '0:01'],
  ])('%p ms -> %s', (ms, expected) => {
    expect(formatDuration(ms)).toBe(expected);
  });

  it.each([null, undefined, -1, NaN, Infinity])('%p는 null', (ms) => {
    expect(formatDuration(ms as number | null)).toBeNull();
  });
});

describe('formatResolution', () => {
  it('formats width × height', () => expect(formatResolution(4000, 3000)).toBe('4000 × 3000'));
  it('shows - when either is missing', () => {
    expect(formatResolution(null, null)).toBe('-');
    expect(formatResolution(100, null)).toBe('-');
  });
});
