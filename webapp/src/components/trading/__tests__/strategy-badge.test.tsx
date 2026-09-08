import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import type { RelayLimitChaser } from "@gh-radar/shared";

import {
  STRATEGY_BADGE_LABELS,
  StrategyBadge,
  exchangeBadgeOf,
  strategyBadgesOf,
  viBadgeOf,
} from "../strategy-badge";

/**
 * Phase 16 Plan 11 Task 2 — 배지 6종 + 거래소 태그 2종의 **에코 필드 매핑**을 잠근다.
 *
 * 이 파일이 지키는 핵심은 「무장 상태」 해석이다(Pitfall 10): `buyEnabled === false` 는
 * 「사용자가 껐다」가 아니라 「발주가 나갔다」일 수 있고, 그 둘은 다른 문구여야 한다.
 */

/** `hadOrder` 는 와이어 필드가 아니라 화면이 주문 통보로 아는 사실이라 여기서 함께 받는다. */
type ChaserOverrides = Partial<RelayLimitChaser> & { hadOrder?: boolean };

function chaser(over: ChaserOverrides = {}): RelayLimitChaser & { hadOrder?: boolean } {
  return {
    isin: "KR7005930003",
    accountNo: "37728502101",
    market: "K",
    crud: "C",
    buyOrderPrice: 0,
    buyOrderQty: 0,
    buyWatchPrice: 0,
    buyWatchQty: 0,
    buyMinTradeQty: 0,
    buyWatchSide: "0",
    buyTradeQtyEnabled: false,
    buyEnabled: false,
    sellOrderPrice: 0,
    sellOrderQty: 0,
    sellWatchPrice: 0,
    sellWatchQty: 0,
    sellMinTradeQty: 0,
    sellEnabled: false,
    sellTradeQtyEnabled: false,
    sweepWatchPrice: 0,
    sweepEnabled: false,
    sweepMinTickCount: 0,
    sweepRecalcEnabled: true,
    sweepMinCount: 0,
    sweepMinRate: 0,
    exchange: "KRX",
    sellOrderRatio: 100,
    sellQtyTrackEnabled: false,
    sellQtyTrackRatio: 50,
    sellQtyTrackBaseline: 0,
    buyOrderAmount: 0,
    sellEntryLatched: false,
    cancelQtyEnabled: false,
    cancelWatchQty: 0,
    cancelTradeEnabled: false,
    cancelQtyTrackEnabled: false,
    cancelQtyTrackBaseline: 0,
    key: "KR7005930003:37728502101:KRX",
    ...over,
  };
}

const labelsOf = (items: { label: string }[]) => items.map((b) => b.label);

describe("strategyBadgesOf — 에코 필드 → 배지 매핑", () => {
  it("buyEnabled(무장) true → 「매수ON」", () => {
    expect(labelsOf(strategyBadgesOf(chaser({ buyEnabled: true })))).toEqual([
      "매수ON",
    ]);
  });

  it("buyEnabled false + 발주 이력 → 「발주됨」 (「꺼짐」이 아니다)", () => {
    expect(
      labelsOf(strategyBadgesOf(chaser({ buyEnabled: false, hadOrder: true }))),
    ).toEqual(["발주됨"]);
  });

  it("buyEnabled false + 발주 이력 없음 → 매수 배지 없음", () => {
    // 한 번도 발주된 적 없는 전략을 「발주됨」으로 쓰면 거짓말이다.
    expect(labelsOf(strategyBadgesOf(chaser({ buyEnabled: false })))).toEqual([]);
  });

  it("발주 이력이 있어도 다시 무장했으면 「매수ON」이 이긴다", () => {
    expect(
      labelsOf(strategyBadgesOf(chaser({ buyEnabled: true, hadOrder: true }))),
    ).toEqual(["매수ON"]);
  });

  it("sellEnabled true + 래치 없음 → 「매도대기」", () => {
    expect(
      labelsOf(
        strategyBadgesOf(chaser({ sellEnabled: true, sellEntryLatched: false })),
      ),
    ).toEqual(["매도대기"]);
  });

  it("sellEntryLatched true → 「매도감시」 (대기보다 우선)", () => {
    expect(
      labelsOf(
        strategyBadgesOf(chaser({ sellEnabled: true, sellEntryLatched: true })),
      ),
    ).toEqual(["매도감시"]);
  });

  it("래치가 섰으면 매도 무장이 소진돼도 「매도감시」다", () => {
    expect(
      labelsOf(
        strategyBadgesOf(chaser({ sellEnabled: false, sellEntryLatched: true })),
      ),
    ).toEqual(["매도감시"]);
  });

  it("매수·매도 조합은 매수 → 매도 순서로 나온다", () => {
    expect(
      labelsOf(
        strategyBadgesOf(chaser({ buyEnabled: true, sellEnabled: true })),
      ),
    ).toEqual(["매수ON", "매도대기"]);
    expect(
      labelsOf(
        strategyBadgesOf(
          chaser({ buyEnabled: false, hadOrder: true, sellEntryLatched: true }),
        ),
      ),
    ).toEqual(["발주됨", "매도감시"]);
  });

  it("모두 꺼진 전략에는 배지가 없다 — 「비활성」 배지를 만들지 않는다", () => {
    expect(strategyBadgesOf(chaser())).toEqual([]);
    expect(Object.values(STRATEGY_BADGE_LABELS)).not.toContain("비활성");
  });
});

describe("viBadgeOf / exchangeBadgeOf", () => {
  it("run true/false → 「가동」/「중지」", () => {
    expect(viBadgeOf(true).label).toBe("가동");
    expect(viBadgeOf(false).label).toBe("중지");
  });

  it("거래소 태그 KRX / NXT", () => {
    expect(exchangeBadgeOf("KRX").label).toBe("KRX");
    expect(exchangeBadgeOf("NXT").label).toBe("NXT");
    // 태그는 상태가 아니라 분류라 도트가 없다.
    const { container } = render(<StrategyBadge badge={exchangeBadgeOf("KRX")} />);
    expect(container.querySelector("[data-dot]")).toBeNull();
  });
});

describe("StrategyBadge — 색·형태·텍스트 3중 (WCAG 1.4.1)", () => {
  it("배지 6종이 텍스트만으로 구분되고 data-kind 가 붙는다", () => {
    const all = [
      ...strategyBadgesOf(chaser({ buyEnabled: true })),
      ...strategyBadgesOf(chaser({ hadOrder: true })),
      ...strategyBadgesOf(chaser({ sellEnabled: true })),
      ...strategyBadgesOf(chaser({ sellEntryLatched: true })),
      viBadgeOf(true),
      viBadgeOf(false),
    ];
    expect(labelsOf(all)).toEqual([
      "매수ON",
      "발주됨",
      "매도대기",
      "매도감시",
      "가동",
      "중지",
    ]);

    for (const badge of all) {
      const { unmount } = render(<StrategyBadge badge={badge} />);
      const el = screen.getByText(badge.label);
      expect(el).toHaveAttribute("data-slot", "strategy-badge");
      expect(el).toHaveAttribute("data-kind", badge.kind);
      unmount();
    }
  });

  it("형태 축이 실재한다 — 채운 도트와 속 빈 도트가 갈린다", () => {
    const solid = render(<StrategyBadge badge={viBadgeOf(true)} />);
    expect(
      solid.container.querySelector('[data-dot="solid"]'),
    ).toBeInTheDocument();
    solid.unmount();

    const hollow = render(<StrategyBadge badge={viBadgeOf(false)} />);
    expect(
      hollow.container.querySelector('[data-dot="hollow"]'),
    ).toBeInTheDocument();
  });

  it("도트는 aria-hidden — 텍스트가 이미 상태를 말한다", () => {
    const { container } = render(<StrategyBadge badge={viBadgeOf(true)} />);
    const dot = container.querySelector("[data-dot]");
    expect(dot).toHaveAttribute("aria-hidden", "true");
  });
});
