import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { RelayLimitChaser } from "@gh-radar/shared";

import {
  BUY_HOLDING_TOOLTIP,
  LatchLed,
  latchLedStateOf,
  type LatchLedKind,
  type LatchLedState,
} from "../latch-led";
import { lcAutoSellBasisText } from "../lc/lc-fields";
import { LC_BUY3_ECHO_DEFAULTS } from "@/test-fixtures/limit-chaser";

/**
 * Phase 17 Plan 07 Task 3 — 상따 래치 LED 3종의 **C# 정본 규칙 표**를 잠근다.
 *
 * LED 는 「지금 이 전략이 발주 판정을 시작했는가」를 말하는 유일한 표면이다. 색 규칙이
 * 정본(`client/Forms/Trading/LimitChaserForm.cs` — 매수 `ShowBuyServerQty` :1027 ·
 * 매도 `UpdateSellLatchLabel` :4246 · 취소 `UpdateCancelLatchLed` :4342)과 한 글자라도
 * 갈리면 사용자가 무장 상태를 오독하고 **실계좌 주문이 나간다**.
 *
 * 특히 두 상습 오독을 케이스로 못박는다:
 * - **Phase 24 D-12** — 매수 LED 는 래치가 아니다(서버에서 봉인). 마스터 무장과 후매수 단계만
 *   읽어 OFF / 초록 감시 / 주황 보유중이고, **세 경우 모두 클릭을 받지 않는다**.
 * - **Pitfall 5** — 취소 무장에 `cancelQtyTrackEnabled` 를 넣으면 안 된다. 잔량추적은
 *   무장 축이 아니라 계산 옵션이라, 넣는 순간 「취소 감시 중」이라는 거짓 초록이 뜬다.
 */

type ChaserOverrides = Partial<RelayLimitChaser>;

function chaser(over: ChaserOverrides = {}): RelayLimitChaser {
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
    buyWatchSide: "1",
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
    cancelEntryLatched: false,
    ...LC_BUY3_ECHO_DEFAULTS,
    key: "KR7005930003:37728502101:KRX",
    ...over,
  };
}

/** 매수 「보유중」 툴팁 원문 (Phase 24 D-12 · C# 리터럴 — 한 글자도 고치지 않는다). */
const TIP_BUY_HOLDING = "후매수 보유중 — 산 물량이 전부 정리되면 다시 감시(남은 횟수 0 이면 소진)";

const SOURCE_PATH = path.resolve(__dirname, "../latch-led.tsx");
const SOURCE = readFileSync(SOURCE_PATH, "utf8");

const ledEl = (kind: LatchLedKind): HTMLElement => {
  const el = document.querySelector<HTMLElement>(`[data-slot="latch-led"][data-kind="${kind}"]`);
  if (el === null) throw new Error(`LED 를 찾지 못했다: ${kind}`);
  return el;
};

describe("latchLedStateOf — 전략 없음 (D-19)", () => {
  it("① server 가 null 이면 세 LED 전부 회색·클릭 불가·툴팁 없음", () => {
    const expected: LatchLedState = {
      tone: "off",
      clickable: false,
      label: "OFF",
      tooltip: null,
    };
    expect(latchLedStateOf("buy", null)).toEqual(expected);
    expect(latchLedStateOf("sell", null)).toEqual(expected);
    expect(latchLedStateOf("cancel", null)).toEqual(expected);
  });
});

describe("latchLedStateOf — 매도 LED (UpdateSellLatchLabel :4246)", () => {
  it("②-1 sellEnabled=false → 회색 OFF · 클릭 불가 · 툴팁 없음", () => {
    expect(latchLedStateOf("sell", chaser({ sellEnabled: false }))).toEqual({
      tone: "off",
      clickable: false,
      label: "OFF",
      tooltip: null,
    });
  });

  it("②-2 sellEnabled ∧ !sellEntryLatched → 주황 대기 · 클릭 가능 · 켜는 툴팁", () => {
    expect(
      latchLedStateOf("sell", chaser({ sellEnabled: true, sellEntryLatched: false })),
    ).toEqual({
      tone: "latent",
      clickable: true,
      label: "대기",
      tooltip: "클릭하면 매도 진입 확인 래치를 지금 켠다 (다음 호가부터 매도 판정)",
    });
  });

  it("②-3 sellEnabled ∧ sellEntryLatched → 초록 감시 · 클릭 가능 · 끄는 툴팁", () => {
    expect(
      latchLedStateOf("sell", chaser({ sellEnabled: true, sellEntryLatched: true })),
    ).toEqual({
      tone: "armed",
      clickable: true,
      label: "감시",
      tooltip: "클릭하면 매도 진입 확인 래치를 끈다 (다시 잠복 — 벽을 다시 관측해야 판정 시작)",
    });
  });
});

describe("latchLedStateOf — 취소 LED (UpdateCancelLatchLed :4342 · AnyCancelOn :4179)", () => {
  it("③-1 ★Pitfall 5 — cancelQtyTrackEnabled 만 true 면 여전히 회색·클릭 불가", () => {
    expect(
      latchLedStateOf(
        "cancel",
        chaser({
          cancelQtyEnabled: false,
          cancelTradeEnabled: false,
          cancelQtyTrackEnabled: true,
          // 래치가 살아 있어도(무장과 접지 않은 원값) 무장이 아니면 회색이다.
          cancelEntryLatched: true,
        }),
      ),
    ).toEqual({ tone: "off", clickable: false, label: "OFF", tooltip: null });
  });

  it("③-2 cancelQtyEnabled ∧ !cancelEntryLatched → 주황 대기 · 클릭 가능", () => {
    expect(
      latchLedStateOf("cancel", chaser({ cancelQtyEnabled: true, cancelEntryLatched: false })),
    ).toEqual({
      tone: "latent",
      clickable: true,
      label: "대기",
      tooltip:
        "클릭하면 취소 진입 확인 래치를 지금 켠다 (다음 호가부터 취소 판정 — 조건이 이미 맞으면 바로 취소된다)",
    });
  });

  it("③-3 cancelTradeEnabled ∧ cancelEntryLatched → 초록 감시 · 클릭 가능", () => {
    expect(
      latchLedStateOf("cancel", chaser({ cancelTradeEnabled: true, cancelEntryLatched: true })),
    ).toEqual({
      tone: "armed",
      clickable: true,
      label: "감시",
      tooltip: "클릭하면 취소 진입 확인 래치를 끈다 (다시 잠복 — 벽을 다시 관측해야 취소 판정 시작)",
    });
  });

  it("③-4 판정 함수 본문이 cancelQtyTrackEnabled 를 한 번도 읽지 않는다 (T-17-24)", () => {
    const body = SOURCE.slice(SOURCE.indexOf("export function latchLedStateOf"));
    const fnBody = body.slice(0, body.indexOf("\n}\n") + 3);
    expect(fnBody).not.toContain("cancelQtyTrackEnabled");
    // 파일 전체로도 잔량추적은 이 LED 의 관심사가 아니다.
    expect(SOURCE.split("cancelQtyTrackEnabled").length - 1).toBeLessThanOrEqual(1);
  });
});

describe("latchLedStateOf — 매수 LED (Phase 24 D-12 — 마스터 + 후매수 단계, 클릭 불가)", () => {
  it("④-1 buyEnabled=false → 회색 OFF", () => {
    expect(latchLedStateOf("buy", chaser({ buyEnabled: false }))).toEqual({
      tone: "off",
      clickable: false,
      label: "OFF",
      tooltip: null,
    });
  });

  it("④-2 buyEnabled ∧ postBuyPhase 1(감시) → 초록 「감시」 · 클릭 불가 · 툴팁 없음", () => {
    expect(latchLedStateOf("buy", chaser({ buyEnabled: true, postBuyPhase: 1 }))).toEqual({
      tone: "armed",
      clickable: false,
      label: "감시",
      tooltip: null,
    });
  });

  it("④-3 buyEnabled ∧ postBuyPhase 2 → 주황 「보유중」 · 클릭 불가 · C# 원문 툴팁", () => {
    expect(latchLedStateOf("buy", chaser({ buyEnabled: true, postBuyPhase: 2 }))).toEqual({
      tone: "latent",
      clickable: false,
      label: "보유중",
      tooltip: BUY_HOLDING_TOOLTIP,
    });
  });

  it("④-4 ★마스터 우선 — buyEnabled=false ∧ postBuyPhase 2 → OFF (WinForms 와 다른 점: 웹은 마스터가 이긴다)", () => {
    expect(latchLedStateOf("buy", chaser({ buyEnabled: false, postBuyPhase: 2 }))).toEqual({
      tone: "off",
      clickable: false,
      label: "OFF",
      tooltip: null,
    });
  });

  it("④-5 단계 0 · 3 도 무장이면 초록 「감시」 — 감시대상(buyWatchSide)과 무관하다", () => {
    for (const postBuyPhase of [0, 3]) {
      for (const buyWatchSide of ["0", "1"] as const) {
        expect(
          latchLedStateOf("buy", chaser({ buyEnabled: true, postBuyPhase, buyWatchSide })),
        ).toEqual({ tone: "armed", clickable: false, label: "감시", tooltip: null });
      }
    }
  });
});

describe("툴팁 원문 — C# 리터럴", () => {
  it("⑤ 매수 「보유중」 툴팁이 원문 그대로다 · 매수 래치 3문구는 사라졌다", () => {
    expect(BUY_HOLDING_TOOLTIP).toBe(TIP_BUY_HOLDING);
    expect(SOURCE).toContain(TIP_BUY_HOLDING);
    expect(SOURCE).not.toContain("매수 진입 확인 래치를");
  });
});

describe("LatchLed — 접근성 (D-21 · WCAG 1.4.1)", () => {
  it("⑥-1 클릭 가능한 LED 는 aria-pressed 를 가진다 (초록 true · 주황 false)", () => {
    const { unmount } = render(
      <LatchLed kind="sell" server={chaser({ sellEnabled: true, sellEntryLatched: false })} />,
    );
    expect(ledEl("sell")).toHaveAttribute("aria-pressed", "false");
    unmount();

    render(
      <LatchLed kind="sell" server={chaser({ sellEnabled: true, sellEntryLatched: true })} />,
    );
    expect(ledEl("sell")).toHaveAttribute("aria-pressed", "true");
  });

  it("⑥-2 클릭 불가 LED 는 aria-pressed 를 가지지 않고 탭 순서에도 없다", () => {
    render(<LatchLed kind="buy" server={chaser({ buyEnabled: true, postBuyPhase: 2 })} />);
    const el = ledEl("buy");
    expect(el).not.toHaveAttribute("aria-pressed");
    expect(el.tagName).not.toBe("BUTTON");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("⑥-3 모든 LED 가 색 밖의 텍스트 경로를 가진다 (라벨이 상태를 말한다)", () => {
    const server = chaser({
      buyEnabled: true,
      buyWatchSide: "0",
      sellEnabled: true,
      sellEntryLatched: true,
      cancelQtyEnabled: false,
      cancelTradeEnabled: false,
    });
    render(
      <>
        <LatchLed kind="buy" server={server} />
        <LatchLed kind="sell" server={server} />
        <LatchLed kind="cancel" server={server} />
      </>,
    );
    expect(ledEl("buy").textContent).toContain("감시");
    // 매수는 래치가 없어 sr-only 조사가 「상태」다(UI-SPEC R12) — 매도·취소는 「래치」.
    expect(ledEl("buy").textContent).toContain("매수상태감시");
    expect(ledEl("sell").textContent).toContain("매도래치감시");
    expect(ledEl("sell").textContent).toContain("감시");
    expect(ledEl("cancel").textContent).toContain("OFF");
    // 색 단계는 data-tone 으로도 읽히지만, 텍스트가 없으면 색만 남는다.
    expect(ledEl("cancel")).toHaveAttribute("data-tone", "off");
    expect(ledEl("sell")).toHaveAttribute("data-tone", "armed");
  });
});

describe("LatchLed — 클릭 (D-20 · 확인 다이얼로그 없음)", () => {
  it("⑦-1 클릭 가능한 LED 를 누르면 onArm 이 그 종류로 한 번 불린다", async () => {
    const onArm = vi.fn();
    render(
      <LatchLed
        kind="cancel"
        server={chaser({ cancelQtyEnabled: true, cancelEntryLatched: false })}
        onArm={onArm}
      />,
    );
    await userEvent.click(ledEl("cancel"));
    expect(onArm).toHaveBeenCalledTimes(1);
    expect(onArm).toHaveBeenCalledWith("cancel");
  });

  it("⑦-2 매수 LED(감시 · 보유중)는 눌러도 onArm 을 부르지 않는다 (D-12)", async () => {
    const onArm = vi.fn();
    for (const postBuyPhase of [1, 2]) {
      const { unmount } = render(
        <LatchLed kind="buy" server={chaser({ buyEnabled: true, postBuyPhase })} onArm={onArm} />,
      );
      expect(ledEl("buy").tagName).toBe("SPAN");
      await userEvent.click(ledEl("buy"));
      unmount();
    }
    expect(onArm).not.toHaveBeenCalled();
  });
});

describe("LatchLed — 점 변형 (quick-260923-onn)", () => {
  it("⑧-1 클릭 가능한 점은 button[data-variant=dot] · 보이는 텍스트 없이 sr-only 이름 · 누르면 onArm 1회", async () => {
    const onArm = vi.fn();
    render(
      <LatchLed
        kind="sell"
        variant="dot"
        server={chaser({ sellEnabled: true, sellEntryLatched: false })}
        onArm={onArm}
      />,
    );
    const el = ledEl("sell");
    expect(el.tagName).toBe("BUTTON");
    expect(el).toHaveAttribute("data-variant", "dot");
    expect(el).toHaveAttribute("data-tone", "latent");
    expect(el).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "매도 래치 대기" })).toBe(el);
    // 보이는 텍스트는 sr-only 뿐이다 — 이름·라벨을 화면에 그리지 않는다.
    const visible = Array.from(el.querySelectorAll("span")).filter(
      (s) => !s.classList.contains("sr-only") && (s.textContent ?? "") !== "",
    );
    expect(visible).toHaveLength(0);
    await userEvent.click(el);
    expect(onArm).toHaveBeenCalledTimes(1);
    expect(onArm).toHaveBeenCalledWith("sell");
  });

  it("⑧-2 클릭 불가 점(전략 없음 · 매수)은 span 이고 눌러도 onArm 을 부르지 않는다", async () => {
    const onArm = vi.fn();
    const { unmount } = render(<LatchLed kind="cancel" variant="dot" server={null} onArm={onArm} />);
    expect(ledEl("cancel").tagName).toBe("SPAN");
    expect(ledEl("cancel")).toHaveAttribute("data-variant", "dot");
    await userEvent.click(ledEl("cancel"));
    unmount();

    render(
      <LatchLed
        kind="buy"
        variant="dot"
        server={chaser({ buyEnabled: true, postBuyPhase: 1 })}
        onArm={onArm}
      />,
    );
    const buy = ledEl("buy");
    expect(buy.tagName).toBe("SPAN");
    expect(buy).not.toHaveAttribute("aria-pressed");
    expect(screen.queryByRole("button")).toBeNull();
    await userEvent.click(buy);
    expect(onArm).not.toHaveBeenCalled();
  });

  it("⑧-3 점 툴팁은 「{이름} · {라벨}」 줄과 C# 원문을 함께 말한다 — 매수 보유중 (UI-SPEC §10)", async () => {
    render(
      <LatchLed
        kind="buy"
        variant="dot"
        server={chaser({ buyEnabled: true, postBuyPhase: 2 })}
      />,
    );
    // sr-only 이름은 「매수 상태 보유중」(R12).
    expect(ledEl("buy").textContent).toContain("매수 상태 보유중");
    await userEvent.hover(ledEl("buy"));
    const tip = await screen.findByRole("tooltip", {}, { timeout: 2000 });
    expect(tip.textContent).toContain("매수 · 보유중");
    expect(tip.textContent).toContain(TIP_BUY_HOLDING);
  });

  it("⑧-4 variant 를 넘기지 않은 칩은 종전 DOM 그대로다(data-variant 없음 · 라벨 텍스트)", () => {
    render(<LatchLed kind="cancel" server={null} />);
    const el = ledEl("cancel");
    expect(el).not.toHaveAttribute("data-variant");
    expect(el.textContent).toContain("OFF");
  });
});

describe("Phase 27 자동 LED (D-04 — WinForms ledAutoSell 동형 · 클릭 불가)", () => {
  it("상태 3(매도중) → 초록 armed 「매도중」 · <span> · 툴팁 「자동매도 매도중 · 기준 상한가 13,000원」", () => {
    const server = chaser({
      autoSellEnabled: true,
      autoSellState: 3,
      autoSellBasis: 1,
      autoSellBasisPrice: 13_000,
    });
    expect(latchLedStateOf("autoSell", server)).toEqual({
      tone: "armed",
      clickable: false,
      label: "매도중",
      tooltip: "자동매도 매도중 · 기준 상한가 13,000원",
    });

    const onArm = vi.fn();
    render(<LatchLed kind="autoSell" server={server} onArm={onArm} />);
    const el = ledEl("autoSell");
    expect(el.tagName).toBe("SPAN");
    expect(el).not.toHaveAttribute("aria-pressed");
    expect(el).toHaveAttribute("data-tone", "armed");
    // 이름 「자동」 · sr-only 조사 「상태」(래치가 아니다) · 라벨 「매도중」.
    expect(el.textContent).toContain("자동상태매도중");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it.each([
    [0, "off", "OFF"],
    [1, "latent", "대기"],
    [2, "armed", "감시"],
    [3, "armed", "매도중"],
    [4, "latent", "완료"],
    [5, "off", "OFF"],
  ] as const)("상태 %i → %s 「%s」 · 늘 클릭 불가 (체크 값은 보지 않는다)", (autoSellState, tone, label) => {
    // 체크가 꺼져 있어도 상태가 진실이다 — 체크 값으로 판정을 바꾸지 않는다.
    for (const autoSellEnabled of [true, false]) {
      const st = latchLedStateOf("autoSell", chaser({ autoSellEnabled, autoSellState }));
      expect(st.tone).toBe(tone);
      expect(st.label).toBe(label);
      expect(st.clickable).toBe(false);
    }
  });

  it("server null → OFF · 툴팁 없음 / 상태 0 → OFF · 툴팁 「자동매도 꺼짐」", () => {
    expect(latchLedStateOf("autoSell", null)).toEqual({ tone: "off", clickable: false, label: "OFF", tooltip: null });
    expect(latchLedStateOf("autoSell", chaser({ autoSellState: 0 })).tooltip).toBe("자동매도 꺼짐");
  });

  it("툴팁 — 기준 2 는 「매수가」 · 기준가격 0 이면 꼬리 없음", () => {
    expect(
      latchLedStateOf("autoSell", chaser({ autoSellState: 2, autoSellBasis: 2, autoSellBasisPrice: 12_800 })).tooltip,
    ).toBe("자동매도 감시 · 기준 매수가 12,800원");
    expect(latchLedStateOf("autoSell", chaser({ autoSellState: 1, autoSellBasis: 0, autoSellBasisPrice: 0 })).tooltip).toBe(
      "자동매도 대기",
    );
  });

  it("툴팁 꼬리는 카드 「기준」 행(lcAutoSellBasisText)과 같은 규칙 — 기준 0(미정)이면 기준가격이 있어도 꼬리 없음 (IN-04)", () => {
    for (const [autoSellBasis, autoSellBasisPrice] of [
      [0, 13_000],
      [1, 13_000],
      [2, 12_800],
    ] as const) {
      const server = chaser({ autoSellState: 3, autoSellBasis, autoSellBasisPrice });
      const basis = lcAutoSellBasisText(server);
      const tip = latchLedStateOf("autoSell", server).tooltip;
      expect(tip).toBe(basis === "—" ? "자동매도 매도중" : `자동매도 매도중 · 기준 ${basis}`);
    }
    // 카드가 「—」 인 basis 0 에서 LED 도 꼬리를 달지 않는다(종전엔 「기준 상한가 13,000원」).
    expect(latchLedStateOf("autoSell", chaser({ autoSellState: 3, autoSellBasis: 0, autoSellBasisPrice: 13_000 })).tooltip).toBe(
      "자동매도 매도중",
    );
  });

  it("다섯 상태 모두 <span> 이고 눌러도 onArm 을 부르지 않는다 · 점 변형도 같다", async () => {
    const onArm = vi.fn();
    for (const autoSellState of [0, 1, 2, 3, 4]) {
      for (const variant of ["chip", "dot"] as const) {
        const { unmount } = render(
          <LatchLed kind="autoSell" variant={variant} server={chaser({ autoSellState })} onArm={onArm} />,
        );
        expect(ledEl("autoSell").tagName).toBe("SPAN");
        expect(screen.queryByRole("button")).toBeNull();
        await userEvent.click(ledEl("autoSell"));
        unmount();
      }
    }
    expect(onArm).not.toHaveBeenCalled();
  });
});
