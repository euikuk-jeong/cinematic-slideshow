import { createInstance } from 'i18next';

import { resources } from '../index';

// Hermes(RN 엔진)는 Intl.PluralRules를 구현하지 않는다(2026-09 기준) — 그 환경에서도
// count interpolation이 올바른 문자열을 내는지 확인한다. i18next의 PluralResolver는
// `new Intl.PluralRules(lng)`가 throw하고 lng에 '-'/'_'가 없으면(ko/en 모두 해당)
// `count === 1 ? 'one' : 'other'`인 dummyRule로 자동 폴백한다(node_modules/i18next
// 소스 확인) — 이 프로젝트의 카운트 값(초/분/시간/장/곡/개)이 전부 정수라 실제 CLDR
// 규칙과 dummyRule의 결과가 갈릴 일이 없어, 폴리필(@formatjs/intl-pluralrules) 없이도
// 안전하다고 판단했다. 이 테스트가 그 판단을 고정해둔다 — 실패하면 폴리필을 다시 들여야 한다.
async function buildInstance(lng: string) {
  const instance = createInstance();
  await instance.init({
    resources,
    lng,
    fallbackLng: 'en',
    defaultNS: 'common',
    ns: Object.keys(resources.en),
    interpolation: { escapeValue: false },
  });
  return instance;
}

describe.each([
  ['Intl.PluralRules present (Node/jest)', false],
  ['Intl.PluralRules absent (simulated Hermes)', true],
])('count interpolation — %s', (_label, simulateHermes) => {
  let originalPluralRules: typeof Intl.PluralRules | undefined;

  beforeEach(() => {
    if (simulateHermes) {
      originalPluralRules = Intl.PluralRules;
      // @ts-expect-error - deliberately removing to simulate Hermes
      delete Intl.PluralRules;
    }
  });

  afterEach(() => {
    if (simulateHermes) {
      // @ts-expect-error - restoring what was deliberately deleted above
      Intl.PluralRules = originalPluralRules;
    }
  });

  it('resolves Korean counts', async () => {
    const ko = await buildInstance('ko');
    expect(ko.t('common:seconds', { count: 1 })).toBe('1초');
    expect(ko.t('common:seconds', { count: 5 })).toBe('5초');
    expect(ko.t('albumSettings:totalPhotosWithCount', { count: 1 })).toBe('전체 사진 (1장)');
  });

  it('resolves English singular/plural counts', async () => {
    const en = await buildInstance('en');
    expect(en.t('common:seconds', { count: 1 })).toBe('1 second');
    expect(en.t('common:seconds', { count: 5 })).toBe('5 seconds');
    expect(en.t('musicPicker:confirmSelection', { count: 1 })).toBe('Add 1 track');
    expect(en.t('musicPicker:confirmSelection', { count: 3 })).toBe('Add 3 tracks');
  });
});
