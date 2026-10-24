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

const pad2 = (n: number) => String(n).padStart(2, '0');

/** 로컬 시간 기준 `YYYY-MM-DD HH:mm`. */
export function formatDateTime(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return '-';
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export type InfoRowKey = 'filename' | 'captureTime' | 'resolution' | 'duration';

export interface InfoRow {
  key: InfoRowKey;
  value: string;
}

interface InfoSource {
  filename: string | null;
  creationTime: number | null;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  mediaKind: 'image' | 'video';
}

/**
 * 정보 시트 행. 파일 크기·경로·GPS는 v1 범위 밖이라 포함하지 않는다. 값이 없으면 `-`.
 */
export function buildInfoRows(item: InfoSource): InfoRow[] {
  const rows: InfoRow[] = [
    { key: 'filename', value: item.filename ?? '-' },
    { key: 'captureTime', value: formatDateTime(item.creationTime) },
    { key: 'resolution', value: formatResolution(item.width, item.height) },
  ];
  if (item.mediaKind === 'video') rows.push({ key: 'duration', value: formatDuration(item.durationMs) ?? '-' });
  return rows;
}
