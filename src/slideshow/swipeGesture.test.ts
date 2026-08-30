import { isTap, resolveSwipeDirection } from './swipeGesture';

describe('resolveSwipeDirection', () => {
  test('임계값 이내 이동이면 스와이프로 인정하지 않는다', () => {
    expect(resolveSwipeDirection(30, 0)).toBe(0);
  });

  test('왼쪽으로 크게 움직이면 다음(1)을 반환한다', () => {
    expect(resolveSwipeDirection(-100, 0)).toBe(1);
  });

  test('오른쪽으로 크게 움직이면 이전(-1)을 반환한다', () => {
    expect(resolveSwipeDirection(100, 0)).toBe(-1);
  });

  test('세로 이동이 가로 이동보다 크면 스와이프로 인정하지 않는다', () => {
    expect(resolveSwipeDirection(60, 100)).toBe(0);
  });
});

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
