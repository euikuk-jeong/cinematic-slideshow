import { resources } from '../index';

function flatten(obj: unknown, prefix = ''): string[] {
  if (typeof obj !== 'object' || obj === null) return [prefix];
  return Object.entries(obj as Record<string, unknown>).flatMap(([key, value]) =>
    flatten(value, prefix ? `${prefix}.${key}` : key)
  );
}

function interpolationTokens(value: string): string[] {
  return [...value.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)].map((m) => m[1]).sort();
}

function get(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, part) => (acc as Record<string, unknown> | undefined)?.[part], obj);
}

// _other는 count interpolation의 영어 전용 복수형 변형이라 한국어 쪽엔 대응 키가 없다 —
// 짝을 맞추려 하지 않고 키 목록 비교에서만 제외한다.
function baseKey(key: string): string {
  return key.endsWith('_other') ? key.slice(0, -'_other'.length) : key;
}

describe('locale resource parity (ko vs en)', () => {
  it.each(Object.keys(resources.en))('namespace "%s" has matching keys and interpolation tokens', (ns) => {
    const koNs = (resources.ko as Record<string, unknown>)[ns];
    const enNs = (resources.en as Record<string, unknown>)[ns];

    const koKeys = new Set(flatten(koNs).map(baseKey));
    const enKeys = new Set(flatten(enNs).map(baseKey));

    expect([...koKeys].filter((k) => !enKeys.has(k))).toEqual([]);
    expect([...enKeys].filter((k) => !koKeys.has(k))).toEqual([]);

    for (const key of koKeys) {
      const koValue = get(koNs, key);
      const enValue = get(enNs, key);
      if (typeof koValue !== 'string' || typeof enValue !== 'string') continue;
      expect(interpolationTokens(koValue)).toEqual(interpolationTokens(enValue));
    }
  });
});
