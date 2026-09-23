"use client";

import type { RelayLimitChaser } from "@gh-radar/shared";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * Phase 17 Plan 07 — 상따 3단계 래치 LED (매수·매도·취소).
 *
 * LED 는 「지금 이 전략이 발주 판정을 시작했는가」를 말하는 **유일한 표면**이다. 색 규칙이
 * C# 정본과 한 글자라도 갈리면 사용자가 무장 상태를 오독하고 실계좌 주문이 나간다. 정본:
 * `gh-trade/client/Forms/Trading/LimitChaserForm.cs` — 매수 `ShowBuyServerQty`(:1027) ·
 * 매도 `UpdateSellLatchLabel`(:4246) · 취소 `UpdateCancelLatchLed`(:4342) ·
 * 무장 판정 `AnyCancelOn`(:4179).
 *
 * ⚠️ **판정 근거는 마지막 서버 에코 스냅샷 하나다** (D-20). 폼 더티값도, 이미 칠해진 LED 색도
 *    되읽지 않는다 — 표시를 상태 판정 근거로 쓰면 표시를 바꾸는 순간 판정이 따라 바뀐다.
 *
 * ⚠️ **매도잔량 기준(`buyWatchSide "0"`)에 3단계를 그리면 거짓이다** (BL-01 · Pitfall 4).
 *    서버가 그 갈래 래치를 켜지도 보지도 않아 `buyEntryLatched` 는 언제나 `false` 로 온다.
 *    종전 2단계(무장이면 초록)를 유지하고 클릭도 받지 않는다.
 *
 * ⚠️ **취소 무장에 `cancelQtyTrackEnabled` 를 넣지 않는다** (Pitfall 5). 잔량추적은 무장 축이
 *    아니라 계산 옵션이라, 넣는 순간 「취소 감시 중」이라는 거짓 초록이 뜬다.
 *
 * 이 파일의 표면 범위는 **컴포넌트와 판정 함수까지**다. 상따 상태줄 결선과 `lc.arm` 전송은
 * 17-11 이 맡는다 — `onArm` 은 그 결선 지점이다. 래치 3종의 표면은 LED 이고 배지
 * (`strategy-badge.tsx`)에 섞지 않는다 (D-23).
 */

/** LED 3종. */
export type LatchLedKind = "buy" | "sell" | "cancel";

/** 색 단계. `off`=무장 아님(회색) · `latent`=잠복(주황) · `armed`=래치 ON(초록). */
export type LatchLedTone = "off" | "latent" | "armed";

/** 보이는 상태 라벨 (D-21 채택안 — 목업 변형 A 칩). */
export type LatchLedLabel = "OFF" | "대기" | "감시";

/**
 * 판정 결과 1건. 문구를 호출부가 짓지 않게 라벨·툴팁을 값으로 들고 다닌다.
 *
 * 이력: 라벨 옆 보조 문구(「(매도잔량 기준)」·「(발주됨)」)는 카드 헤더 LED 줄이 넘쳐 ⓘ·✕ 가
 * 다음 줄로 밀리던 문제로 사용자 요청에 따라 뺐다(2026-09-23). 칩은 「이름 + OFF/대기/감시」만
 * 말하고, 클릭 불가 사유는 툴팁 원문이 말한다. 발주 사실은 공용 패널(미체결·로그)이 말한다.
 */
export interface LatchLedState {
  tone: LatchLedTone;
  clickable: boolean;
  label: LatchLedLabel;
  /** C# 원문 툴팁. 전략이 없거나 회색이면 `null`(툴팁 없음). */
  tooltip: string | null;
}

/** 판정 근거 — **마지막 서버 에코 스냅샷 하나**다 (D-20). */
export type LatchLedServer = RelayLimitChaser | null;

/** LED 이름. 호출부가 문구를 다시 짓지 않게 하는 유일한 정의 지점이다. */
export const LATCH_LED_NAMES: Record<LatchLedKind, string> = {
  buy: "매수",
  sell: "매도",
  cancel: "취소",
};

/**
 * 툴팁 문구 정본 — C# `LimitChaserForm.cs` **원문 리터럴**이다. 한 글자도 고치지 마라:
 * 같은 문장이 WinForms 창과 웹에 동시에 뜨고, 사용자는 두 표면을 오가며 같은 문장을 읽는다.
 */
const TOOLTIPS = {
  buy: {
    /** :1051 — 켜는 쪽 문면이 취소·매도판보다 강하다. 새 노출이 생기는 방향이라서다. */
    on: "클릭하면 매수 진입 확인 래치를 지금 켠다 (다음 호가부터 잔량 항 판정 — 벽이 이미 감시수량 이상이면 바로 매수 주문이 나갈 수 있다)",
    /** :1050 */
    off: "클릭하면 매수 진입 확인 래치를 끈다 (다시 잠복 — 감시가 매수잔량이 감시수량 아래로 내려간 것을 다시 관측해야 잔량 항 판정이 시작된다)",
    /** :1057 — 무장인데 눌리지 않는 유일한 경우. 왜인지 말해 준다. */
    askSide:
      "매수 진입 확인 래치는 매수잔량 기준(매수1호가)일 때만 있다 — 매도잔량 기준 갈래는 원전 그대로라 등록 즉시 판정한다",
  },
  sell: {
    /** :4284 */
    on: "클릭하면 매도 진입 확인 래치를 지금 켠다 (다음 호가부터 매도 판정)",
    /** :4283 */
    off: "클릭하면 매도 진입 확인 래치를 끈다 (다시 잠복 — 벽을 다시 관측해야 판정 시작)",
  },
  cancel: {
    /** :4381 */
    on: "클릭하면 취소 진입 확인 래치를 지금 켠다 (다음 호가부터 취소 판정 — 조건이 이미 맞으면 바로 취소된다)",
    /** :4380 */
    off: "클릭하면 취소 진입 확인 래치를 끈다 (다시 잠복 — 벽을 다시 관측해야 취소 판정 시작)",
  },
} as const;

/** 무장 아님(회색) 기본형. 전략 없음과 무장 OFF 가 같은 모양인 것은 C# 계약 그대로다. */
const OFF_STATE: LatchLedState = {
  tone: "off",
  clickable: false,
  label: "OFF",
  tooltip: null,
};

/**
 * 서버 에코 스냅샷 1건 → LED 1개의 색·클릭 가능·라벨·툴팁 (**순수 함수**).
 *
 * 색 판정과 클릭 가능 판정은 **같은 식**을 쓴다 (C# D-09). 두 식이 갈리면 「눌리는데 회색」
 * 같은 상태가 생기고, 그때 사용자는 어느 쪽을 믿어야 하는지 알 수 없다.
 */
export function latchLedStateOf(
  kind: LatchLedKind,
  server: LatchLedServer,
): LatchLedState {
  // 전략 없음 = 그릴 상태가 없다. 무장 OFF 와 같은 회색이되 툴팁도 비운다 (C# D-02).
  if (server === null) return OFF_STATE;

  if (kind === "sell") {
    if (!server.sellEnabled) return OFF_STATE;
    return server.sellEntryLatched
      ? { tone: "armed", clickable: true, label: "감시", tooltip: TOOLTIPS.sell.off }
      : { tone: "latent", clickable: true, label: "대기", tooltip: TOOLTIPS.sell.on };
  }

  if (kind === "cancel") {
    // `AnyCancelOn`(:4179) 동형 — 무장은 이 둘뿐이다. 잔량추적 플래그는 무장 축이 아니라
    // 계산 옵션이라 여기서 읽지 않는다 (Pitfall 5 · T-17-24 — 파일 상단 ⚠️ 참조).
    const armed = server.cancelQtyEnabled || server.cancelTradeEnabled;
    if (!armed) return OFF_STATE;
    return server.cancelEntryLatched
      ? { tone: "armed", clickable: true, label: "감시", tooltip: TOOLTIPS.cancel.off }
      : { tone: "latent", clickable: true, label: "대기", tooltip: TOOLTIPS.cancel.on };
  }

  // 매수. 에코의 `buyEnabled` 는 설정값이 아니라 **무장 상태**다 — 발주가 나가면 false 로
  // 온다. 칩은 무장 여부만 말한다(OFF) — 「(발주됨)」 보조 문구는 2026-09-23 에 뺐다.
  if (!server.buyEnabled) return OFF_STATE;
  // 매수잔량 기준(와이어 "1")일 때만 래치라는 상태가 존재한다 (BL-01).
  if (server.buyWatchSide !== "1") {
    return {
      tone: "armed",
      clickable: false,
      label: "감시",
          tooltip: TOOLTIPS.buy.askSide,
    };
  }
  return server.buyEntryLatched
    ? { tone: "armed", clickable: true, label: "감시", tooltip: TOOLTIPS.buy.off }
    : { tone: "latent", clickable: true, label: "대기", tooltip: TOOLTIPS.buy.on };
}

/** 도트 색 — CSS 토큰을 클래스로만 쓴다. 토큰 값을 JS 로 읽어 주입하지 않는다. */
const DOT_CLASS: Record<LatchLedTone, string> = {
  off: "border-[1.5px] border-[var(--muted-fg)] bg-transparent",
  latent: "bg-[var(--led-latent)] shadow-[0_0_0_2px_color-mix(in_oklch,var(--led-latent)_28%,transparent)]",
  armed: "bg-[var(--led-armed)] shadow-[0_0_0_2px_color-mix(in_oklch,var(--led-armed)_28%,transparent)]",
};

export interface LatchLedProps {
  kind: LatchLedKind;
  /** 마지막 서버 에코 스냅샷. `null` = 그 키에 전략이 없다. */
  server: LatchLedServer;
  /** 클릭 토글. 17-11 이 `lc.arm` 전송으로 잇는다. 클릭 불가 LED 는 절대 부르지 않는다. */
  onArm?: (kind: LatchLedKind) => void;
  className?: string;
}

/**
 * LED 칩 1개 (D-21 채택안 — 목업 변형 A). 도트 + 이름 + 상태 라벨(+ 보조문구)을 테두리 있는
 * 칩으로 그린다.
 *
 * **색 밖의 텍스트 경로가 반드시 있다** (WCAG 1.4.1) — 라벨 `OFF`/`대기`/`감시` 가 보이는
 * 텍스트이고, 접근성 이름은 그 내용에서 파생된다(「매수 래치 감시」).
 *
 * 클릭 불가 LED 는 `<button disabled>` 가 아니라 **비상호작용 `<span>`** 으로 그린다. 두
 * 가지를 동시에 얻기 위해서다: ① 눌리지 않는 버튼이 탭 순서에 잡히지 않는다 ② 매도잔량
 * 기준 매수 LED 는 **클릭은 못 하지만 툴팁은 떠야 한다** — `disabled` 버튼은 포인터
 * 이벤트를 받지 않아 「왜 안 눌리는지」를 말할 기회가 사라진다.
 */
export function LatchLed({ kind, server, onArm, className }: LatchLedProps) {
  const state = latchLedStateOf(kind, server);
  const name = LATCH_LED_NAMES[kind];

  const chipBase = cn(
    "inline-flex items-center gap-1.5 rounded-full border py-0.5 pr-2 pl-1.5",
    "text-[length:var(--t-caption)] leading-none",
    className,
  );

  const body = (
    <>
      <span
        aria-hidden="true"
        className={cn("size-[9px] shrink-0 rounded-full", DOT_CLASS[state.tone])}
      />
      <span className="text-[var(--muted-fg)]">{name}</span>
      {/* 접근성 이름을 「매수 래치 감시」로 만드는 조사 — 화면에는 나오지 않는다. */}
      <span className="sr-only">래치</span>
      <span className={state.clickable ? "font-semibold text-[var(--fg)]" : "text-[var(--muted-fg)]"}>
        {state.label}
      </span>
    </>
  );

  const chip = state.clickable ? (
    <button
      type="button"
      data-slot="latch-led"
      data-kind={kind}
      data-tone={state.tone}
      aria-pressed={state.tone === "armed"}
      onClick={() => onArm?.(kind)}
      className={cn(
        chipBase,
        "cursor-pointer border-[var(--border)] bg-[var(--bg)] hover:border-[var(--muted-fg)]",
      )}
    >
      {body}
    </button>
  ) : (
    <span
      data-slot="latch-led"
      data-kind={kind}
      data-tone={state.tone}
      className={cn(chipBase, "border-dashed border-[var(--border)] bg-transparent")}
    >
      {body}
    </span>
  );

  if (state.tooltip === null) return chip;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{chip}</TooltipTrigger>
        {/* 한국어 원문 툴팁은 길다 — 기본 `whitespace-nowrap` 을 풀지 않으면 `max-w-xs`
            안에서 한 줄로 삐져나간다. 잘린 툴팁을 남기지 않는다 (T-17-26). */}
        <TooltipContent className="max-w-xs whitespace-normal">{state.tooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
