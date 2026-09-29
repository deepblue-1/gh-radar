"use client";

/**
 * OrderTimeline — 오늘 주문 행 펼침 본문 (Phase 25 · D-01 ~ D-03 · UI-SPEC ① · 결정 8).
 *
 * ① 조회는 **마운트 1회**다
 *   `fetchOrderEvents(members[0].id, 구성원 주문번호)` = `GET /api/orders/:id/events` = RPC 1회. 행을 닫으면
 *   이 컴포넌트가 언마운트되어 이어붙임 · 재조회도 멈춘다(열면 다시 1회). React StrictMode 의 개발 이중 마운트는
 *   진행 중 요청을 재사용한다(요청이 두 번 나가지 않게).
 *
 * ② 상태 (결정 8 · 한 줄 · 스켈레톤 없음)
 *   처음 조회 중 「불러오는 중…」 + `aria-busy` · 실패 `role=status` + 「다시 시도」(조회 1회) · 0건 한 줄. 이미 줄이
 *   있으면 재조회 중 로딩 줄을 다시 띄우지 않고, 재조회 실패는 기존 줄을 두고 아래에 실패 한 줄.
 *
 * ③ 라이브 (D-03 · Pitfall 10)
 *   - 전략 이벤트 = relay 스토어 `strategyEvents` 중 같은 계좌 · 거래일 · 구성원 주문번호를 **순서 규칙대로 끼워
 *     넣는다**(`buildTimeline` 이 `compareTimelineAsc` 로 자리를 잡는다 — 끝에 붙이지 않는다). 재조회 0.
 *   - 통보 조각은 이벤트 푸시가 없다 — 구성원 행 `lastSeq` 가 오르면(`membersSeqSignature`) **trailing 400ms
 *     디바운스 재조회 1회**, 진행 중 요청이 있으면 「한 번 더」 플래그 하나로 접는다. 폴링 · 주기 타이머 없음
 *     (Cloud Run 왕복 비용 · T-25-34).
 *   - 새로 끼워진 줄에 강조를 주지 않는다(타임라인은 이력이다 — R10).
 *
 * ④ 문장은 여기서 만들지 않는다 — 통보 줄은 `journalTimelineLine`(템플릿 v0), 상따 줄은 shared
 *   `timelineStrategyText`(D-09) 결과를 `buildTimeline` 이 넘긴 그대로 배치만 한다.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { OrderTimelineRow } from "@gh-radar/shared";

import type { MergedOrderNotice } from "@/lib/order-notices";
import {
  buildTimeline,
  liveStrategyRows,
  memberOrderNos,
  membersSeqSignature,
  TIMELINE_REFETCH_DEBOUNCE_MS,
  type TimelineLine,
} from "@/lib/order-timeline";
import { fetchOrderEvents } from "@/lib/orders-api";
import { useRelayContext } from "@/lib/relay-provider";
import { cn } from "@/lib/utils";

const SOURCE_BADGE: Readonly<Record<TimelineLine["source"], string>> = {
  journal: "통보",
  strategy: "상따",
};

export interface OrderTimelineProps {
  notice: MergedOrderNotice;
  /** 묶인 행(`count > 1`) — 줄 끝 `#주문번호` 꼬리(채택 2-A). */
  bundled: boolean;
  /** 모바일 카드 행 — 시각 78px · 줄 flex-wrap. */
  mobile: boolean;
}

export function OrderTimeline({ notice, bundled, mobile }: OrderTimelineProps) {
  const { strategyEvents, journalRows } = useRelayContext();
  const { members } = notice;
  const anchor = members[0] ?? notice.head;

  /** `null` = 아직 한 번도 응답을 못 받음. */
  const [fetched, setFetched] = useState<OrderTimelineRow[] | null>(null);
  const [failed, setFailed] = useState(false);

  // 조회 입력의 최신값 — 재조회는 그때의 구성원(묶음에 조각이 더 붙었을 수 있다)으로 부른다.
  const orderNos = useMemo(() => memberOrderNos(members), [members]);
  const inputRef = useRef({ anchorId: anchor.id, orderNos });
  useEffect(() => {
    inputRef.current = { anchorId: anchor.id, orderNos };
  }, [anchor.id, orderNos]);

  const aliveRef = useRef(true);
  const inFlightRef = useRef(false);
  const againRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** 조회 1회 — 진행 중이면 「한 번 더」 하나로 접는다(in-flight 접기 · R19). */
  const run = useCallback(function run(): void {
    if (inFlightRef.current) {
      againRef.current = true;
      return;
    }
    inFlightRef.current = true;
    setFailed(false);
    const { anchorId, orderNos: nos } = inputRef.current;
    fetchOrderEvents(anchorId, nos)
      .then(
        (rows) => {
          if (!aliveRef.current) return;
          setFetched(rows);
          setFailed(false);
        },
        () => {
          // 어떤 실패든 이 본문 안에서 수렴한다 — 카드 · 다른 행은 그대로(카드 머리 ④ 와 같은 규율).
          if (aliveRef.current) setFailed(true);
        },
      )
      .finally(() => {
        inFlightRef.current = false;
        if (aliveRef.current && againRef.current) {
          againRef.current = false;
          run();
        }
      });
  }, []);

  // ① 마운트 조회 — StrictMode 재마운트는 진행 중 요청을 재사용한다.
  useEffect(() => {
    aliveRef.current = true;
    if (!inFlightRef.current) run();
    return () => {
      aliveRef.current = false;
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = null;
    };
  }, [run]);

  // ③ 구성원 lastSeq 상승 → trailing 400ms 디바운스 재조회 1회.
  const signature = membersSeqSignature(members, journalRows);
  const prevSignatureRef = useRef(signature);
  useEffect(() => {
    if (prevSignatureRef.current === signature) return;
    prevSignatureRef.current = signature;
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      run();
    }, TIMELINE_REFETCH_DEBOUNCE_MS);
  }, [signature, run]);

  const lines = useMemo(() => {
    if (fetched === null) return [];
    const live = liveStrategyRows(strategyEvents, members, anchor.accountNo, anchor.tradeDate);
    return buildTimeline([...fetched, ...live], members, { bundled });
  }, [fetched, strategyEvents, members, anchor.accountNo, anchor.tradeDate, bundled]);

  const loading = fetched === null && !failed;

  return (
    <div data-slot="order-timeline-body" aria-busy={loading ? true : undefined}>
      {loading && (
        <div
          data-slot="order-timeline-loading"
          className="pb-0.5 pl-0.5 pt-1 text-[11px] text-[var(--faint)]"
        >
          불러오는 중…
        </div>
      )}
      {lines.length > 0 && (
        <ol
          data-slot="order-timeline"
          className="m-0 flex list-none flex-col gap-[3px] border-l-2 border-[var(--border-subtle)] py-0 pl-3 pr-0"
        >
          {lines.map((line) => (
            <TimelineItem key={line.key} line={line} mobile={mobile} />
          ))}
        </ol>
      )}
      {fetched !== null && lines.length === 0 && !failed && (
        <div
          data-slot="order-timeline-empty"
          className="pb-0.5 pl-0.5 pt-1 text-[11px] text-[var(--faint)]"
        >
          전략 이벤트 없음 — 수동 주문이거나 상따 기록 전 주문
        </div>
      )}
      {failed && (
        <div
          data-slot="order-timeline-error"
          role="status"
          className="pb-0.5 pl-0.5 pt-1 text-[11px] text-[var(--muted-fg)]"
        >
          이벤트를 불러오지 못했어요
          <button
            type="button"
            onClick={run}
            className="ml-1.5 cursor-pointer border-0 bg-transparent p-0 font-semibold text-[var(--accent-fg)] hover:underline"
          >
            다시 시도
          </button>
        </div>
      )}
    </div>
  );
}

/** 줄 1개 — 시각 · 출처 배지 · 행위(600) + 문장 · 묶음 꼬리 (UI-SPEC 타임라인 해부 · 목업 `.tl li`). */
function TimelineItem({ line, mobile }: { line: TimelineLine; mobile: boolean }) {
  const journal = line.source === "journal";
  return (
    <li
      data-slot="order-timeline-item"
      data-source={line.source}
      className={cn(
        "relative flex items-baseline gap-2 text-[11px] leading-[1.5] text-[var(--muted-fg)]",
        // 앞 점 6×6 — 세로선(ol border-left 2px) 위에 걸친다.
        "before:absolute before:left-[-16px] before:top-[7px] before:size-1.5 before:rounded-full before:content-['']",
        journal ? "before:bg-[var(--faint)]" : "before:bg-[var(--primary)]",
        mobile && "flex-wrap",
      )}
    >
      <span
        data-slot="order-timeline-time"
        className={cn("mono flex-none text-[var(--muted-fg)]", mobile ? "w-[78px]" : "w-[82px]")}
      >
        {line.time}
      </span>
      <span
        className={cn(
          "w-8 flex-none rounded-[4px] text-center text-[10px] leading-[15px]",
          journal
            ? "bg-[var(--muted)] text-[var(--muted-fg)]"
            : "bg-[var(--accent)] text-[var(--accent-fg)]",
        )}
      >
        {SOURCE_BADGE[line.source]}
      </span>
      <span className="min-w-0 text-[var(--fg)]">
        <span className="font-semibold">{line.action}</span>
        {line.text !== "" && <span className="text-[var(--muted-fg)]"> {line.text}</span>}
        {line.cumTail !== null && <span className="text-[var(--muted-fg)]"> {line.cumTail}</span>}
      </span>
      {line.orderNo !== null && (
        <span className="mono flex-none text-[10px] text-[var(--faint)]">#{line.orderNo}</span>
      )}
    </li>
  );
}
