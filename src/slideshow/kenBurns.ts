const MAX_SCALE = 1.15;
const PAN_FRACTION = 0.05;

export interface KenBurnsSpec {
  zoomIn: boolean;
  panAngleRad: number;
}

/**
 * 사진마다 줌 방향(확대/축소)과 팬 방향을 무작위로 골라 매번 다른 움직임을 만든다
 * (컴포넌트가 아닌 여기서 랜덤을 주입 가능하게 분리해 node 테스트로 검증 — playback.ts의
 * defaultShuffle과 동일 패턴).
 */
export function generateKenBurnsSpec(random: () => number = Math.random): KenBurnsSpec {
  return {
    zoomIn: random() < 0.5,
    panAngleRad: random() * Math.PI * 2,
  };
}

export interface KenBurnsTransform {
  startScale: number;
  endScale: number;
  startTranslateX: number;
  endTranslateX: number;
  startTranslateY: number;
  endTranslateY: number;
}

/**
 * 팬 이동량은 확대율(MAX_SCALE)이 만들어내는 여유 공간보다 항상 작게(PAN_FRACTION) 잡아,
 * 사진 가장자리 바깥의 빈 공간이 보이지 않도록 한다.
 */
export function computeKenBurnsTransform(
  spec: KenBurnsSpec,
  containerSize: { width: number; height: number }
): KenBurnsTransform {
  const startScale = spec.zoomIn ? 1 : MAX_SCALE;
  const endScale = spec.zoomIn ? MAX_SCALE : 1;
  const panX = Math.cos(spec.panAngleRad) * containerSize.width * PAN_FRACTION;
  const panY = Math.sin(spec.panAngleRad) * containerSize.height * PAN_FRACTION;
  return {
    startScale,
    endScale,
    startTranslateX: -panX / 2,
    endTranslateX: panX / 2,
    startTranslateY: -panY / 2,
    endTranslateY: panY / 2,
  };
}
