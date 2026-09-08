"use client";

/**
 * StrategyStatusCard — My page 「전략 현황」 카드 (16-UI-SPEC C2·C3·C4 · D-09/D-14/D-20).
 *
 * ① 무엇을 어디에
 *   `/me` 의 시각 1차 앵커다. 상따 전략 행 목록(`.srow`, min-height 44px) + VI 행 +
 *   카드 하단의 **전체 비활성화**로 이루어진다. 시각 정본은 사용자 승인 목업
 *   `16-mypage-sidebar-mockup.html` 이다(D-24).
 *
 * ② ★ 사이드바와 달리 **거래소 태그·상태 배지를 전부 보여준다** (C2)
 *   사이드바 3단은 240px 폭이라 종목명 + 태그 + 배지 2개가 종목명을 3~4글자로 잘라먹어
 *   원 아이콘 2개로 단순화했다(N3a). 이 화면은 폭이 넉넉하고 **상태 요약의 정본**이므로
 *   반대로 전부 편다. 두 표면이 같은 배지 정의(`strategy-badge.tsx`)를 쓰기 때문에
 *   「어느 화면에서는 다른 상태로 보인다」가 생기지 않는다.
 *
 * ③ ★ 전체 비활성화는 **이 화면에만** 둔다 (D-09 · UI-SPEC §오조작 방지 4)
 *   상따·VI 편집 화면에 두면 값을 고치는 중에 바로 옆에서 전부 끄는 오클릭 경로가 생긴다.
 *   버튼은 **테두리형**이다 — `--destructive` 와 `--up`(매수)의 oklch 값이 완전히 같아
 *   채움 빨강으로 만들면 매수 버튼과 구분되지 않는다(UI-SPEC §토큰 충돌 경보, S-6).
 *   확인 다이얼로그의 기본 포커스는 **닫기**다(Enter 연타로 전부 꺼지면 안 된다).
 *
 * ④ ★ 65(`strategies.disabled`)는 **완료 신호로만** 쓴다 (T-16-07 · RESEARCH §D)
 *   서버는 키별 60/61 에코를 먼저 보낸 뒤 집계 65 를 보낸다. 즉 65 를 받은 시점에는 이미
 *   목록이 에코로 갱신돼 있다. 여기 담긴 숫자로 행 상태를 만들면 에코와 두 벌이 갈리고
 *   65 가 유실되면 화면이 되살아난다. 그래서 65 는 **버튼을 다시 여는 데만** 쓴다.
 *   유실 대비로 백스톱 타이머를 함께 둔다 — 65 하나를 놓쳤다고 버튼이 영원히 죽으면
 *   「늦어질 뿐」(T-16-07 accept)이 아니라 기능 상실이다.
 *
 * ⑤ ★ 단건 비활성화 UI 는 만들지 않는다 (D-09)
 *   `strategies.disable` 은 `key` 를 실으면 그 한 건만 내리지만, UI 는 스위치 OFF 로
 *   갈음한다. 같은 일을 하는 경로가 둘이면 「스위치는 껐는데 왜 아직 켜져 있나」류의
 *   상태 불일치가 생긴다.
 *
 * ⑥ 「발주됨」 배지는 이 화면에서 뜨지 않는다 — **모르는 것을 지어내지 않기 때문이다**
 *   `strategyBadgesOf` 의 `hadOrder` 는 「그 전략의 매수 발주가 나갔다」는 사실이다.
 *   주문 통보(`RelayOrderMsg`)에는 ISIN 이 없어 어느 전략의 주문인지 귀속시킬 수 없고,
 *   미체결 목록의 매수 주문은 수동 주문일 수도 있다. 근거 없이 「발주됨」을 쓰면
 *   한 번도 발주된 적 없는 전략에 그 배지가 붙는다.
 */

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { RelayLimitChaser, RelayStrategiesDisabledMsg } from "@gh-radar/shared";

import { limitChaserHref } from "@/components/layout/app-sidebar";
import {
  StrategyBadge,
  exchangeBadgeOf,
  strategyBadgesOf,
  viBadgeOf,
} from "@/components/trading/strategy-badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useRelayContext } from "@/lib/relay-provider";
import { cn } from "@/lib/utils";

const KRW = new Intl.NumberFormat("ko-KR");

/**
 * 65 를 기다리는 상한(ms). 넘기면 버튼을 다시 연다.
 *
 * 서버가 60/61 에코를 **먼저** 보내므로 이 시점의 목록은 이미 정확하다 — 다시 눌러도
 * 같은 일(전부 끄기)이 한 번 더 나갈 뿐이라 위험하지 않다. 영원히 잠그는 쪽이 나쁘다.
 */
const DISABLE_ACK_TIMEOUT_MS = 8_000;

// ---------------------------------------------------------------------------
// ISIN → 표시 이름·단축코드
// ---------------------------------------------------------------------------

interface IsinLabel {
  name?: string;
  code?: string;
}

/**
 * ISIN → 종목명·단축코드를 **이미 받은 프레임에서만** 만든다.
 *
 * `RelayLimitChaser` 에는 종목명도 단축코드도 없다(게이트웨이가 싣지 않는다). relay 는
 * 잔고·미체결·VI 주문에만 `stocks.isin` 역매핑으로 이름/코드를 채워 준다. `app-sidebar`
 * 의 `useIsinNames()` 와 같은 규약이고, 이름 하나 때문에 별도 조회 경로를 만들지 않는다
 * (T-16-02: 목록의 원천은 전역 wss 스냅샷뿐이어야 한다).
 *
 * ⚠️ 계좌가 여럿이면 `accountStates` 전부를 훑는다. 마지막 계좌만 보면 다른 계좌의
 *    전략이 이름 없이 ISIN 으로 남는다.
 */
function useIsinLabels(): ReadonlyMap<string, IsinLabel> {
  const { accountStates, viOrders } = useRelayContext();

  const out = new Map<string, IsinLabel>();
  const put = (isin: string, next: IsinLabel): void => {
    const prev = out.get(isin) ?? {};
    out.set(isin, {
      name: next.name !== undefined && next.name !== "" ? next.name : prev.name,
      code: next.code !== undefined && next.code !== "" ? next.code : prev.code,
    });
  };

  for (const state of accountStates.values()) {
    for (const row of state.hold) put(row.isin, { name: row.name, code: row.code });
    for (const row of state.unf) put(row.isin, { name: row.name, code: row.code });
  }
  for (const row of viOrders) put(row.isin, { name: row.name });

  return out;
}

// ---------------------------------------------------------------------------
// VI 요약
// ---------------------------------------------------------------------------

/**
 * VI 행 요약 `{금액}만원 · {상승률}% 이상`. **가동 중이 아니면 `—`** 다 —
 * 꺼진 전략의 조건을 현재 상태처럼 읽히게 두지 않는다.
 *
 * `orderAmountKrw` 는 **원 단위**이고 화면 단위는 만원이다. 만원으로 나누어떨어지지 않는
 * 값을 반올림하면 없는 금액을 말하게 되므로 소수 한 자리를 살린다.
 * `checkRate` 는 **정수 %** 다(`sweepMinRate` 의 BasisPoints 와 단위가 다르다 — Pitfall 5).
 */
export function viSummaryText(
  cfg: { orderAmountKrw: number; checkRate: number } | null | undefined,
  run: boolean,
): string {
  if (!run || cfg == null) return "—";
  const man = cfg.orderAmountKrw / 10_000;
  const amount = Number.isInteger(man) ? KRW.format(man) : man.toFixed(1);
  return `${amount}만원 · ${cfg.checkRate.toFixed(1)}% 이상`;
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

  return (
    <Link
      href={limitChaserHref(item.key)}
      data-slot="strategy-row"
      data-strategy-key={item.key}
      /*
        UI-SPEC §접근성 라벨 — 「{종목명} {거래소} 전략 — {상태 배지 텍스트}」.
        배지가 하나도 없는 전략(취소 게이트만 켜진 경우)에는 `—` 뒤를 비우지 않는다.
      */
      aria-label={`${name} ${item.exchange} 전략${badgeText === "" ? "" : ` — ${badgeText}`}`}
      className={cn(
        "flex min-h-11 flex-wrap items-center gap-2 rounded-[var(--r)] px-2 py-2.5",
        "hover:bg-[color-mix(in_oklch,var(--muted)_60%,transparent)]",
      )}
    >
      {/* 신축 항목은 종목명 **하나뿐**이다 — 나머지가 줄어들면 숫자가 잘린다. */}
      <span className="min-w-0 flex-1 truncate text-[length:var(--t-sm)] font-semibold text-[var(--fg)]">
        {name}
      </span>
      {code !== null && (
        <span className="mono shrink-0 text-[11px] text-[var(--muted-fg)]">{code}</span>
      )}
      <StrategyBadge badge={exchangeBadgeOf(item.exchange)} className="shrink-0" />
      {/*
        계좌번호는 **마스킹하지 않는다**(D2 · S-5). 모바일에서는 둘째 줄 전폭으로 내려
        (order 9) 첫 줄이 종목명을 잘라먹지 않게 한다(C2).
      */}
      <span
        data-slot="strategy-row-account"
        className="mono shrink-0 text-[11px] text-[var(--muted-fg)] max-[1279px]:order-9 max-[1279px]:w-full"
      >
        {item.accountNo}
      </span>
      <span className="ml-auto flex shrink-0 items-center gap-1">
        {badges.map((badge) => (
          <StrategyBadge key={badge.kind} badge={badge} />
        ))}
      </span>
      <span aria-hidden="true" className="shrink-0 text-[12px] text-[var(--muted-fg)]">
        ›
      </span>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// 확인 다이얼로그
// ---------------------------------------------------------------------------

interface DisableSummary {
  chaserCount: number;
  viRunning: boolean;
  accountNos: string[];
}

/**
 * 부제. UI-SPEC 원문은 「상따 {N}건과 VI 자동매수가 한 번에 꺼져요.」 하나뿐이지만,
 * 버튼은 **둘 중 하나만 살아 있어도** 열린다(전략 0 + VI 가동 / 전략 N + VI 중지).
 * 그 상태에서 원문을 그대로 쓰면 **꺼지지 않는 것을 꺼진다고 말하게 된다**.
 */
function disableSubtitle({ chaserCount, viRunning }: DisableSummary): string {
  if (chaserCount > 0 && viRunning) {
    return `상따 ${chaserCount}건과 VI 자동매수가 한 번에 꺼져요.`;
  }
  if (chaserCount > 0) return `상따 ${chaserCount}건이 한 번에 꺼져요.`;
  return "VI 자동매수가 꺼져요.";
}

function DisableAllDialog({
  open,
  summary,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  summary: DisableSummary;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  /** 기본 포커스 대상. 실행 버튼에 포커스가 가면 Enter 한 번에 전부 꺼진다. */
  const dismissRef = useRef<HTMLButtonElement>(null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-sm"
        data-testid="strategy-disable-dialog"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          dismissRef.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>전략을 전부 비활성화할까요?</DialogTitle>
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
            {/* 계좌번호 전체 표시(D2). 여러 계좌는 `·` 로 잇는다. */}
            <dd className="mono min-w-0 text-right font-semibold break-all text-[var(--fg)]">
              {summary.accountNos.length === 0 ? "—" : summary.accountNos.join(" · ")}
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
            className="border-[var(--destructive)] bg-transparent text-[var(--destructive)] hover:bg-[color-mix(in_oklch,var(--destructive)_10%,transparent)]"
          >
            전체 비활성화
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// 카드
// ---------------------------------------------------------------------------

export interface StrategyStatusCardProps {
  className?: string;
}

export function StrategyStatusCard({ className }: StrategyStatusCardProps) {
  const { limitChasers, viTrigger, accounts, strategiesDisabled, send } = useRelayContext();
  const labels = useIsinLabels();

  const [dialogOpen, setDialogOpen] = useState(false);
  /** 14 를 보내고 65 를 기다리는 중. 버튼을 잠근다(중복 송신 방지). */
  const [awaitingAck, setAwaitingAck] = useState(false);
  /** 송신 시점의 65 참조. **이것과 달라지는 순간**이 새 완료 신호다. */
  const ackBaseline = useRef<RelayStrategiesDisabledMsg | null>(null);

  const viRunning = viTrigger?.run === true;
  const chaserCount = limitChasers.length;
  /** 전략 0 + VI 중지 → 끌 것이 없다. 반드시 아무 일도 못 하는 버튼은 열어 두지 않는다. */
  const nothingToDisable = chaserCount === 0 && !viRunning;

  // 65 수신 → 버튼을 다시 연다. **목록 상태는 건드리지 않는다**(파일 상단 ④).
  useEffect(() => {
    if (!awaitingAck) return;
    if (strategiesDisabled !== ackBaseline.current) setAwaitingAck(false);
  }, [awaitingAck, strategiesDisabled]);

  // 65 유실 백스톱. 다시 눌러도 같은 일이 한 번 더 나갈 뿐이라 안전하다.
  useEffect(() => {
    if (!awaitingAck) return;
    const timer = setTimeout(() => setAwaitingAck(false), DISABLE_ACK_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [awaitingAck]);

  const handleConfirm = (): void => {
    ackBaseline.current = strategiesDisabled;
    setAwaitingAck(true);
    setDialogOpen(false);
    /*
      ★ `key` 를 **싣지 않는다** — 생략이 곧 「그 세션의 상따 전부 + VI」다.
        단건 비활성화 UI 는 만들지 않는다(D-09, 파일 상단 ⑤).
    */
    send({ t: "strategies.disable" });
  };

  return (
    <section
      data-slot="strategy-status-card"
      className={cn(
        "rounded-[var(--r-lg)] border border-[var(--border)] bg-[var(--card)] p-3",
        className,
      )}
    >
      <h2 className="m-0 mb-2.5 flex flex-wrap items-center gap-2 text-[length:var(--t-sm)] font-semibold text-[var(--fg)]">
        전략 현황
        <span className="mono ml-auto text-[length:var(--t-caption)] font-normal text-[var(--muted-fg)]">
          상따 {chaserCount} · VI {viRunning ? "가동" : "중지"}
        </span>
      </h2>

      {chaserCount === 0 ? (
        <div className="flex flex-col items-center gap-1 rounded-[var(--r-md)] border border-dashed border-[var(--border)] px-[var(--s-4)] py-[var(--s-5)] text-center">
          <p className="text-[length:var(--t-sm)] font-semibold text-[var(--fg)]">
            등록된 상따 전략이 없어요
          </p>
          <p className="text-[length:var(--t-caption)] text-[var(--muted-fg)]">
            트레이딩 › 상따에서 종목을 고르면 여기에 표시돼요.
          </p>
        </div>
      ) : (
        <div
          data-slot="strategy-row-list"
          className="flex flex-col divide-y divide-[var(--border-subtle)]"
        >
          {limitChasers.map((item) => (
            <StrategyRow key={item.key} item={item} label={labels.get(item.isin)} />
          ))}
        </div>
      )}

      {/* VI 행 (C3) — 계좌당 1건이라 목록이 아니라 한 줄이다. */}
      <Link
        href="/trading/vi"
        data-slot="vi-status-row"
        className={cn(
          "mt-1 flex min-h-11 flex-wrap items-center gap-2 rounded-[var(--r)] border-t border-[var(--border)] px-2 py-2.5",
          "hover:bg-[color-mix(in_oklch,var(--muted)_60%,transparent)]",
        )}
      >
        <span className="text-[length:var(--t-sm)] font-semibold text-[var(--fg)]">
          VI 자동매수
        </span>
        <StrategyBadge badge={viBadgeOf(viRunning)} className="shrink-0" />
        <span data-slot="vi-status-summary" className="mono text-[11px] text-[var(--muted-fg)]">
          {viSummaryText(viTrigger, viRunning)}
        </span>
        <span aria-hidden="true" className="ml-auto shrink-0 text-[12px] text-[var(--muted-fg)]">
          ›
        </span>
      </Link>

      {/* 전체 비활성화 (C4) — 카드 안에서 유일한 `--destructive` 면이다. */}
      <div
        data-slot="strategy-disable-all"
        className="mt-3 flex flex-wrap items-center gap-2.5 border-t border-[var(--border)] pt-3"
      >
        <span className="min-w-[160px] flex-1 text-[11px] text-[var(--muted-fg)]">
          모든 상따 전략과 VI 자동매수를 한 번에 끕니다. 이미 나간 주문은 취소되지 않아요.
        </span>
        <Button
          type="button"
          variant="outline"
          disabled={nothingToDisable || awaitingAck}
          onClick={() => setDialogOpen(true)}
          className="border-[var(--destructive)] bg-transparent text-[var(--destructive)] hover:bg-[color-mix(in_oklch,var(--destructive)_10%,transparent)] disabled:opacity-[.45]"
        >
          전체 비활성화
        </Button>
      </div>

      <DisableAllDialog
        open={dialogOpen}
        summary={{
          chaserCount,
          viRunning,
          accountNos: accounts.map((a) => a.accountNo),
        }}
        onOpenChange={setDialogOpen}
        onConfirm={handleConfirm}
      />
    </section>
  );
}
