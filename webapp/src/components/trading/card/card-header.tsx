"use client";

/**
 * CardHeader — 전략 카드 1장의 헤더 (D-09 · D-10 · TRADE-09 · 목업 `18-workbench-mockup.html:1062-1070`).
 *
 * ① 무엇을 그리는가 — 펼침·접힘 **공통**
 *   `l1` = 캐럿 ▶ · 종목명(한 줄 · 코드 표시 없음 — quick-260925-ptw) · ⓘ 종목정보 · KRX|NXT
 *          세그먼트 · 우측 현재가+등락률
 *   ✕ 카드 제거 = 종목명 줄의 맨 오른쪽(등락률 오른쪽) — l1/l2 어느 쪽에도 속하지 않는 헤더 직계
 *   `l2` = LED 3칩(매수 · 매도 · 취소)(펼침) 또는 점 + 요약 칩(접힘) — 카드 760 미만은 둘째 줄
 *          전체, 760 이상은 ✕ 앞 한 줄
 *   ★ 접힘 = 점 3개 + 요약 칩(「미체결 N」 · 「잔고 N주」) · 펼침 = 칩 3개 (quick-260923-onn ·
 *     2026-09-23 목업 ①A). 접힌 카드에서 미체결·잔고 유무를 펼치지 않고 본다. 손익은 그리지
 *     않는다. 점도 칩과 같은 `latchLedStateOf` 판정 하나를 읽는다(색·클릭·툴팁 재판정 0).
 *   ★ **매수/매도/한방 스위치는 헤더에 없다** (D-12). 스위치는 본문 각 그룹 제목줄 우측에
 *     산다. 접힌 카드의 무장 상태는 LED 가 말한다 — 헤더에 스위치까지 두면 같은 무장을 두
 *     표기가 서로 다르게 말하는 순간이 생긴다(Phase 17 D-22 와 같은 이유).
 *   ★ 전략 배지(`StrategyBadge`)를 두지 않는다 — 목업 정본 헤더에 없고, 무장 상태는 LED 가,
 *     거래소는 세그먼트가 이미 말한다. 같은 사실을 세 번째 표기로 쓰지 않는다.
 *
 * ② ★ 거래소 세그먼트는 **등록 여부와 무관하게 활성**이다 (quick-260923-pgv · D-10 잠금 절 대체)
 *   토글은 전략 이동이 아니라 카드가 보는 키(`ISIN:계좌:거래소`)의 거래소 축 전환이다 — 새 키의
 *   서버 전략이 있으면 그것을, 없으면 미설정 폼을 보인다. 원래 거래소의 전략은 서버에 그대로
 *   남는다. 더티 값 보호(확인 다이얼로그)와 키 충돌(같은 키 카드로 이동)은 작업대
 *   `changeExchange` 의 몫이다 — 헤더는 고른 값을 알리기만 한다. 그룹 `title` 은 전환 설명
 *   한 줄이다.
 *
 * ②-b NXT 미거래 종목(quick-260923-pq2)은 세그먼트가 「KRX」 라벨 하나다 — 판정은
 *   `exchangeChoicesOf`(호출부 `strategy-card`)이고 헤더는 받은 선택지만 그린다. 모르면 둘 다.
 *   현재 거래소가 NXT 면 둘 다(순수 함수 예외). 라벨은 토글이 아니다(role 없음) — 같은 높이·
 *   패딩·글자라 헤더 배치가 바뀌지 않는다.
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
import { EXCHANGE_CHOICES_ALL } from "@/lib/exchange-choices";
import { cn } from "@/lib/utils";

/** 세그먼트 그룹 `title` — 잠금 사유가 아니라 전환 설명(quick-260923-pgv). 테스트가 같은 상수를 읽는다. */
export const EXCHANGE_SEGMENT_TITLE = "거래소 전환 — 이 종목의 KRX·NXT 전략을 오가며 봐요";

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
  /**
   * 6자 단축코드. 헤더에 글자로 그리지 않는다(quick-260925-ptw) — ⓘ 활성 판정 전용이다.
   * 모르면 `null` → ⓘ 비활성(D-30).
   */
  code: string | null;
  exchange: RelayExchange;
  /**
   * 거래소 선택지 — `exchangeChoicesOf` 결과. 미지정 = 모름 = 둘 다. 길이 1 이면 토글이 아니라
   * 라벨 하나를 그린다(quick-260923-pq2).
   */
  exchangeChoices?: readonly RelayExchange[];
  onExchangeChange: (exchange: RelayExchange) => void;
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
  /** 이 카드 종목·거래소·계좌의 미체결 건수(접힌 헤더 요약 칩). 0 이면 칩을 그리지 않는다. */
  unfilledCount?: number;
  /** 이 카드 종목의 보유 수량(접힌 헤더 요약 칩). `null`/0 이면 칩을 그리지 않는다. */
  holdingQty?: number | null;
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
  exchangeChoices = EXCHANGE_CHOICES_ALL,
  onExchangeChange,
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
  unfilledCount = 0,
  holdingQty = null,
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
      className="flex min-w-0 cursor-pointer flex-wrap items-center gap-x-3.5 gap-y-1.5 px-2.5 py-3 select-none"
    >
      {/*
        ★ 헤더 한 줄 결합 경계 **카드 폭 760px** 는 **§2.2b 밴드 표와 무관** — 헤더 한 줄 배치
          전용의 로컬 경계다 (D-26). 4밴드(700 · 830 · 992)의 네 번째 경계가 아니므로 밴드 표에
          올리지 않는다.
          · 760 미만: [▶ 종목명 ⓘ (KRX|NXT) … 현재가 등락률 ✕] / 둘째 줄 `l2`(LED 또는 점+요약 칩).
          · 760 이상: 한 줄 [▶ 종목명 ⓘ (KRX|NXT) … 현재가 등락률 LED ✕].
          DOM 은 폰 우선 순서(l1 → ✕ → l2)이고, 넓은 밴드에서 `order` 로 ✕ 를 LED 뒤로 보낸다.
          `l1` 은 두 밴드 공통 basis 0 — ✕·LED 몫을 먼저 보장하고 남는 폭을 가진다(긴 이름은 말줄임).
          (quick-260925-ptw)
      */}
      <div
        data-slot="card-header-l1"
        className="flex min-w-0 flex-[1_1_0%] items-center gap-2"
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
            종목명 — 한 줄(15px/700). 넘치면 ellipsis 이고 전체는 `title` 에 담는다(E7 long-text).
            종목코드는 그리지 않는다(quick-260925-ptw) — 이름만으로 충분하고 헤더 폭을 아낀다.
          */}
          <b
            data-part="name"
            title={nameTitle ?? name}
            className="min-w-0 truncate text-[15px] leading-normal font-bold text-[var(--fg)]"
          >
            {name}
          </b>
        </button>

        {/*
          ⓘ — 종목명 바로 오른쪽(quick-260925-ptw). 코드가 없으면 비활성이다(D-30). 종목정보
          팝업은 단축코드로 여는데, relay lookup 이 실패한 돌파 유래 카드는 그 코드를 모른다.
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
          className="inline-flex h-[26px] flex-none items-center rounded-[var(--r)] px-1.5 text-[13px] font-semibold text-[var(--muted-fg)] hover:bg-[var(--muted)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
        >
          ⓘ
        </button>

        {/*
          거래소 세그먼트 — `ToggleGroup type="single"`(Radix: 그룹 `role="group"`, 항목
          라디오형 `role="radio"` + `aria-checked`, ←/→ 로빙 포커스).
          ★ `title` 은 그룹에만 건다 — 항목은 활성이라 호버가 항목에서 그룹으로 버블링해 같은
            설명을 보인다(항목마다 다시 적지 않는다).
          ★ 빈 값(`""`)은 무시한다 — single 그룹은 선택된 항목을 다시 누르면 해제를 알린다.
            거래소가 「없음」인 카드는 존재하지 않는다.
        */}
        <span onClick={stop} className="flex flex-none">
          {/* ②-b NXT 미거래 종목(선택지 1개)은 세그먼트를 아예 그리지 않는다 — KRX 뿐이라 말할 것이 없다
              (2026-09-23 사용자 요청 · 종전 quick-260923-pq2 는 KRX 라벨 하나). */}
          {exchangeChoices.length === 1 ? null : (
            <ToggleGroup
              type="single"
              value={exchange}
              onValueChange={(v) => {
                if (v === "KRX" || v === "NXT") onExchangeChange(v);
              }}
              aria-label="거래소"
              title={EXCHANGE_SEGMENT_TITLE}
              data-slot="card-exchange-segment"
              className="h-5 gap-0 overflow-hidden rounded-full border border-transparent bg-[var(--muted)]"
            >
              {exchangeChoices.map((ex) => (
                <ToggleGroupItem
                  key={ex}
                  value={ex}
                  className="h-5 min-w-0 rounded-full! bg-transparent px-1.5 text-[10px] font-bold tracking-[0.02em] text-[var(--muted-fg)] data-[state=on]:bg-[var(--pill-on-bg)] data-[state=on]:text-[var(--pill-on-fg)]"
                >
                  {ex}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          )}
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

      {/* ✕ — 종목명 줄 맨 오른쪽. 760 미만은 DOM 순서대로 l1 바로 뒤, 760 이상은 LED 뒤(order-last). */}
      <button
        type="button"
        title="카드 제거"
        aria-label={`${name} 카드 닫기`}
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="inline-flex h-[26px] flex-none items-center rounded-[var(--r)] px-2 text-[11px] font-semibold text-[var(--muted-fg)] hover:bg-[var(--muted)] @min-[760px]/lc:order-last"
      >
        ✕
      </button>

      <div
        data-slot="card-header-l2"
        className="order-last flex min-w-0 basis-full flex-wrap items-center gap-2.5 @min-[760px]/lc:order-none @min-[760px]/lc:flex-none @min-[760px]/lc:basis-auto"
      >
        {/*
          LED 3칩 — 순서는 **매수 · 매도 · 취소**(Phase 17 D-22). 판정은 `LatchLed` 안의
          `latchLedStateOf` 규칙표 **한 곳**이다(T-18-28) — 여기서 톤·라벨을 다시 짓지 않는다.
          ★ `onArm` 의 전송 가드(클릭 가능 여부 재확인)는 호출부(`strategy-card`)의 것이다.
        */}
        {open ? (
          <span onClick={stop} className="flex flex-wrap gap-1.5">
            {LED_KINDS.map((kind) => (
              <LatchLed key={kind} kind={kind} server={ledServer} onArm={onArm} />
            ))}
          </span>
        ) : (
          <>
            {/*
              접힘 — LED 는 점 3개(목업 ①A `.dots`). 순서·판정·전파 차단은 칩과 같다. 요약 칩은
              컨트롤이 아니다 — 누르면 헤더 토글(펼침)이 되는 것이 맞아 전파를 막지 않는다.
            */}
            <span
              onClick={stop}
              data-slot="latch-led-dots"
              className="inline-flex h-6 flex-none items-center gap-0.5 rounded-full border border-transparent bg-[var(--muted)] px-0.5"
            >
              {LED_KINDS.map((kind) => (
                <LatchLed key={kind} kind={kind} server={ledServer} onArm={onArm} variant="dot" />
              ))}
            </span>
            {unfilledCount > 0 && (
              <span
                data-slot="card-summary-unfilled"
                className="inline-flex h-[22px] flex-none items-center gap-1 rounded-full border border-[color-mix(in_oklch,var(--primary)_40%,transparent)] bg-[var(--accent)] px-2 text-[11px] font-semibold whitespace-nowrap text-[var(--accent-fg)]"
              >
                미체결 <span className="mono">{KRW.format(unfilledCount)}</span>
              </span>
            )}
            {holdingQty !== null && holdingQty > 0 && (
              <span
                data-slot="card-summary-holding"
                className="inline-flex h-[22px] flex-none items-center gap-1 rounded-full border border-transparent bg-[var(--muted)] px-2 text-[11px] font-semibold whitespace-nowrap text-[var(--fg)]"
              >
                잔고 <span className="mono">{KRW.format(holdingQty)}주</span>
              </span>
            )}
          </>
        )}
      </div>
    </header>
  );
}
