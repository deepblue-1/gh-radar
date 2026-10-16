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
 * ③ 끄기 — Phase 32 D-27 — /me 현황의 끄기는 고른 계좌 단위(32-06).
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
import { useEffect, useState } from "react";
import type { RelayLimitChaser } from "@gh-radar/shared";

import { limitChaserHref } from "@/components/layout/app-sidebar";
import {
  StrategyBadge,
  strategyBadgesOf,
  viBadgeOf,
} from "@/components/trading/strategy-badge";
import { StrategyLog } from "@/components/trading/strategy-log";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useIsinLabels, type IsinLabel } from "@/lib/isin-labels";
import { isActiveStrategy } from "@/lib/limit-chaser";
import { useRelayContext } from "@/lib/relay-provider";
import { useStrategyLogFeed } from "@/lib/strategy-log-feed";
import {
  viAnyRunning,
  VI_EXCHANGES,
  type RelayStatus,
  type RelayViTriggers,
} from "@/lib/use-relay-socket";
import { cn } from "@/lib/utils";

const KRW = new Intl.NumberFormat("ko-KR");

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
export function viSummaryText(triggers: RelayViTriggers): string {
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

/**
 * 그 계좌가 **등록 계좌**인 거래소만 남긴 VI 부분 맵(표시 필터 — Phase 32 D-21).
 * 웨이브 ④ 전 VI 는 거래소별 1건(D-16) — 그 계좌가 등록 계좌인 거래소만 그 계좌 것이다. ④ 에서 계좌 슬롯 조회로 바뀐다.
 * `viTriggers` 모양 · relay VI 캐시는 건드리지 않는다(새 객체를 돌려준다).
 */
export function viTriggersOfAccount(triggers: RelayViTriggers, accountNo: string): RelayViTriggers {
  const out: RelayViTriggers = {};
  for (const exchange of VI_EXCHANGES) {
    const cfg = triggers[exchange];
    if (cfg != null && cfg.accountNo === accountNo) out[exchange] = cfg;
  }
  return out;
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
  const { status, limitChasers, viTriggers } = useRelayContext();
  const labels = useIsinLabels();
  const snapshotSeen = useSnapshotSeen(status);
  const logEntries = useStrategyLogFeed();
  /** 기본 = 현황(D-25a). 기억하지 않는다 — 다시 오면 현황이다. */
  const [view, setView] = useState<StatusView>("status");

  // 켜진 전략만(파일 상단 ⑨) — 사이드바 `sidebarChasers` · 작업대 `pruneInactiveCards` 와 같은 한 함수.
  // 등록 정본(`limitChasers` 전수)은 건드리지 않는다.
  const activeChasers = limitChasers.filter(isActiveStrategy);
  /** 고른 계좌의 켜진 전략(Phase 32 D-21) — 다른 계좌 전략은 그리지 않는다. undefined = 전 계좌. */
  const shownChasers =
    accountNo === undefined ? activeChasers : activeChasers.filter((c) => c.accountNo === accountNo);
  const shownCount = shownChasers.length;
  /** 표시 축의 VI — 고른 계좌가 등록 계좌인 거래소만(웨이브 ④ 전 · 표시 필터). undefined = 전 거래소(종전). */
  const viShown = accountNo === undefined ? viTriggers : viTriggersOfAccount(viTriggers, accountNo);
  // 합집합 판정은 `viAnyRunning` 한 함수다 (17-06 / D-18) — 사이드바·My page 와 같은 답.
  const viShownRunning = viAnyRunning(viShown);
  /** VI 행 — 전 계좌면 언제나(종전) · 고른 계좌면 그 계좌가 등록 계좌인 거래소가 하나라도 있을 때만. */
  const showViRow = accountNo === undefined || VI_EXCHANGES.some((ex) => viShown[ex] != null);

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
        /* 고른 계좌에 전략 0 — VI 행도 없을 때만 점선 한 줄(S5′). VI 행이 있으면 그 행만 선다. */
        showViRow ? null : (
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

      {/* VI 행 (C3) — 한 줄이다. 고른 계좌면 그 계좌가 등록 계좌인 거래소만(Phase 32 D-21). */}
      {showViRow && (
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
    </section>
  );
}
