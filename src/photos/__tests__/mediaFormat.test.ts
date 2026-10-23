import { buildInfoRows, formatDateTime, formatDuration, formatResolution } from '../mediaFormat';

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

describe('formatDateTime', () => {
  it('formats local time', () => expect(formatDateTime(new Date(2026, 9, 3, 7, 5).getTime())).toBe('2026-10-03 07:05'));
  it('shows - for null', () => expect(formatDateTime(null)).toBe('-'));
});

describe('buildInfoRows', () => {
  const photo = { filename: 'a.jpg', creationTime: new Date(2026, 0, 2, 3, 4).getTime(), width: 4000, height: 3000, durationMs: null, mediaKind: 'image' as const };

  it('lists filename, capture time and resolution for a photo — and nothing else', () => {
    expect(buildInfoRows(photo)).toEqual([
      { key: 'filename', value: 'a.jpg' },
      { key: 'captureTime', value: '2026-01-02 03:04' },
      { key: 'resolution', value: '4000 × 3000' },
    ]);
  });

  it('adds duration for a video', () => {
    const rows = buildInfoRows({ ...photo, mediaKind: 'video', durationMs: 65000 });
    expect(rows[rows.length - 1]).toEqual({ key: 'duration', value: '1:05' });
  });

  it('shows - for missing values', () => {
    const rows = buildInfoRows({ filename: null, creationTime: null, width: null, height: null, durationMs: null, mediaKind: 'image' });
    expect(rows.map((r) => r.value)).toEqual(['-', '-', '-']);
  });
});
