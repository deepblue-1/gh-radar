/**
 * VI 공용 순수 유틸 — 금액 단위 · 통지 몫 판정 (16-14, TRADE-02).
 *
 * ① 왜 한 파일인가
 *   VI 표면이 쓰는 **React 없는 계약**을 모아 둔다. 둘 다 「두 곳에 두면 조용히 갈리는」
 *   값이다 — 단위 변환이 갈리면 1만 배 큰 주문이 나가고, 통지 몫 판정이 갈리면
 *   남의 거부를 내 거부로 그린다.
 *
 * 이력: 브라우저 알림 부분은 quick-260922-tqr 에서 제거됐다 — 파일명은 import 파급을 피하려 유지.
 */

import { MAX_VI_ORDER_AMOUNT_KRW } from "@gh-radar/shared";

import { isLimitChaserServerMessage } from "@/lib/limit-chaser";

/**
 * 만원 → 원 배수. **단위 변환의 유일한 지점**이다.
 *
 * 와이어(`RelayViSetMsg.orderAmountKrw`)는 **원**, 화면 입력은 **만원**이다. 이 상수를
 * 호출부마다 다시 적으면 한 곳이 10,000 을 빠뜨리는 순간 **1만분의 1 금액**으로 등록되고
 * (주문수량 0 → 아무 일도 안 일어남), 반대로 한 번 더 곱하면 **1만 배** 주문이 나간다.
 */
const MANWON_IN_KRW = 10_000;

/** 만원 → 원. 와이어로 나가는 값을 만드는 유일한 함수다. */
export function manwonToKrw(manwon: number): number {
  return Math.round(manwon) * MANWON_IN_KRW;
}

/**
 * 원 → 만원. 서버 에코를 입력칸으로 되돌린다.
 *
 * 만원 미만 우수리는 **내림**한다 — 올림하면 사용자가 「수정」을 누르지 않았는데도
 * 표시값이 서버값보다 커져, 그 값을 그대로 재전송하는 순간 금액이 늘어난다.
 */
export function krwToManwon(krw: number): number {
  return Math.floor(krw / MANWON_IN_KRW);
}

/**
 * 금액 입력 상한 — **만원 단위**. 원 단위 정본에서 **유도**한다 (WR-07).
 *
 * 정본은 `@gh-radar/shared` 의 `MAX_VI_ORDER_AMOUNT_KRW`(원) 하나이고 relay 의 zod 스키마·
 * envelope 조립기가 같은 값을 본다. 여기에 만원 숫자를 직접 적으면 세 층의 상한이 갈리고,
 * 갈라진 순간 **가장 느슨한 층이 실질 상한**이 된다. 변환은 위 두 함수 밖에서 하지 않는다.
 */
export const MAX_VI_ORDER_AMOUNT_MANWON = krwToManwon(MAX_VI_ORDER_AMOUNT_KRW);

/* ── ServerMessage(54) 의 VI 몫 판정 ──────────────────────────────────── */

/**
 * `ServerMessage(54)` 가 **VI 화면의 몫인가** (Pitfall 9).
 *
 * ★ 상따/계좌 통지의 가르는 규칙은 **다시 쓰지 않는다.** `isLimitChaserServerMessage`
 *   (16-13, `lib/limit-chaser.ts`)가 유일 지점이고 여기서는 그 결과를 뒤집어 쓴다.
 *   두 곳에서 각자 판정하면 어느 한쪽이 남의 거부를 그리고 다른 쪽은 자기 거부를 놓치는데,
 *   둘 다 사용자가 알아챌 수 없는 방식으로 조용히 일어난다.
 *
 * 규칙:
 *   - `src === "SetVITrigger"`                → VI 등록·수정 거부. 명백히 VI 몫.
 *   - `src === "VITrigger"`                   → VI **런타임 사유 줄**. 명백히 VI 몫 (D-09).
 *   - `src === "Account"` ∧ **종목이 없음**    → 종목 축이 없는 계좌 통지 = VI 몫.
 *   - `src === "Account"` ∧ 종목이 있음        → 상따 몫(16-13 판정이 참).
 *
 * ★ `"VITrigger"` 는 17-01 이 `src` 어휘에 더한 값이다 (D-09). 이 판정에 넣지 않으면 서버가
 *   VI 런타임 사유(조건 미달·클램프 등)를 보내도 **VI 화면이 한 글자도 그리지 않는다** —
 *   어휘만 늘고 소비처가 없는 상태였다(17-06 실측). 대응하는 상따 값 `"LimitChaser"` 는
 *   여기 넣지 않는다: 그것을 VI 몫으로 읽는 순간 Pitfall 9 가 정확히 되살아난다.
 *
 * ★ 그 밖의 `src` 는 **VI 몫이 아니다.** 특히 relay 자신이 요청 단위로 거부할 때 쓰는
 *   `src === "Relay"` 를 VI 통지로 읽으면, 상따 요청이 형식 오류로 튕긴 것을 VI 화면이
 *   「내 자동매수가 거부됐다」로 그린다 — 사용자는 멀쩡한 VI 를 껐다 켜고 그 재등록이
 *   두 번째 무인 발주다. 그래서 `!isLimitChaserServerMessage(msg)` 만으로는 부족하고
 *   `Account` 라는 발신 맥락을 함께 본다.
 */
export function isViServerMessage(msg: { src: string; i: string }): boolean {
  if (msg.src === "SetVITrigger" || msg.src === "VITrigger") return true;
  return msg.src === "Account" && !isLimitChaserServerMessage(msg);
}
