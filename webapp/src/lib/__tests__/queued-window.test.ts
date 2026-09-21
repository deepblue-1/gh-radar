import { afterEach, describe, expect, it, vi } from "vitest";

import type { RelayQueuedWindowMsg } from "@gh-radar/shared";

import {
  affordanceOf,
  NXT_PREOPEN_CONFIRM_NOTE,
  PREOPEN_CONFIRM_NOTE,
} from "../queued-window";

/**
 * Phase 18 Plan 04 Task 1 — 77 → 라벨·조각입력·확인문구 매핑 (D-22, TRADE-07).
 *
 * 잠그는 명제:
 *  ① `undefined`(모름)는 전부 false — 「닫힘」으로 위장하지 않는다
 *  ② 매핑 5경우가 RESEARCH §Pattern 5 표(gh-trade 정본) 그대로다
 *  ③ 시간외종가가 최상위 우선순위다(창과 무관하게 매수/매도·조각 1)
 *  ④ 반환에 「제출 금지」 성격의 필드가 없다 — 이 값으로 주문을 막지 않는다
 *  ⑤ 벽시계를 읽지 않는다 — 시각을 바꿔도 결과가 같다
 */

/** 모든 창이 닫힌 77. 케이스마다 필요한 창만 연다. */
function win(patch: Partial<RelayQueuedWindowMsg>): RelayQueuedWindowMsg {
  return {
    t: "queued.window",
    open: false,
    maxPieces: 10,
    preopenOpen: false,
    g2Open: false,
    g3Open: false,
    nxtPreopenOpen: false,
    ...patch,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("affordanceOf — 77 → 라벨·입력 매핑 (판정의 유일 지점)", () => {
  it("모름(undefined)은 일반 라벨·조각 숨김·문구 없음·시간외종가 불가다", () => {
    expect(affordanceOf(undefined, "KRX", "limit")).toEqual({
      buttonMode: "normal",
      showPieceInput: false,
      maxPieces: 1,
      confirmNote: null,
      offHoursSelectable: false,
    });
  });

  it("open ∧ KRX 는 예약 라벨·조각 입력 보임·상한은 서버 maxPieces 그대로다", () => {
    const a = affordanceOf(win({ open: true, maxPieces: 10 }), "KRX", "limit");
    expect(a.buttonMode).toBe("queued");
    expect(a.showPieceInput).toBe(true);
    expect(a.maxPieces).toBe(10);
    expect(a.confirmNote).toBeNull();
  });

  it("open 이어도 NXT 면 예약구간이 아니다(예약구간은 KRX 만)", () => {
    const a = affordanceOf(win({ open: true }), "NXT", "limit");
    expect(a.buttonMode).toBe("normal");
    expect(a.showPieceInput).toBe(false);
    expect(a.confirmNote).toBeNull();
  });

  it("preopenOpen ∧ KRX 는 예약 라벨·조각 숨김·09:00 문구다", () => {
    const a = affordanceOf(win({ preopenOpen: true }), "KRX", "limit");
    expect(a.buttonMode).toBe("queued");
    expect(a.showPieceInput).toBe(false);
    expect(a.confirmNote).toBe("예약: 증권사 보관 후 09:00 처리");
    expect(PREOPEN_CONFIRM_NOTE).toBe("예약: 증권사 보관 후 09:00 처리");
  });

  it("nxtPreopenOpen ∧ NXT 는 예약 라벨·조각 숨김·08:00 문구다", () => {
    const a = affordanceOf(win({ nxtPreopenOpen: true }), "NXT", "limit");
    expect(a.buttonMode).toBe("queued");
    expect(a.showPieceInput).toBe(false);
    expect(a.confirmNote).toBe("예약: 증권사 보관 후 08:00 처리");
    expect(NXT_PREOPEN_CONFIRM_NOTE).toBe("예약: 증권사 보관 후 08:00 처리");
  });

  it("거래소가 창과 엇갈리면(preopen∧NXT, nxtPreopen∧KRX) 일반 라벨이다", () => {
    expect(affordanceOf(win({ preopenOpen: true }), "NXT", "limit").buttonMode).toBe("normal");
    expect(affordanceOf(win({ nxtPreopenOpen: true }), "KRX", "limit").buttonMode).toBe("normal");
  });

  it("시간외종가는 창과 무관하게 매수/매도·조각 숨김·문구 없음이다(최상위 우선순위)", () => {
    const a = affordanceOf(win({ open: true, g2Open: true, preopenOpen: true }), "KRX", "offhours");
    expect(a.buttonMode).toBe("normal");
    expect(a.showPieceInput).toBe(false);
    expect(a.confirmNote).toBeNull();
  });

  it("offHoursSelectable 은 KRX ∧ (g2Open ∨ g3Open) 일 때만 참이고 NXT 는 항상 거짓이다", () => {
    expect(affordanceOf(win({ g2Open: true }), "KRX", "limit").offHoursSelectable).toBe(true);
    expect(affordanceOf(win({ g3Open: true }), "KRX", "limit").offHoursSelectable).toBe(true);
    expect(affordanceOf(win({}), "KRX", "limit").offHoursSelectable).toBe(false);
    expect(affordanceOf(win({ g2Open: true, g3Open: true }), "NXT", "limit").offHoursSelectable).toBe(
      false,
    );
    expect(affordanceOf(undefined, "KRX", "offhours").offHoursSelectable).toBe(false);
  });

  it("반환 객체에 「주문 제출 금지」 성격의 필드가 없다 — 정해진 5필드뿐이다", () => {
    const a = affordanceOf(win({ open: true }), "KRX", "limit");
    expect(Object.keys(a).sort()).toEqual(
      ["buttonMode", "confirmNote", "maxPieces", "offHoursSelectable", "showPieceInput"].sort(),
    );
  });

  it("벽시계를 읽지 않는다 — 시각을 바꿔도 같은 입력은 같은 결과다", () => {
    const w = win({ open: true, maxPieces: 7, g3Open: true });
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-21T23:30:00Z")); // KST 08:30 — 장전
    const early = affordanceOf(w, "KRX", "limit");
    vi.setSystemTime(new Date("2026-09-22T09:00:00Z")); // KST 18:00 — 장 마감 후
    const late = affordanceOf(w, "KRX", "limit");
    expect(late).toEqual(early);
    expect(early.buttonMode).toBe("queued");
    expect(early.maxPieces).toBe(7);
  });
});
