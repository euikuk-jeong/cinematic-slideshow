import { isTap, resolveTapZone } from './tapGesture';

describe('isTap', () => {
  test('짧은 움직임+빠른 시간이면 탭이다', () => {
    expect(isTap(5, 5, 100)).toBe(true);
  });

  test('움직임이 크면 탭이 아니다', () => {
    expect(isTap(50, 0, 100)).toBe(false);
  });

  test('시간이 오래 걸리면 탭이 아니다(길게 누름)', () => {
    expect(isTap(5, 5, 500)).toBe(false);
  });
});

describe('resolveTapZone', () => {
  const screenWidth = 300;

  test('왼쪽 1/3 이내면 prev', () => {
    expect(resolveTapZone(50, screenWidth)).toBe('prev');
  });

  test('오른쪽 1/3 이내면 next', () => {
    expect(resolveTapZone(250, screenWidth)).toBe('next');
  });

  test('가운데 1/3이면 toggle', () => {
    expect(resolveTapZone(150, screenWidth)).toBe('toggle');
  });

  test('경계값(1/3 지점)은 toggle에 포함된다', () => {
    expect(resolveTapZone(screenWidth / 3, screenWidth)).toBe('toggle');
  });
});
