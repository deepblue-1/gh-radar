/**
 * 77(`QueuedWindowState`) → 수동주문 라벨·조각 입력·확인 문구 매핑 (Phase 18 D-22, TRADE-07).
 *
 * ① **판정의 유일 지점**이다
 *   라벨(매수/매도 ↔ 예약매수/예약매도)·조각 입력 표시·확인 문구가 전부 이 함수를 부른다.
 *   카드 수동주문 폼과 호가 탭 수동주문 폼이 **같은 함수**를 쓴다 — 두 곳에 따로 적으면
 *   한쪽만 고쳐지고, 그때 나가는 것이 「화면에 없는 조각 수」다.
 *
 * ② ★ `undefined` 는 **모름**이다 (미수신·연결 끊김·구 서버)
 *   모름은 전부 false 로 읽는다 — 일반 라벨, 조각 입력 숨김, 시간외종가 선택 불가.
 *   창이 닫혔다(`open:false`)로 위장하지 않는다(relay-provider 의 `queuedWindow` 규율).
 *
 * ③ ★ **벽시계를 읽지 않는다**
 *   이 파일에 현재 시각 상수·시각 객체를 들이지 말 것. 창 판정은 서버 몫이다 — 클라가
 *   「지금 08:30 이니 장전」이라고 추측하면 서버 창과 1초라도 어긋나는 순간 라벨이 거짓말을 한다.
 *
 * ④ ★ 이 값으로 **주문을 막지 않는다**
 *   반환에는 「제출 금지」 성격의 필드가 없다. 77 은 표시 힌트이고, 거부는 서버가 한다
 *   (gh-trade `queued-order.md` §예약구간 — 「클라는 벽시계로 판정하지 않고 이 값으로 주문을 막지 않는다」).
 *
 * 규칙 표 정본: 18-RESEARCH §Pattern 5 (gh-trade `queued-order.md` · `preopen-offhours-order.md`).
 */

import type { RelayExchange, RelayQueuedWindowMsg } from "@gh-radar/shared";

/** 버튼 라벨 모드. `"queued"` → 「예약매수 / 예약매도」. */
export type OrderButtonMode = "normal" | "queued";

/** 수동주문 폼이 그릴 것. **표시 전용**이다 — 제출 가부는 여기 없다(④). */
export interface ManualOrderAffordance {
  /** `"queued"` 면 「예약매수 / 예약매도」, 아니면 「매수 / 매도」. */
  buttonMode: OrderButtonMode;
  /** 조각 입력(라벨+입력칸) 표시 여부 — `open ∧ KRX` 일 때만. 숨기면 조각 수는 **1** 로 보낸다. */
  showPieceInput: boolean;
  /**
   * 조각 수 스테퍼 상한. 조각 입력이 보일 때는 **서버 `maxPieces` 그대로**이고 클라 기본값을
   * 만들지 않는다. 숨길 때는 1(= 보내는 조각 수). 기본 조각 수 5 는 스테퍼의 **초기값**이지
   * 상한이 아니다 — 그 5 는 폼이 갖는다.
   */
  maxPieces: number;
  /** 주문확인에 붙는 예약 안내 줄. 없으면 `null`. */
  confirmNote: string | null;
  /** 시간외종가 주문유형 선택 가능 — `KRX ∧ (g2Open ∨ g3Open)`. 호가 탭 콤보 전용. */
  offHoursSelectable: boolean;
}

/** 장전 시간외(KRX) 예약 안내 — UI-SPEC §Copywriting 원문. */
export const PREOPEN_CONFIRM_NOTE = "예약: 증권사 보관 후 09:00 처리";
/** NXT 장전 예약 안내 — UI-SPEC §Copywriting 원문. */
export const NXT_PREOPEN_CONFIRM_NOTE = "예약: 증권사 보관 후 08:00 처리";

/** 조각 입력을 숨길 때 보내는 조각 수 — 화면에 없는 값을 싣지 않는다. */
const SINGLE_PIECE = 1;

/**
 * 77 창 힌트 + 거래소 + 주문유형 → 수동주문 표시.
 *
 * 우선순위(위가 이긴다):
 *  1. `orderType === "offhours"` — 창과 무관하게 매수/매도·조각 1·문구 없음
 *  2. `open ∧ KRX`              — 예약 라벨·조각 입력 보임(상한 = 서버 `maxPieces`)
 *  3. `preopenOpen ∧ KRX`       — 예약 라벨·조각 숨김·09:00 문구
 *  4. `nxtPreopenOpen ∧ NXT`    — 예약 라벨·조각 숨김·08:00 문구
 *  5. 그 외·모름                — 매수/매도·조각 숨김·문구 없음
 */
export function affordanceOf(
  w: RelayQueuedWindowMsg | undefined,
  exchange: RelayExchange,
  orderType: "limit" | "offhours",
): ManualOrderAffordance {
  const isKrx = exchange === "KRX";
  // 모름(undefined)은 `?? false` 로 전부 닫힌 쪽이 된다(②).
  const offHoursSelectable = isKrx && ((w?.g2Open ?? false) || (w?.g3Open ?? false));

  const normal: ManualOrderAffordance = {
    buttonMode: "normal",
    showPieceInput: false,
    maxPieces: SINGLE_PIECE,
    confirmNote: null,
    offHoursSelectable,
  };

  // 1. 시간외종가 쪽 버튼은 창과 무관하게 일반 라벨이다(preopen-offhours-order.md).
  if (orderType === "offhours") return normal;
  if (w === undefined) return normal;

  // 2. 예약구간은 KRX 만이다.
  if (w.open && isKrx) {
    return { ...normal, buttonMode: "queued", showPieceInput: true, maxPieces: w.maxPieces };
  }
  // 3. 장전 시간외(KRX).
  if (w.preopenOpen && isKrx) {
    return { ...normal, buttonMode: "queued", confirmNote: PREOPEN_CONFIRM_NOTE };
  }
  // 4. NXT 장전.
  if (w.nxtPreopenOpen && exchange === "NXT") {
    return { ...normal, buttonMode: "queued", confirmNote: NXT_PREOPEN_CONFIRM_NOTE };
  }
  // 5. 그 외.
  return normal;
}

/** 구간 배지 한 개 — 문구와 색 갈래. 갈래는 UI-SPEC §Color(`.winpill`)의 세 표면이다. */
export interface QueuedWindowBadge {
  /** UI-SPEC §상태줄 「구간 배지」 원문. */
  text: string;
  /** `regular` = 중립 · `queued` = 예약구간/장전(`--new-bg`) · `offhours` = 시간외종가 창(accent). */
  tone: "regular" | "queued" | "offhours";
}

/**
 * 77 창 힌트 → 상태줄 구간 배지 (Phase 18 · 작업대 상태줄 · 호가 탭 상태줄 공유).
 *
 * ★ **모름(`undefined`)이면 `null`** — 배지를 그리지 않는다. 「정규」로 위장하지 않는다(②).
 * ★ 벽시계를 읽지 않는다(③). 창이 여럿 열려 있으면 시간외종가 → 예약구간 → 장전 순으로
 *   **더 좁은 창**이 이긴다 — 수동주문 폼이 실제로 바뀌는(라벨·콤보) 쪽을 먼저 말한다.
 */
export function queuedWindowBadgeOf(
  w: RelayQueuedWindowMsg | undefined,
): QueuedWindowBadge | null {
  if (w === undefined) return null;
  if (w.g3Open) return { text: "시간외종가 G3 창", tone: "offhours" };
  if (w.g2Open) return { text: "시간외종가 G2 창", tone: "offhours" };
  if (w.open) return { text: `예약구간 · 조각 최대 ${w.maxPieces}`, tone: "queued" };
  if (w.preopenOpen || w.nxtPreopenOpen) return { text: "장전 · 예약매수/매도", tone: "queued" };
  return { text: "정규", tone: "regular" };
}
