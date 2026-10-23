/** 영상 길이(밀리초)를 m:ss로. 시간 단위 없이 분이 60을 넘어도 그대로 이어서 표시한다. */
export function formatDuration(ms: number | null | undefined): string | null {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return null;
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function formatResolution(width: number | null, height: number | null): string {
  if (width == null || height == null) return '-';
  return `${width} × ${height}`;
}
