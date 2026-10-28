/**
 * 차트 길게 누르기 살펴보기 상태기 · 터치 툴팁 자리 (quick-261028-ggj · 순수 · 프레임워크 무관).
 *
 * - 폰에는 마우스가 없어 매집감지 상세 차트의 원 · 계단 · 막대 툴팁을 볼 수 없었다. 손가락을 차트에 대고 잠시 머물면(길게
 *   누르기) 살펴보기가 켜지고, 그동안 손가락 자리에서 마우스와 같은 툴팁 · 고리를 띄운다.
 * - 길게 누르기는 기존 제스처와 공존하는 진입 방식이다 — 300ms 전에 8px 넘게 움직이면 그 손가락은 지금 그대로 가로 끌기(창 이동) ·
 *   세로 스크롤이고, 두 번째 손가락이 닿으면(핀치) 켜지지 않거나 즉시 꺼진다. 마우스 · 펜은 보지 않는다.
 * - 판정 수치: 머무는 시간 `TOUCH_HOLD_MS` 300 · 떨림 허용 `TOUCH_SLOP_PX` 8(시작점에서 거리) · 툴팁과 손가락 사이 `TOUCH_TIP_GAP` 32.
 */

/** 길게 누르기 판정 시간(ms). */
export const TOUCH_HOLD_MS = 300;
/** 판정 전 떨림 허용(px · 시작점에서 거리) — 넘으면 끌기 · 스크롤로 넘긴다. */
export const TOUCH_SLOP_PX = 8;
/** 터치 툴팁과 손가락 사이 세로 간격(px · 손가락 끝 반지름 여유). */
export const TOUCH_TIP_GAP = 32;

/** 상태기가 읽는 포인터 필드 — React PointerEvent · DOM PointerEvent 가 구조적으로 맞는다. */
export interface TouchPointer {
  pointerId: number;
  pointerType: string;
  clientX: number;
  clientY: number;
}

export interface TouchInspect {
  /** pointerdown — 터치만 본다. 첫 손가락이면 타이머를 걸고, 두 번째 손가락이면 취소한다(핀치). */
  down(p: TouchPointer): void;
  /** pointermove — 살펴보기 중인 그 손가락이면 true(자리 갱신). 판정 전 8px 넘게 움직이면 취소한다. */
  move(p: TouchPointer): boolean;
  /** pointerup · pointercancel · lostpointercapture — 그 손가락을 빼고, 살펴보기 중이었으면 끄고 onEnd 1회. */
  end(p: Pick<TouchPointer, 'pointerId'>): void;
  /** 살펴보기가 켜져 있는가. */
  active(): boolean;
  /** 대기 타이머만 지운다(콜백 없음 · 언마운트). */
  dispose(): void;
}

export function createTouchInspect(
  cb: { onStart: (p: { clientX: number; clientY: number }) => void; onEnd: () => void },
  opts: { holdMs?: number; slopPx?: number } = {},
): TouchInspect {
  const holdMs = opts.holdMs ?? TOUCH_HOLD_MS;
  const slop2 = (opts.slopPx ?? TOUCH_SLOP_PX) ** 2;
  /** 닿아 있는 터치 id. */
  const touches = new Set<number>();
  /** 길게 누르기를 재는(또는 살펴보기 중인) 손가락 — 없으면 null. */
  let tracked: number | null = null;
  let sx = 0;
  let sy = 0;
  let lx = 0;
  let ly = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let on = false;

  const clearTimer = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };
  /** 추적을 멈춘다 — 살펴보기 중이었으면 끄고 onEnd. */
  const stop = () => {
    clearTimer();
    tracked = null;
    if (on) {
      on = false;
      cb.onEnd();
    }
  };

  return {
    down(p) {
      if (p.pointerType !== 'touch') return;
      touches.add(p.pointerId);
      if (touches.size >= 2) {
        stop();
        return;
      }
      clearTimer();
      tracked = p.pointerId;
      sx = lx = p.clientX;
      sy = ly = p.clientY;
      timer = setTimeout(() => {
        timer = null;
        on = true;
        cb.onStart({ clientX: lx, clientY: ly });
      }, holdMs);
    },
    move(p) {
      if (tracked === null || p.pointerId !== tracked) return false;
      if (on) {
        lx = p.clientX;
        ly = p.clientY;
        return true;
      }
      if (timer !== null) {
        const dx = p.clientX - sx;
        const dy = p.clientY - sy;
        if (dx * dx + dy * dy > slop2) {
          // 이 손가락은 끌기 · 스크롤 — 살펴보기를 재지 않는다
          clearTimer();
          tracked = null;
        } else {
          lx = p.clientX;
          ly = p.clientY;
        }
      }
      return false;
    },
    end(p) {
      touches.delete(p.pointerId);
      if (tracked !== null && p.pointerId === tracked) stop();
    },
    active: () => on,
    dispose: clearTimer,
  };
}

/**
 * 터치 툴팁 세로 자리(차트 안 · 손가락을 가리지 않게 위 우선) — 손가락 y(ay) 위 `gap` 에 놓을 자리가 있으면 그것, 없으면 손가락
 * 아래 `gap`(상자가 H 안에 들 때), 둘 다 안 되면 차트 안쪽 아래에 붙인다(0 미만이면 0).
 */
export function touchTipTopOf(ay: number, tipH: number, H: number, gap: number = TOUCH_TIP_GAP): number {
  const above = ay - gap - tipH;
  if (above >= 0) return above;
  const below = ay + gap;
  if (below + tipH <= H) return below;
  return Math.max(0, H - tipH);
}
