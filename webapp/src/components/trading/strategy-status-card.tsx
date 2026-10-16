"use client";

/**
 * StrategyStatusCard — My page 「전략 현황」 카드 (16-UI-SPEC C2·C3·C4 · D-09/D-14/D-20).
 *
 * ① 무엇을 어디에
 *   `/me` 의 시각 1차 앵커다. 상따 전략 행 목록(`.srow`, min-height 44px) + VI 행으로 이루어진다.
 *   시각 정본은 사용자 승인 목업 `16-mypage-sidebar-mockup.html` 이다(D-24).
 *   ★ 고른 계좌만 그린다(Phase 32 D-21 · S5′) — /me 탭 위 계좌 칩이 고른 계좌를 `accountNo` prop 으로 받는다
 *     (카드는 스스로 계좌를 고르지 않는다). 그 계좌의 켜진 전략 · 그 계좌가 등록 계좌인 VI 만 보이고, 둘 다 없으면
 *     점선 한 줄 「이 계좌에 등록된 전략 없음」 이다. `accountNo` 가 없으면(계좌 목록 미수신) 종전처럼 전 계좌다.
 *
 * ② ★ 사이드바와 달리 **켜진 전략의 상태를 전부 보여준다** — 단, 거래소는 배지가 아니다 (C2 · 260911-w5h)
 *   사이드바 3단은 240px 폭이라 종목명 + 태그 + 배지 2개가 종목명을 3~4글자로 잘라먹어
 *   원 아이콘 2개로 단순화했다(N3a). 이 화면은 **상태 요약의 정본**이므로 반대로 전부 편다.
 *   두 표면이 같은 배지 정의(`strategy-badge.tsx`)를 쓰기 때문에 「어느 화면에서는 다른
 *   상태로 보인다」가 생기지 않는다.
 *   ★ 배치는 **2줄**이다: r1 = 종목명 + **상태 배지** + 화살표 · r2 = `{코드} · {거래소}`(muted 텍스트 —
 *     계좌는 /me 계좌 칩이 말한다 · Phase 32 D-21). 거래소를 **배지에서 텍스트로 내린** 이유는 행 높이다 —
 *     r1 의 칩 개수가 상태에 따라 1~3개로 바뀌면 행 높이가 목록 안에서 들쭉날쭉해진다.
 *     거래소는 상태가 아니라 **식별자**라 다른 식별자(코드)와 같은 줄이 맞다.
 *     `exchangeBadgeOf` 정의는 `strategy-badge.tsx` 에 **그대로 있다**(다른 소비처와 자기
 *     단위 테스트가 쓴다) — 이 파일의 import 만 사라졌다.
 *
 * ③ ★ 「이 계좌 끄기」 — 고른 계좌 단위 끄기만 둔다 (Phase 32 D-09 보정 · D-21 · D-27)
 *   카드 맨 아래 kill 줄 한 줄이다. 모든 계좌를 한꺼번에 끄는 버튼 · 링크 · 다이얼로그는 /me 에 없다(D-27 · 사용자
 *   2026-10-16). 확인하면 `send({ t: "strategies.disable.account", accountNo })` 1건 — relay 가 그 계좌 소유 세션으로
 *   켜진 키마다 14 를 건별로 보내고 65 를 모아 `strategies.disabled` 1건을 준다(서버 와이어는 세션 단위라 계좌 필터는
 *   relay 몫). 새 메시지 타입이라 구 relay 는 4400 으로 끊고 아무것도 끄지 않는다(Pitfall 2).
 *   확인 다이얼로그의 기본 포커스는 **닫기**다(Enter 연타로 꺼지면 안 된다). 실행 버튼은 테두리형이다 — `--destructive` 와
 *   `--up`(매수)이 같은 색이라 채움 빨강은 매수 버튼과 구분되지 않는다(S-6).
 *   65(`strategies.disabled`)는 **완료 신호로만** 쓴다 — 목록은 60/61 에코가 이미 고쳐 둔다(T-16-07).
 *   ★ 대기 잠금은 **계좌별**이다(S5′ 「끄기 응답 대기 잠금」): 보낸 순서대로의 계좌 목록을 두고 `strategies.disabled` 새 참조마다
 *     그 프레임의 계좌(`accountNo` · WR-01)를 푼다 — 계좌 없는 프레임(구 relay)만 맨 앞 하나(relay 가 계좌 끄기 1건당 1프레임으로
 *     접어 준다 · 소켓 훅 in-flight 창과 같은 짝). 계좌 칩 줄은 잠그지
 *     않는다 — A 를 끈 대기 중에 B 로 바꾸면 B 버튼은 누를 수 있다. 8초 백스톱(소켓 훅과 같은 상수)이 먼저 오면 그 항목을 빼고
 *     「반영을 확인하지 못했어요」 를 그 계좌 오류로 말한다(실패라고 말하지 않는다 — 결과를 모른다 · T-16-21). `send` 가 false 면
 *     0바이트가 확실하므로 잠그지 않고 「보내지 못했어요」 를 말한다(T-16-20). 오류 줄은 kill 줄 바로 위 `role="alert"` 한 줄이다.
 *   ★ 세션이 `ready` 가 아니면 누를 수 없다 — 단절 중에도 목록은 남아 있어 가드가 없으면 0바이트가 나간다(gap 3 / T-16-20).
 *
 * ⑧ 「현황 | 로그」 전환 (Phase 21 D-25a · G-21-R3-2 · 스케치 008 ① B 채택)
 *   앱은 /trading 하단 공용 패널(전략 로그 탭 포함)을 숨기므로 전 종목 전략 흐름을 여기서 본다.
 *   머리 오른쪽 알약 세그먼트(트랙 `--muted` · 선택 면 `--seg-on-*` · 버튼 26 높이 · 12/600 · 좌우 12)가
 *   **같은 카드 본문**을 현황 ↔ 로그로 바꾼다 — 기본 = 현황 · 카드가 하나라 /me 세로 순서(D-20)와 계좌 카드
 *   위치가 그대로다. 그래서 「상따 N · VI …」 요약은 머리 줄에서 현황 본문 첫 줄로 내려왔다(목업 B).
 *   로그 본문은 `useStrategyLogFeed()`(앱 전역 공급자 · 서버가 말한 것만 · 메모리 전용) 를 작업대 공용 패널과
 *   같은 `StrategyLog variant="embed"` 문법(11px · 시각 tnum · 종목명 600 · 거부 빨강)으로 그린다.
 *   목업은 로그 높이 상한을 적지 않았다 — 200 줄 상한이 카드를 끝없이 늘리지 않게 본문 안에서 스크롤한다
 *   (`LOG_MAX_H`). 선택은 기억하지 않는다(재방문 = 현황 · 기본값 규율).
 *
 * ⑥ 「발주됨」 배지는 이 화면에서 뜨지 않는다 — **모르는 것을 지어내지 않기 때문이다**
 *   `strategyBadgesOf` 의 `hadOrder` 는 「그 전략의 매수 발주가 나갔다」는 사실이다.
 *   주문 통보(`RelayOrderMsg`)에는 ISIN 이 없어 어느 전략의 주문인지 귀속시킬 수 없고,
 *   미체결 목록의 매수 주문은 수동 주문일 수도 있다. 근거 없이 「발주됨」을 쓰면
 *   한 번도 발주된 적 없는 전략에 그 배지가 붙는다.
 *
 * ⑨ ★ **켜진 전략만** 나열한다 — 사이드바·작업대와 같은 `isActiveStrategy` 한 함수 (quick-260928-no0)
 *   기준은 매수주문 스위치 ∨ 매도주문 스위치 ∨ 취소잔량이다(`lib/limit-chaser.ts`). 사이드바 3단
 *   (`sidebarChasers`)과 작업대(`pruneInactiveCards`)가 같은 함수를 쓴다. 기준이 둘이 되면 「사이드바엔
 *   없는데 여기엔 있다」가 생긴다. 서버(gh-trade)의 IsActive() 도 매수무장 ∨ 매도무장 ∨ 취소무장으로 같은 뜻이다.
 *   거르는 이유: 사용자가 세 스위치를 모두 OFF 로 제출하면 서버가 삭제(crud "D")로 정규화한다. 그러나 서버가
 *   스스로 접는 경우는 등록을 유지하고 게이트만 내린다 — 발주로 게이트 소진, 후매수 재무장 대기, 킬 스위치
 *   (DisableStrategiesReq), 15:40 정규장 마감 정리, 장 마감 정리가 그렇고, 이때 60 에코는 crud "C" + 스위치 OFF
 *   로 온다. relay 64 스냅샷/60 에코는 gh-trade C# 클라도 같은 바이트를 받는 「등록 전수」 계약이라 서버가
 *   빼 주지 않는다. 거르지 않으면 꺼진 전략이 카드에 쌓인다.
 *   등록 여부의 정본은 여전히 `limitChasers` 전수다. 가져오는 곳(리듀서·컨텍스트)은 바꾸지 않고 이 카드
 *   렌더링에서만 거른다.
 *   행 목록, 「상따 N」 요약, 빈 상태가 모두 거른 목록을 따른다. 빈 상태 문구가 「켜진」인 이유는
 *   등록 ≠ 켜짐이기 때문이다. 스냅샷 전 로딩 판정도 거른 수로 같은 뜻이다(스냅샷 전에는 어차피 0).
 */

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { RelayLimitChaser, RelayStrategiesDisabledMsg } from "@gh-radar/shared";

import { limitChaserHref } from "@/components/layout/app-sidebar";
import {
  StrategyBadge,
  strategyBadgesOf,
  viBadgeOf,
} from "@/components/trading/strategy-badge";
import { StrategyLog } from "@/components/trading/strategy-log";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { accountFullLabelOf } from "@/lib/account-label";
import { useIsinLabels, type IsinLabel } from "@/lib/isin-labels";
import { isActiveStrategy } from "@/lib/limit-chaser";
import { useRelayContext } from "@/lib/relay-provider";
import { useStrategyLogFeed } from "@/lib/strategy-log-feed";
import {
  STRATEGIES_DISABLE_ACK_TIMEOUT_MS,
  viAccountRunning,
  viSlotsOfAccount,
  VI_EXCHANGES,
  type RelayStatus,
  type RelayViAccountSlots,
} from "@/lib/use-relay-socket";
import { cn } from "@/lib/utils";

const KRW = new Intl.NumberFormat("ko-KR");

/** kill 줄 안내(S5′ · D-27). */
const KILL_HINT = "이 계좌의 상따 전략과 VI 자동매수를 한 번에 끕니다. 이미 나간 주문은 취소되지 않아요.";
/** 8초 백스톱 — 결과를 모른다(실패가 아니다). */
const DISABLE_UNCONFIRMED_TEXT = "이 계좌 끄기 요청의 반영을 확인하지 못했어요. 전략 목록을 확인해 주세요.";
/** 전송 실패 — 0바이트가 확실하다(다시 눌러도 안전하다). */
const DISABLE_SEND_FAILED_TEXT = "연결이 끊겨 비활성화 요청을 보내지 못했어요. 연결이 복구된 뒤 다시 눌러 주세요.";

// ---------------------------------------------------------------------------
// VI 요약
// ---------------------------------------------------------------------------

/**
 * VI 행 요약 — **가동 중인 거래소마다** `{거래소} {금액}만원 · {상승률}% 이상` (17-06 / D-06).
 * 가동 중인 거래소가 없으면 `—` 다 — 꺼진 전략의 조건을 현재 상태처럼 읽히게 두지 않는다.
 *
 * ★ 거래소를 붙이는 이유: 배지는 두 거래소의 **합집합**인데(D-18) 요약이 한쪽 값만 말하면
 *   NXT 만 가동 중일 때 화면이 KRX 숫자를 보여 준다 — 그 숫자로 주문이 나가지 않는다.
 *
 * `orderAmountKrw` 는 **원 단위**이고 화면 단위는 만원이다. 만원으로 나누어떨어지지 않는
 * 값을 반올림하면 없는 금액을 말하게 되므로 소수 한 자리를 살린다.
 * `checkRate` 는 **정수 %** 다(`sweepMinRate` 의 BasisPoints 와 단위가 다르다 — Pitfall 5).
 */
export function viSummaryText(triggers: RelayViAccountSlots): string {
  const parts: string[] = [];
  for (const exchange of VI_EXCHANGES) {
    const cfg = triggers[exchange];
    if (cfg == null || cfg.run !== true) continue;
    const man = cfg.orderAmountKrw / 10_000;
    const amount = Number.isInteger(man) ? KRW.format(man) : man.toFixed(1);
    parts.push(`${exchange} ${amount}만원 · ${cfg.checkRate.toFixed(1)}% 이상`);
  }
  return parts.length === 0 ? "—" : parts.join(" / ");
}

// ---------------------------------------------------------------------------
// 행
// ---------------------------------------------------------------------------

function StrategyRow({
  item,
  label,
}: {
  item: RelayLimitChaser;
  label: IsinLabel | undefined;
}) {
  const badges = strategyBadgesOf(item);
  const name = label?.name ?? item.isin;
  /*
    코드 칸: 단축코드를 알면 그것을, 모르면 ISIN 을 보여준다. 단 **이름도 모르는 행**은
    이름 칸이 이미 ISIN 이므로 같은 값을 두 번 쓰지 않는다.
  */
  const code = label?.code ?? (label?.name !== undefined ? item.isin : null);
  const badgeText = badges.map((b) => b.label).join(" · ");

  /*
    ★ **2줄 행**이다 (260911-w5h). r1 에서 거래소 배지를 빼면서 그 줄의 칩 개수가 **상태
      배지 개수와 정확히 같아졌다** — 행 높이가 배지 개수와 무관하게 일정해진다. 옛 구조는
      한 줄에 6항목(이름·코드·거래소 배지·계좌·상태 배지들·화살표)을 `flex-wrap` 으로
      흘려 보내 전략마다 1줄/2줄이 갈렸고, 그것이 이 목록을 훑기 어렵게 만든 원인이었다.
    ★ 잔고·미체결 카드 행과 **같은 문법**이다: 이름 왼쪽 굵게 / 오른쪽에 핵심(여기서는
      상태 배지) / 둘째 줄부터 muted 보조.
  */
  return (
    <Link
      href={limitChaserHref(item.key)}
      data-slot="strategy-row"
      data-strategy-key={item.key}
      /*
        UI-SPEC §접근성 라벨 — 「{종목명} {거래소} 전략 — {상태 배지 텍스트}」.
        배지가 하나도 없는 전략(취소 게이트만 켜진 경우)에는 `—` 뒤를 비우지 않는다.
        ★ 거래소가 화면에서 배지 → 텍스트로 내려갔지만 이 계약은 **그대로**다.
      */
      aria-label={`${name} ${item.exchange} 전략${badgeText === "" ? "" : ` — ${badgeText}`}`}
      className={cn(
        "flex min-h-11 min-w-0 flex-col justify-center gap-0.5 rounded-[var(--r)] px-2 py-2",
        "hover:bg-[color-mix(in_oklab,var(--muted)_60%,transparent)]",
      )}
    >
      {/*
        r1 — `<div>` 다. `me.spec` 이 `row.locator('span').first()` 로 종목명을 짚으므로
        줄 컨테이너가 `span` 이면 그 로케이터가 줄 전체를 잡는다.
      */}
      <div
        data-slot="strategy-row-status"
        className="flex min-w-0 items-center gap-2"
      >
        {/* 신축 항목은 종목명 **하나뿐**이다 — 나머지가 줄어들면 배지가 잘린다. */}
        <span className="min-w-0 flex-1 truncate text-[length:var(--t-sm)] font-semibold text-[var(--fg)]">
          {name}
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-1">
          {badges.map((badge) => (
            <StrategyBadge key={badge.kind} badge={badge} />
          ))}
        </span>
        <span aria-hidden="true" className="shrink-0 text-[12px] text-[var(--muted-fg)]">
          ›
        </span>
      </div>
      {/* r2 — `{코드} · {거래소}` — 계좌는 /me 계좌 칩이 말한다(Phase 32 D-21). */}
      <div
        data-slot="strategy-row-meta"
        className="flex min-w-0 items-center gap-1 truncate text-[11px] text-[var(--muted-fg)]"
      >
        {code !== null && (
          <>
            <span className="mono">{code}</span>
            <span aria-hidden="true" className="opacity-60">
              ·
            </span>
          </>
        )}
        <span>{item.exchange}</span>
      </div>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// 「이 계좌 끄기」 확인 다이얼로그 (계좌 모드만 · D-27)
// ---------------------------------------------------------------------------

interface DisableAccountSummary {
  chaserCount: number;
  viRunning: boolean;
  /** 계좌 줄 — 전체 라벨 「{번호} · {상품명} · {서버키}」(D-12). */
  accountLabel: string;
}

/**
 * 부제 — 그 계좌 건수 · 그 계좌 VI 기준. 버튼은 **둘 중 하나만 살아 있어도** 열리므로(전략 0 + VI 가동 / 전략 N + VI 중지)
 * 꺼지지 않는 것을 꺼진다고 말하지 않게 셋으로 가른다.
 */
function disableSubtitle({ chaserCount, viRunning }: DisableAccountSummary): string {
  if (chaserCount > 0 && viRunning) {
    return `상따 ${chaserCount}건과 VI 자동매수가 한 번에 꺼져요.`;
  }
  if (chaserCount > 0) return `상따 ${chaserCount}건이 한 번에 꺼져요.`;
  return "VI 자동매수가 꺼져요.";
}

function DisableAccountDialog({
  open,
  summary,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  summary: DisableAccountSummary;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  /** 기본 포커스 대상. 실행 버튼에 포커스가 가면 Enter 한 번에 그 계좌가 꺼진다. */
  const dismissRef = useRef<HTMLButtonElement>(null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-sm"
        data-testid="strategy-disable-account-dialog"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          dismissRef.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>이 계좌의 전략을 비활성화할까요?</DialogTitle>
          <DialogDescription>{disableSubtitle(summary)}</DialogDescription>
        </DialogHeader>

        <dl className="flex flex-col gap-1.5 rounded-[var(--r-md)] border border-[var(--border)] px-3 py-2.5 text-[length:var(--t-caption)]">
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-[var(--muted-fg)]">상따 전략</dt>
            <dd className="mono font-semibold text-[var(--fg)]">
              {summary.chaserCount === 0 ? "없음" : `${summary.chaserCount}건 → 전부 OFF`}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-[var(--muted-fg)]">VI 자동매수</dt>
            <dd className="mono font-semibold text-[var(--fg)]">
              {summary.viRunning ? "가동 → 중지" : "중지 (변화 없음)"}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="shrink-0 text-[var(--muted-fg)]">계좌</dt>
            <dd className="mono min-w-0 text-right font-semibold break-all text-[var(--fg)]">
              {summary.accountLabel}
            </dd>
          </div>
        </dl>

        {/* 되돌릴 수 없는 사실 — 이미 나간 주문은 이 버튼으로 취소되지 않는다. */}
        <p className="rounded-[var(--r-md)] border border-[var(--destructive)] px-2.5 py-2 text-[length:var(--t-caption)] text-[var(--destructive)]">
          이미 접수된 주문은 취소되지 않아요. 미체결은 아래 표에서 개별 취소해 주세요.
        </p>

        <DialogFooter>
          {/* 기본 포커스 대상 — 실행 버튼보다 **앞**에 둔다(탭 순서·오클릭 방어). */}
          <Button type="button" variant="outline" autoFocus ref={dismissRef} onClick={() => onOpenChange(false)}>
            닫기
          </Button>
          {/* 채움 금지 — `--destructive` 는 `--up`(매수)과 같은 색이다(S-6). */}
          <Button
            type="button"
            variant="outline"
            onClick={onConfirm}
            className="border-[var(--destructive)] bg-transparent text-[var(--destructive)] hover:bg-[color-mix(in_oklab,var(--destructive)_10%,transparent)]"
          >
            이 계좌 끄기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// 카드
// ---------------------------------------------------------------------------

/**
 * 전략 스냅샷을 **한 번이라도 받았는가**.
 *
 * relay 는 인증 직후 `lc.snap` 을 **비어 있어도 1프레임** 보낸다(16-07). 그래서
 * `ready` 를 본 적이 있다면 「목록이 비었다」는 확정 정보다. 그 전에는 아직 묻지도
 * 않은 상태라 「켜진 상따 전략이 없어요」가 거짓말이 된다.
 *
 * 재접속(`reconnecting`) 중에도 래치를 내리지 않는다 — 연결 훅이 목록을 지우지 않고
 * `isStale` 만 세우는 규율과 짝이다(사이드바 `everReady` 와 같은 판단).
 */
function useSnapshotSeen(status: RelayStatus): boolean {
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    if (status === "ready") setSeen(true);
  }, [status]);
  return status === "ready" || seen;
}

export interface StrategyStatusCardProps {
  className?: string;
  /** /me 계좌 칩이 고른 계좌(Phase 32 D-21). undefined = 계좌를 아직 모른다 → 전 계좌(종전). */
  accountNo?: string;
}

type StatusView = "status" | "log";

/**
 * 「현황 | 로그」 알약 세그먼트 버튼(파일 상단 ⑧ · 스케치 008 ① B 수치) — 26 높이 · 좌우 12 · 12/600 ·
 * 비선택 `--muted-fg` · 선택 `--seg-on-*`. `TabsTrigger` 기본(`flex-1` · `rounded-md` · 14px)을 덮는다.
 */
const SEG_TRIGGER =
  "h-[26px] flex-none rounded-full px-3 py-0 text-[12px] font-semibold text-[var(--muted-fg)] " +
  "data-[state=active]:bg-[var(--seg-on-bg)] data-[state=active]:text-[var(--seg-on-fg)] data-[state=active]:shadow-[var(--seg-on-shadow)] " +
  "dark:data-[state=active]:border-transparent";

/** 로그 본문 높이 상한 — 11px × 1.7 줄로 약 16줄. 목업에 값이 없어 정한 값이다(파일 상단 ⑧). */
const LOG_MAX_H = "max-h-[320px]";

export function StrategyStatusCard({ className, accountNo }: StrategyStatusCardProps) {
  const { status, limitChasers, viSlots, accounts, strategiesDisabled, send } = useRelayContext();
  const labels = useIsinLabels();
  const snapshotSeen = useSnapshotSeen(status);
  const logEntries = useStrategyLogFeed();
  /** 기본 = 현황(D-25a). 기억하지 않는다 — 다시 오면 현황이다. */
  const [view, setView] = useState<StatusView>("status");
  const [dialogOpen, setDialogOpen] = useState(false);
  /**
   * 끄기를 보내고 `strategies.disabled` 를 기다리는 계좌 — **보낸 순서대로**(파일 상단 ③). 그 계좌 버튼만 잠근다.
   * 렌더용 상태와 같은 값을 ref 에도 둔다 — 완료 신호 · 백스톱 콜백이 최신 목록을 읽는다.
   */
  const [pending, setPending] = useState<readonly string[]>([]);
  const pendingRef = useRef<readonly string[]>([]);
  /** 대기 계좌 → 8초 백스톱 타이머. */
  const backstops = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  /** 계좌 → 오류 문구(전송 실패 · 반영 미확인). 고른 계좌 것만 그린다. */
  const [errors, setErrors] = useState<Readonly<Record<string, string>>>({});
  /** 마지막으로 본 65 참조. **이것과 달라지는 순간**이 새 완료 신호다. */
  const seenAck = useRef<RelayStrategiesDisabledMsg | null>(strategiesDisabled);

  // 켜진 전략만(파일 상단 ⑨) — 사이드바 `sidebarChasers` · 작업대 `pruneInactiveCards` 와 같은 한 함수.
  // 등록 정본(`limitChasers` 전수)은 건드리지 않는다.
  const activeChasers = limitChasers.filter(isActiveStrategy);
  /** 고른 계좌의 켜진 전략(Phase 32 D-21) — 다른 계좌 전략은 그리지 않는다. undefined = 전 계좌. */
  const shownChasers =
    accountNo === undefined ? activeChasers : activeChasers.filter((c) => c.accountNo === accountNo);
  const shownCount = shownChasers.length;
  /** 표시 축의 VI — 고른 계좌의 거래소별 슬롯(Phase 32 D-18 · ④ 뒤). undefined = 전 계좌 슬롯(계좌 목록 미수신). */
  const viShown = viSlotsOfAccount(viSlots, accountNo);
  // 가동 판정은 `viAccountRunning` 한 함수다 — 상태줄(MeStatusBar)과 같은 답.
  const viShownRunning = viAccountRunning(viSlots, accountNo);
  /**
   * 그 계좌에 **등록된** VI 슬롯이 있나 — ④ 뒤 VI 행은 늘 서므로 빈 상태 판정은 「VI 행 없음」 이 아니라 이것이다(32-13 Flagged
   * assumptions · S5′ · S12 empty). 미등록(`null`) · 모름(키 부재)은 등록이 아니다.
   */
  const viRegistered = VI_EXCHANGES.some((ex) => viShown[ex] != null);

  /** 그 계좌에 켜진 전략 0 ∧ 그 계좌 VI 미가동 → 끌 것이 없다(relay 도 0바이트로 거부한다). */
  const nothingToDisable = shownCount === 0 && !viShownRunning;

  /** 그 계좌의 오류 문구를 정한다(빈 문자열 = 지움). 같으면 같은 참조. */
  const setErrorOf = (account: string, error: string): void => {
    setErrors((prev) => {
      if ((prev[account] ?? "") === error) return prev;
      const next = { ...prev };
      if (error === "") delete next[account];
      else next[account] = error;
      return next;
    });
  };

  /** 그 계좌를 대기에서 뺀다 — 백스톱 타이머를 지우고 오류 문구를 정한다(빈 문자열 = 지움). */
  const release = (account: string, error: string): void => {
    const timer = backstops.current.get(account);
    if (timer !== undefined) clearTimeout(timer);
    backstops.current.delete(account);
    pendingRef.current = pendingRef.current.filter((a) => a !== account);
    setPending(pendingRef.current);
    setErrorOf(account, error);
  };

  // `strategies.disabled` 새 참조 → 그 계좌의 대기를 푼다. **목록 상태는 건드리지 않는다**(파일 상단 ③ — 완료 신호로만).
  // 계좌를 실은 프레임(WR-01)은 그 계좌만 — 대기에 없으면(다른 탭이 끈 계좌) 아무것도 풀지 않는다. 계좌 없는 프레임(구 relay ·
  // 전부 정지)만 종전대로 보낸 순서 맨 앞을 푼다.
  useEffect(() => {
    if (strategiesDisabled === seenAck.current) return;
    seenAck.current = strategiesDisabled;
    const target = strategiesDisabled?.accountNo ?? pendingRef.current[0];
    if (target !== undefined && pendingRef.current.includes(target)) release(target, "");
    // release 는 매 렌더 새 함수지만 ref · setState 만 만진다 — 완료 신호 참조만 의존한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strategiesDisabled]);

  // 언마운트 — 남은 백스톱 타이머를 버린다.
  useEffect(() => {
    const timers = backstops.current;
    return () => {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    };
  }, []);

  const handleConfirm = (): void => {
    setDialogOpen(false);
    if (accountNo === undefined) return;
    const account = accountNo;
    if (!send({ t: "strategies.disable.account", accountNo: account })) {
      // 보내지 **않았음**이 확실하다 — 잠그지 않는다(잠그면 8초 동안 아무 일도 없이 「껐다」 고 믿게 된다 · T-16-20).
      setErrorOf(account, DISABLE_SEND_FAILED_TEXT);
      return;
    }
    setErrorOf(account, "");
    pendingRef.current = [...pendingRef.current, account];
    setPending(pendingRef.current);
    backstops.current.set(
      account,
      setTimeout(() => {
        // 65 유실 백스톱 — 「실패」 가 아니라 「확인하지 못했다」 다. 상한은 소켓 훅과 같은 상수(「65 유실」 판정 시각 일치).
        backstops.current.delete(account);
        release(account, DISABLE_UNCONFIRMED_TEXT);
      }, STRATEGIES_DISABLE_ACK_TIMEOUT_MS),
    );
  };

  /** 고른 계좌가 대기 중인가 · 그 계좌 오류 문구 · 다이얼로그 계좌 줄. */
  const shownPending = accountNo !== undefined && pending.includes(accountNo);
  const shownError = accountNo === undefined ? "" : (errors[accountNo] ?? "");
  const shownAccount = accounts.find((a) => a.accountNo === accountNo);
  const accountLabel =
    accountNo === undefined
      ? ""
      : accountFullLabelOf({ accountNo, name: shownAccount?.name, serverKey: shownAccount?.serverKey });

  return (
    <section
      data-slot="strategy-status-card"
      className={cn(
        "rounded-[var(--r-lg)] border border-transparent bg-[var(--card)] p-3",
        className,
      )}
    >
      <Tabs value={view} onValueChange={(v) => setView(v as StatusView)} className="gap-0">
      <div className="mb-2.5 flex flex-wrap items-center gap-2">
        <h2 className="m-0 text-[length:var(--t-sm)] font-semibold text-[var(--fg)]">전략 현황</h2>
        <TabsList
          aria-label="전략 현황 보기"
          className="ml-auto h-auto gap-0.5 rounded-full bg-[var(--muted)] p-0.5"
        >
          <TabsTrigger value="status" className={SEG_TRIGGER}>
            현황
          </TabsTrigger>
          <TabsTrigger value="log" className={SEG_TRIGGER}>
            로그
          </TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="status" className="min-w-0">
      {/* 목업 B — 요약은 머리 줄이 아니라 현황 본문 첫 줄(12px muted · 행 문법과 같은 들여쓰기 8). */}
      <p
        data-slot="strategy-status-summary"
        className="mono m-0 mb-1 -mt-1 px-2 text-[12px] text-[var(--muted-fg)]"
      >
        상따 {shownCount} · VI {viShownRunning ? "가동" : "중지"}
      </p>

      {shownCount === 0 && !snapshotSeen ? (
        /* 스냅샷 수신 전 — 「없음」이 아니라 「아직 모름」이다 (C2 로딩 · 3행 스켈레톤). */
        <div
          data-slot="strategy-list-loading"
          aria-busy="true"
          className="flex flex-col gap-1"
        >
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              aria-hidden="true"
              className="h-11 animate-pulse rounded-[var(--r)] bg-[var(--muted)] motion-reduce:animate-none"
            />
          ))}
          <p className="pt-1 text-[length:var(--t-caption)] text-[var(--muted-fg)]">
            전략 정보를 불러오는 중이에요…
          </p>
        </div>
      ) : shownCount === 0 && accountNo !== undefined ? (
        /* 고른 계좌에 전략 0 ∧ 등록 VI 슬롯 없음 → 점선 한 줄 + 아래 VI 행 「중지」(S5′ · S12 empty). 등록 슬롯이 있으면 VI 행만. */
        viRegistered ? null : (
          <p
            data-slot="strategy-account-empty"
            className="m-0 mt-1 rounded-[var(--r)] border border-dashed border-[var(--faint)] p-3 text-center text-[12px] text-[var(--muted-fg)]"
          >
            이 계좌에 등록된 전략 없음
          </p>
        )
      ) : shownCount === 0 ? (
        <div className="flex flex-col items-center gap-1 rounded-[var(--r-md)] border border-dashed border-[var(--faint)] px-[var(--s-4)] py-[var(--s-5)] text-center">
          <p className="text-[length:var(--t-sm)] font-semibold text-[var(--fg)]">
            켜진 상따 전략이 없어요
          </p>
          <p className="text-[length:var(--t-caption)] text-[var(--muted-fg)]">
            트레이딩 › 상따에서 매수·매도·취소 스위치를 켜면 여기에 표시돼요.
          </p>
        </div>
      ) : (
        <div
          data-slot="strategy-row-list"
          className="flex flex-col divide-y divide-[var(--border-subtle)]"
        >
          {shownChasers.map((item) => (
            <StrategyRow key={item.key} item={item} label={labels.get(item.isin)} />
          ))}
        </div>
      )}

      {/*
        VI 행 (C3) — 한 줄이고 ④ 뒤에는 **늘 선다**(Phase 32 D-18 · S5 「VI 행(④ 뒤)」). 요약은 고른 계좌의 거래소별 슬롯이고,
        등록 슬롯이 없으면 「중지」 · 「—」 다(S12 empty).
      */}
      <Link
        href="/trading"
        data-slot="vi-status-row"
        className={cn(
          "mt-1 flex min-h-11 flex-wrap items-center gap-2 rounded-[var(--r)] border-t border-[var(--border-subtle)] px-2 py-2.5",
          "hover:bg-[color-mix(in_oklab,var(--muted)_60%,transparent)]",
        )}
      >
        <span className="text-[length:var(--t-sm)] font-semibold text-[var(--fg)]">
          VI 자동매수
        </span>
        <StrategyBadge badge={viBadgeOf(viShownRunning)} className="shrink-0" />
        <span data-slot="vi-status-summary" className="mono text-[11px] text-[var(--muted-fg)]">
          {viSummaryText(viShown)}
        </span>
        <span aria-hidden="true" className="ml-auto shrink-0 text-[12px] text-[var(--muted-fg)]">
          ›
        </span>
      </Link>

      {/* 끄기 오류(전송 실패 · 반영 미확인) — kill 줄 바로 위 한 줄(S5′). 고른 계좌 것만. */}
      {accountNo !== undefined && shownError !== "" && (
        <p
          data-slot="strategy-disable-account-error"
          role="alert"
          className="m-0 mt-3 text-[11px] text-[var(--destructive)]"
        >
          {shownError}
        </p>
      )}

      {/*
        「이 계좌 끄기」 (S5′ · D-27) — 고른 계좌가 있을 때만 · 카드 맨 아래 한 줄. 모든 계좌를 끄는 컨트롤은 없다.
        `--destructive` 면(목업 ⑥ `.btn.danger` — 옅은 빨강 면 · 빨강 글자) · 32 높이 · 좌우 12 · 12/600.
      */}
      {accountNo !== undefined && (
        <div
          data-slot="strategy-disable-account"
          data-pending={shownPending ? "true" : undefined}
          className="mt-3 flex flex-wrap items-center gap-2.5 border-t border-[var(--border-subtle)] pt-3"
        >
          <span className="min-w-[160px] flex-1 text-[11px] text-[var(--muted-fg)]">{KILL_HINT}</span>
          <Button
            type="button"
            aria-label={`이 계좌 끄기 — ${accountNo}`}
            disabled={nothingToDisable || shownPending || status !== "ready"}
            onClick={() => setDialogOpen(true)}
            className="ml-auto h-8 rounded-[var(--r-sm)] bg-[var(--up-bg)] px-3 text-[12px] font-semibold text-[var(--destructive)] hover:bg-[color-mix(in_oklab,var(--destructive)_18%,transparent)] disabled:opacity-[.45]"
          >
            이 계좌 끄기
          </Button>
        </div>
      )}
      </TabsContent>

      <TabsContent value="log" className="min-w-0">
        {/*
          전 종목 전략 로그(D-25a) — 작업대 공용 패널과 같은 embed 문법. embed 목록의 좌우 패딩(s-3)이
          카드 패딩(12)과 겹치지 않게 좌우를 되돌린다 — 목업처럼 시각 열이 카드 본문 왼쪽 끝에 선다.
        */}
        <div
          data-slot="me-strategy-log"
          className={cn("-mx-3 overflow-y-auto", LOG_MAX_H)}
        >
          <StrategyLog entries={logEntries} variant="embed" />
        </div>
      </TabsContent>
      </Tabs>

      {accountNo !== undefined && (
        <DisableAccountDialog
          open={dialogOpen}
          summary={{ chaserCount: shownCount, viRunning: viShownRunning, accountLabel }}
          onOpenChange={setDialogOpen}
          onConfirm={handleConfirm}
        />
      )}
    </section>
  );
}
