"use client";

/**
 * StrategyStatusCard — My page 「전략 현황」 카드 (16-UI-SPEC C2·C3·C4 · D-09/D-14/D-20).
 *
 * ① 무엇을 어디에
 *   `/me` 의 시각 1차 앵커다. 상따 전략 행 목록(`.srow`, min-height 44px) + VI 행 +
 *   카드 하단의 **전체 비활성화**로 이루어진다. 시각 정본은 사용자 승인 목업
 *   `16-mypage-sidebar-mockup.html` 이다(D-24).
 *
 * ② ★ 사이드바와 달리 **상태를 전부 보여준다** — 단, 거래소는 배지가 아니다 (C2 · 260911-w5h)
 *   사이드바 3단은 240px 폭이라 종목명 + 태그 + 배지 2개가 종목명을 3~4글자로 잘라먹어
 *   원 아이콘 2개로 단순화했다(N3a). 이 화면은 **상태 요약의 정본**이므로 반대로 전부 편다.
 *   두 표면이 같은 배지 정의(`strategy-badge.tsx`)를 쓰기 때문에 「어느 화면에서는 다른
 *   상태로 보인다」가 생기지 않는다.
 *   ★ 배치는 **2줄**이다: r1 = 종목명 + **상태 배지** + 화살표 · r2 = `{코드} · {거래소} ·
 *     {계좌번호}`(muted 텍스트). 거래소를 **배지에서 텍스트로 내린** 이유는 행 높이다 —
 *     r1 의 칩 개수가 상태에 따라 1~3개로 바뀌면 행 높이가 목록 안에서 들쭉날쭉해진다.
 *     거래소는 상태가 아니라 **식별자**라 다른 식별자(코드·계좌번호)와 같은 줄이 맞다.
 *     `exchangeBadgeOf` 정의는 `strategy-badge.tsx` 에 **그대로 있다**(다른 소비처와 자기
 *     단위 테스트가 쓴다) — 이 파일의 import 만 사라졌다.
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
 * ⑦ ★ 킬 스위치는 **세션이 `ready` 일 때만** 눌린다 (gap 3 / T-16-20)
 *   리듀서는 단절 시 `isStale` 만 세우고 `limitChasers` 를 유지한다 — 재접속 중에도 목록이
 *   남아 있으니 가드가 없으면 버튼이 활성인 채 0바이트가 나간다. 게다가 `send` 가 `false` 를
 *   돌려준 경우에는 `awaitingAck` 를 **세우지 않는다**: 세우면 8초 동안 버튼이 잠긴 채 아무
 *   일도 일어나지 않고 그 사이 사용자는 「껐다」고 믿는다. 전송 실패(「보내지 못했어요」)와
 *   ack 미수신(「반영을 확인하지 못했어요」)은 **다른 문구**다 — 전자는 0바이트가 확실하고
 *   후자는 결과를 모른다(Pitfall 9 / T-16-21). 조용히 버튼만 다시 여는 것은 PC-7 위반이다.
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
import { useIsinLabels, type IsinLabel } from "@/lib/isin-labels";
import { useRelayContext } from "@/lib/relay-provider";
import type { RelayStatus } from "@/lib/use-relay-socket";
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
        "hover:bg-[color-mix(in_oklch,var(--muted)_60%,transparent)]",
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
      {/*
        r2 — 식별자 줄. `{코드} · {거래소} · {계좌번호}`.
        계좌번호는 **마스킹하지 않는다**(D2 · S-5) — 앞자리가 같은 두 계좌를 구분할 수
        없게 되는 쪽이 더 위험하다.
      */}
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
        <span aria-hidden="true" className="opacity-60">
          ·
        </span>
        <span data-slot="strategy-row-account" className="mono">
          {item.accountNo}
        </span>
      </div>
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

/**
 * 전략 스냅샷을 **한 번이라도 받았는가**.
 *
 * relay 는 인증 직후 `lc.snap` 을 **비어 있어도 1프레임** 보낸다(16-07). 그래서
 * `ready` 를 본 적이 있다면 「목록이 비었다」는 확정 정보다. 그 전에는 아직 묻지도
 * 않은 상태라 「등록된 상따 전략이 없어요」가 거짓말이 된다.
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
}

export function StrategyStatusCard({ className }: StrategyStatusCardProps) {
  const { status, limitChasers, viTrigger, accounts, strategiesDisabled, send } =
    useRelayContext();
  const labels = useIsinLabels();
  const snapshotSeen = useSnapshotSeen(status);

  const [dialogOpen, setDialogOpen] = useState(false);
  /** 14 를 보내고 65 를 기다리는 중. 버튼을 잠근다(중복 송신 방지). */
  const [awaitingAck, setAwaitingAck] = useState(false);
  /** 송신 시점의 65 참조. **이것과 달라지는 순간**이 새 완료 신호다. */
  const ackBaseline = useRef<RelayStrategiesDisabledMsg | null>(null);
  /**
   * 전송 실패·ack 미수신 문구. 빈 문자열이면 아무것도 그리지 않는다.
   *
   * ★ 두 사건은 **다른 문구**를 쓴다 (Pitfall 9 동형).
   *   「보내지 못했다」 = 0바이트가 확실하다 → 다시 눌러도 안전하다.
   *   「반영을 확인하지 못했다」 = 결과를 모른다 → 실제로 꺼졌을 수 있다.
   */
  const [sendError, setSendError] = useState("");

  const viRunning = viTrigger?.run === true;
  const chaserCount = limitChasers.length;
  /** 전략 0 + VI 중지 → 끌 것이 없다. 반드시 아무 일도 못 하는 버튼은 열어 두지 않는다. */
  const nothingToDisable = chaserCount === 0 && !viRunning;

  // 65 수신 → 버튼을 다시 연다. **목록 상태는 건드리지 않는다**(파일 상단 ④).
  useEffect(() => {
    if (!awaitingAck) return;
    if (strategiesDisabled !== ackBaseline.current) {
      setAwaitingAck(false);
      // 65 가 왔다 — 직전의 「확인하지 못했어요」는 더 이상 사실이 아니다.
      setSendError("");
    }
  }, [awaitingAck, strategiesDisabled]);

  // 65 유실 백스톱. 다시 눌러도 같은 일이 한 번 더 나갈 뿐이라 안전하다.
  useEffect(() => {
    if (!awaitingAck) return;
    const timer = setTimeout(() => {
      setAwaitingAck(false);
      /*
        ★ 「실패했다」고 말하지 않는다. 65 가 유실됐을 뿐 전략은 실제로 꺼졌을 수 있다 —
          결과를 모르는 것과 실패를 뭉개면 사용자가 사실과 다른 상태를 믿는다(T-16-21).
          조용히 버튼만 다시 여는 것도 무로그 fail-safe 다(PC-7).
      */
      setSendError("전체 비활성화 요청의 반영을 확인하지 못했어요. 전략 목록을 확인해 주세요.");
    }, DISABLE_ACK_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [awaitingAck]);

  const handleConfirm = (): void => {
    setDialogOpen(false);
    /*
      ★ `key` 를 **싣지 않는다** — 생략이 곧 「그 세션의 상따 전부 + VI」다.
        단건 비활성화 UI 는 만들지 않는다(D-09, 파일 상단 ⑤).
    */
    if (!send({ t: "strategies.disable" })) {
      /*
        ★ 보내지 **않았음**이 확실하다 — `awaitingAck` 를 세우지 않는다(T-16-20).
          세우면 8초 동안 버튼이 잠긴 채 아무 일도 일어나지 않고, 그동안 사용자는
          「껐다」고 믿는다. 자동매매는 그 사이 계속 돈다.
      */
      setSendError(
        "연결이 끊겨 비활성화 요청을 보내지 못했어요. 연결이 복구된 뒤 다시 눌러 주세요.",
      );
      return;
    }
    ackBaseline.current = strategiesDisabled;
    setAwaitingAck(true);
    setSendError("");
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

      {chaserCount === 0 && !snapshotSeen ? (
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
      ) : chaserCount === 0 ? (
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
        {/*
          ★ 세션이 `ready` 가 아니면 누를 수 없다. 리듀서는 단절 시 `isStale` 만 세우고
            `limitChasers` 를 유지하므로 재접속 중에도 목록이 남아 있다 — 가드가 없으면
            버튼이 활성인 채 0바이트가 나간다(gap 3 / T-16-20).
        */}
        <Button
          type="button"
          variant="outline"
          disabled={nothingToDisable || awaitingAck || status !== "ready"}
          onClick={() => setDialogOpen(true)}
          className="border-[var(--destructive)] bg-transparent text-[var(--destructive)] hover:bg-[color-mix(in_oklch,var(--destructive)_10%,transparent)] disabled:opacity-[.45]"
        >
          전체 비활성화
        </Button>
        {sendError === "" ? null : (
          /* 눌렀는데 못 나갔거나 반영을 확인하지 못했다 — 화면이 그 사실을 말한다. */
          <p
            data-slot="strategy-disable-error"
            role="alert"
            className="m-0 w-full text-[11px] text-[var(--destructive)]"
          >
            {sendError}
          </p>
        )}
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
