"use client";

/**
 * CardHeader — 전략 카드 1장의 헤더 (D-09 · D-10 · TRADE-09 · 목업 `18-workbench-mockup.html:1062-1070`).
 *
 * ① 무엇을 그리는가 — 펼침·접힘 **공통**
 *   `l1` = 캐럿 ▶ · 종목명 · 코드 · KRX|NXT 세그먼트 · 우측 현재가+등락률
 *   `l2` = LED 3칩(매수 · 매도 · 취소) · ⓘ 종목정보 · ✕ 카드 제거
 *   ★ **매수/매도/한방 스위치는 헤더에 없다** (D-12). 스위치는 본문 각 그룹 제목줄 우측에
 *     산다. 접힌 카드의 무장 상태는 LED 가 말한다 — 헤더에 스위치까지 두면 같은 무장을 두
 *     표기가 서로 다르게 말하는 순간이 생긴다(Phase 17 D-22 와 같은 이유).
 *   ★ 전략 배지(`StrategyBadge`)를 두지 않는다 — 목업 정본 헤더에 없고, 무장 상태는 LED 가,
 *     거래소는 세그먼트가 이미 말한다. 같은 사실을 세 번째 표기로 쓰지 않는다.
 *
 * ② ★ 거래소 세그먼트는 **등록 전 카드에서만** 바꿀 수 있다 (D-10 · T-18-27)
 *   거래소는 전략 키(`ISIN:계좌:거래소`)의 일부라, 등록된 뒤에 바꾸면 **다른 전략**을
 *   조작하게 된다. 잠김은 세 경로로 말한다 — `disabled`(마우스·키보드) · `aria-disabled`
 *   (스크린리더) · `title`(이유). 셋 중 하나만 빠져도 누군가에게는 「왜 안 눌리지」가 된다.
 *   등록된 전략의 거래소 변경 자체는 이 phase 범위 밖이다(이연).
 *
 * ③ ★ 헤더 전체가 펼침 토글의 클릭 영역이다 — 단, 그 안의 컨트롤은 제외 (D-09)
 *   세그먼트·LED·ⓘ·✕ 는 자기 일을 하고 `stopPropagation` 으로 전파를 막는다. 막지 않으면
 *   LED 를 눌러 래치를 켜는 순간 카드가 함께 접힌다.
 *   키보드 경로는 토글 **버튼** 하나다(`aria-expanded` · `aria-controls`). 헤더 빈 자리
 *   클릭은 마우스 편의일 뿐이라 따로 키 핸들러를 두지 않는다.
 *   토글 뒤 포커스는 **누른 헤더 버튼으로** 되돌린다 — 접기로 카드가 스택으로 옮겨지면
 *   React 가 카드를 다시 마운트하고 포커스가 `body` 로 떨어진다. 그래서 요소 참조가 아니라
 *   **안정된 `id`** 로 되찾는다(재마운트 뒤에도 같은 id 다).
 *   펼침/접힘은 재렌더이고 애니메이션이 없다 — 캐럿 회전(150ms)만 목업 그대로다.
 *
 * ④ ★ 반응형은 카드 폭(`@container/lc`)만 잰다 — 뷰포트 브레이크포인트를 섞지 않는다 (D-28)
 *   섞으면 사이드바가 열릴 때 카드 폭과 뷰포트 폭이 어긋나 §2.2b 가 기록한 255px 역전이
 *   되살아난다.
 */

import type { MouseEvent, SyntheticEvent } from "react";
import type { RelayExchange } from "@gh-radar/shared";

import {
  LatchLed,
  type LatchLedKind,
  type LatchLedServer,
} from "@/components/trading/latch-led";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";

/** 거래소 잠김 사유 — UI-SPEC §Copywriting 카드 표 원문. 테스트가 같은 상수를 읽는다. */
export const EXCHANGE_LOCKED_TITLE =
  "거래소는 전략 키의 일부라 등록 후에는 바꿀 수 없어요";

const EXCHANGES: readonly RelayExchange[] = ["KRX", "NXT"];
const LED_KINDS: readonly LatchLedKind[] = ["buy", "sell", "cancel"];
const KRW = new Intl.NumberFormat("ko-KR");

export interface CardHeaderProps {
  /** 표시 종목명. 모르면 호출부가 ISIN 을 넣는다(파일 밖 규약 — `app-sidebar` 와 같다). */
  name: string;
  /**
   * 종목명 요소의 `title`(UI-SPEC Q-3) — 같은 종목 카드가 둘일 때 「{종목명} · 계좌 {계좌} · {거래소}」
   * 로 어느 전략인지 말한다. 미지정이면 `name`.
   */
  nameTitle?: string;
  /** 6자 단축코드. 모르면 `null` — 그때는 코드 조각을 그리지 않고 ⓘ 가 비활성이다(D-30). */
  code: string | null;
  exchange: RelayExchange;
  onExchangeChange: (exchange: RelayExchange) => void;
  /** 서버 전략이 있다(= 등록됨) → 세그먼트 잠김. */
  exchangeLocked: boolean;
  /** 현재가. 시세 미수신이면 `null` → 「—」. */
  price: number | null;
  /** 등락률(%). 시세 미수신이면 `null` → 「—」. */
  changeRate: number | null;
  /** LED 3칩의 **유일한** 판정 입력 — 마지막 서버 에코(+`hadOrder`). `null` = 전략 없음. */
  ledServer: LatchLedServer;
  onArm: (kind: LatchLedKind) => void;
  open: boolean;
  onToggle: () => void;
  /** 토글 버튼 id — 재마운트 뒤에도 같은 값이어야 포커스를 되찾는다(③). */
  toggleId: string;
  /** `aria-controls` 가 가리키는 카드 본문 영역 id. */
  controlsId: string;
  onInfo?: () => void;
  onClose: () => void;
}

/** 헤더 안 컨트롤의 클릭이 헤더 토글로 번지지 않게 한다(③). */
function stop(event: SyntheticEvent): void {
  event.stopPropagation();
}

function toneOf(rate: number | null): string {
  if (rate === null || rate === 0) return "text-[var(--flat)]";
  return rate > 0 ? "text-[var(--up)]" : "text-[var(--down)]";
}

export function CardHeader({
  name,
  nameTitle,
  code,
  exchange,
  onExchangeChange,
  exchangeLocked,
  price,
  changeRate,
  ledServer,
  onArm,
  open,
  onToggle,
  toggleId,
  controlsId,
  onInfo,
  onClose,
}: CardHeaderProps) {
  const toggle = (event: MouseEvent) => {
    event.stopPropagation();
    onToggle();
    // 재렌더(스택 ↔ 격자 이동으로 재마운트될 수 있다) **뒤에** id 로 되찾는다(③).
    window.setTimeout(() => document.getElementById(toggleId)?.focus(), 0);
  };

  const priceText = price !== null && price > 0 ? KRW.format(price) : "—";
  const rateText =
    changeRate === null
      ? "—"
      : `${changeRate > 0 ? "+" : ""}${changeRate.toFixed(2)}%`;

  return (
    /*
      ★ `onClick` 은 마우스 편의(헤더 빈 자리)다. 키보드·스크린리더 경로는 아래 토글
        **버튼**이 전부 갖는다(③) — 그래서 헤더 자체에 role·tabIndex 를 주지 않는다.
    */
    <header
      data-slot="card-header"
      data-open={open ? "true" : "false"}
      onClick={toggle}
      className="flex min-w-0 cursor-pointer flex-wrap items-center gap-x-3.5 gap-y-1.5 px-2.5 py-2 select-none"
    >
      {/*
        ★ 헤더 한 줄 결합 경계 **카드 폭 760px** 는 **§2.2b 밴드 표와 무관** — 헤더 한 줄 배치
          전용의 로컬 경계다 (D-26). 4밴드(700 · 830 · 992)의 네 번째 경계가 아니므로 밴드 표에
          올리지 않는다. 760 미만에서 `l1`/`l2` 가 각자 한 줄(`basis-full`)을 먹어 두 줄로
          접히고, 760 이상에서 `l1` 이 남는 폭을, `l2` 가 제 폭만 가져가 한 줄로 붙는다.
      */}
      <div
        data-slot="card-header-l1"
        className="flex min-w-0 flex-[1_1_100%] items-center gap-2 @min-[760px]/lc:flex-[1_1_auto]"
      >
        <button
          type="button"
          id={toggleId}
          aria-expanded={open}
          aria-controls={controlsId}
          onClick={toggle}
          className="flex min-w-0 items-center gap-2 rounded-[var(--r-sm)] text-left"
        >
          <span
            aria-hidden="true"
            className={cn(
              "w-[18px] flex-none text-center text-[11px] text-[var(--muted-fg)] transition-transform duration-150 motion-reduce:transition-none",
              open && "rotate-90",
            )}
          >
            ▶
          </span>
          {/*
            종목명/코드 — 폰 밴드(카드 ≤699)에서 **두 줄**(`line-height:1.15`, 코드 10px),
            700 이상에서 한 줄 baseline 정렬(목업 `:386-389`).
            ★ 종목명은 1줄 ellipsis 이고 전체는 `title` 에 담는다(E7 long-text). `min-w-0`
              (행) + `max-w-full`(열) 둘 다 있어야 두 배치 모두에서 줄어든다.
          */}
          <span className="flex min-w-0 flex-col items-start gap-0 leading-[1.15] @min-[700px]/lc:flex-row @min-[700px]/lc:items-baseline @min-[700px]/lc:gap-1.5 @min-[700px]/lc:leading-normal">
            <b
              data-part="name"
              title={nameTitle ?? name}
              className="max-w-full min-w-0 truncate text-[15px] font-bold text-[var(--fg)]"
            >
              {name}
            </b>
            {code !== null && (
              <span
                data-part="code"
                className="mono flex-none text-[10px] text-[var(--muted-fg)] @min-[700px]/lc:text-[11px]"
              >
                {code}
              </span>
            )}
          </span>
        </button>

        {/*
          거래소 세그먼트 — `ToggleGroup type="single"`(Radix: 그룹 `role="group"`, 항목
          라디오형 `role="radio"` + `aria-checked`, ←/→ 로빙 포커스).
          ★ 잠김 `title` 은 그룹과 항목 **양쪽**에 건다 — 비활성 항목은 포인터 이벤트를
            받지 않아(`disabled:pointer-events-none`) 호버가 그룹으로 떨어진다.
          ★ 빈 값(`""`)은 무시한다 — single 그룹은 선택된 항목을 다시 누르면 해제를 알린다.
            거래소가 「없음」인 카드는 존재하지 않는다.
        */}
        <span onClick={stop} className="flex flex-none">
          <ToggleGroup
            type="single"
            value={exchange}
            onValueChange={(v) => {
              if (v === "KRX" || v === "NXT") onExchangeChange(v);
            }}
            disabled={exchangeLocked}
            aria-label="거래소"
            aria-disabled={exchangeLocked ? "true" : undefined}
            title={exchangeLocked ? EXCHANGE_LOCKED_TITLE : undefined}
            data-slot="card-exchange-segment"
            className="h-5 gap-0 overflow-hidden rounded-[var(--r-sm)] border border-[var(--border)]"
          >
            {EXCHANGES.map((ex) => (
              <ToggleGroupItem
                key={ex}
                value={ex}
                aria-disabled={exchangeLocked ? "true" : undefined}
                title={exchangeLocked ? EXCHANGE_LOCKED_TITLE : undefined}
                className="h-5 min-w-0 rounded-none bg-[var(--card)] px-1.5 text-[10px] font-bold tracking-[0.02em] text-[var(--muted-fg)] not-first:border-l not-first:border-[var(--border)] data-[state=on]:bg-[var(--accent)] data-[state=on]:text-[var(--accent-fg)]"
              >
                {ex}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </span>

        <span
          data-slot="card-header-price"
          className={cn(
            "ml-auto flex flex-none items-baseline gap-1.5 whitespace-nowrap",
            toneOf(changeRate),
          )}
        >
          <b data-part="price" className="mono text-[15px] font-bold">
            {priceText}
          </b>
          <span data-part="rate" className="mono text-[12px] font-semibold">
            {rateText}
          </span>
        </span>
      </div>

      <div
        data-slot="card-header-l2"
        className="flex min-w-0 flex-[1_1_100%] flex-wrap items-center gap-2.5 @min-[760px]/lc:flex-[0_0_auto]"
      >
        {/*
          LED 3칩 — 순서는 **매수 · 매도 · 취소**(Phase 17 D-22). 판정은 `LatchLed` 안의
          `latchLedStateOf` 규칙표 **한 곳**이다(T-18-28) — 여기서 톤·라벨을 다시 짓지 않는다.
          ★ `onArm` 의 전송 가드(클릭 가능 여부 재확인)는 호출부(`strategy-card`)의 것이다.
        */}
        <span onClick={stop} className="flex flex-wrap gap-1.5">
          {LED_KINDS.map((kind) => (
            <LatchLed key={kind} kind={kind} server={ledServer} onArm={onArm} />
          ))}
        </span>
        <span className="ml-auto flex flex-none items-center gap-1">
          {/*
            ⓘ — 코드가 없으면 비활성이다(D-30). 종목정보 팝업은 단축코드로 여는데, relay
            lookup 이 실패한 돌파 유래 카드는 그 코드를 모른다.
          */}
          <button
            type="button"
            title="종목정보 (차트 · 종목정보 · 뉴스·토론)"
            aria-label="종목정보"
            disabled={code === null}
            onClick={(e) => {
              e.stopPropagation();
              onInfo?.();
            }}
            className="inline-flex h-[26px] items-center rounded-[var(--r)] px-1.5 text-[13px] font-semibold text-[var(--muted-fg)] hover:bg-[var(--muted)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
          >
            ⓘ
          </button>
          <button
            type="button"
            title="카드 제거"
            aria-label={`${name} 카드 닫기`}
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="ml-1 inline-flex h-[26px] items-center rounded-[var(--r)] px-2.5 text-[11px] font-semibold text-[var(--muted-fg)] hover:bg-[var(--muted)]"
          >
            ✕
          </button>
        </span>
      </div>
    </header>
  );
}
