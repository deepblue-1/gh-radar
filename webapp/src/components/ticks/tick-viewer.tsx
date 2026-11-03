'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

import { fmtTickTime, type TickOpenResponse } from '@gh-radar/shared';

import { buildMsgRows, ownLineRec, type MsgRowsModel } from '@/lib/ticks/msg-rows';
import { buildOwnModel, type OwnModel, type OwnOrderView, type OwnSel } from '@/lib/ticks/own-model';
import { fmtQty } from '@/lib/ticks/tick-format';
import type { TickSession } from '@/lib/ticks/tick-session';
import type { TickUrlState } from '@/lib/ticks/tick-url';
import { useTickCursor, type TickCursor } from '@/lib/ticks/use-tick-cursor';
import { useTickOwn } from '@/lib/ticks/use-tick-own';
import { cn } from '@/lib/utils';

import { TickBook, type TickBookUnit } from './tick-book';
import { TickAmountCard } from './tick-amount-card';
import { TickChart } from './tick-chart';
import { TickMsgList } from './tick-msg-list';
import { TickOrderCard } from './tick-order-card';
import { TickSlider } from './tick-slider';
import { TickTeamPanel } from './tick-team-panel';

/**
 * 틱 뷰어 본문 (Phase 37 D-00 · 스케치 019 D 「종합 A+B」).
 *
 * ① 배치(위 → 아래): **매집감지 3판 차트**(37-14 · 클릭 = 그 시각 첫 틱 · 원 클릭 = 그 주문 마지막 조각) → **슬라이더 카드** → **HTS 행**(호가 10단 | 전문 목록 · 37-13 |
 *   이 주문 · 거래대금 · 팀 · 37-13/14). 커서(`useTickCursor`)가 이 화면의 정본이고, 현재 틱 시각 · seq 는 `onTick` 으로
 *   머리에 올린다.
 * ② HTS 칸은 `HTS_PANES` 배열 한 곳에서 그린다 — 뒤 플랜이 원소(전문 · 버스트 · 팀)를 더하면 데스크톱 행과 폰 세그먼트가
 *   같이 늘어난다. 데스크톱(> 640px) = 칸을 가로로 나란히 · 폰(≤ 640px) = 「호가 | 전문 | 버스트 · 팀」 세그먼트로 하나씩.
 *   세그먼트 상태는 이 컴포넌트가 든다. 판정은 CSS(뷰포트 640px)라 JS 가 폭을 재지 않는다.
 *   데스크톱 줄은 줄바꿈(flex-wrap)이다 — 호가 300 고정 · 전문 기본 480(남는 폭을 먼저 가져간다) · 오른쪽 열 기본 330.
 *   본문 폭이 모자라면(사이드바 펼친 1280 등) 오른쪽 열이 아래 줄로 내려가 전체 폭을 쓰고, 그때 카드는 두 열로 놓인다.
 *   줄 높이 = 전문 목록 고정 높이 640(오른쪽 열은 최대 640 · 넘치면 그 안에서 스크롤).
 * ③ 당일(`live` · 37-19 · D-06 · D-18): 슬라이더 「끝으로」(`showEnd`) · `t` 없으면 끝 틱에서 연다 · 커서가 끝이면 증분 세션을
 *   따라간다(`useTickCursor` ⑤) · 끝 여부를 `onAtEnd` 로 올린다 · 증분은 머리 「최신 받기」 버튼으로만(2026-11-03 — 자동 갱신 없음).
 *   과거 틱을 보는 동안 받은 레코드가 있으면 전문 목록 끝에 「새 틱 n건 · 끝으로」 배지. 배지 · 「끝으로」 = 커서 끝 + `onGoEnd`
 *   (새 틱 수 0 · 요청 없음).
 * ④ 우리 주문 · 체결(Phase 38 · D-14 · D-15): 열 때 `useTickOwn(urlState)` 가 `GET /api/ticks/own` 을 한 번 부르고
 *   (자동 타이머 없음), 응답을 세션과 따로 `buildOwnModel(session, own)` 으로 짝짓는다(shared `matchOwnFills` · 세션 안에
 *   넣지 않는다). 모델은 `PaneCtx.own` 으로 칸에 내려가 전문 목록이 우리 체결 A3 행에 민트 칩을 그린다. 조회가 실패하면
 *   우리 층만 없고 뷰어는 지금과 같다. 당일(`live`)이면 막 들어온 짝 없는 체결은 대기로 둔다(38-04 · Pitfall 4).
 *   주문 줄 · 짝 없음 줄 클릭 = `ownPick`(줄 + 기준 rec) + 커서 이동 · 선택 표시는 커서가 그 rec 일 때만(파생 — ←/→ 로
 *   커서가 바뀌면 풀린다 · URL 은 rec 기준 그대로).
 * ⑤ 근거 · 되돌아가기(38-06 · D-07 · D-10): 전문 목록 항목(`buildMsgRows`)을 여기서 한 번 만들어 목록(`rows` prop)과 주문 줄
 *   찾기(`ownLineRec`)가 같이 쓴다. 카드 「보기 ›」(근거 · 직전 체결 · 표 근거 칸)는 커서를 옮기고 그 주문을 기억해 side 칸 맨 위에
 *   「‹ 주문 #… 로」 알약(`ownBack`)을 남긴다 — 한 단계 · 누르면 그 주문 줄(없으면 첫 짝 체결)로 가고 사라짐 · 다른 「보기 ›」 가
 *   덮어씀 · 종목 · 날짜 · 거래소가 바뀌면 사라짐(파생).
 */

export interface TickViewerProps {
  session: TickSession;
  urlState: Omit<TickUrlState, 't'>;
  /** 열기 시점의 URL `t` — 열린 뒤 URL 이 바뀌어도 다시 읽지 않는다. */
  initialT: string | null;
  onTick?: (label: { time: string; seq: number | null }) => void;
  /** 열기 응답 `accum`(차트 누적 선 · 팀 패널 누적 — D-09). */
  accum?: TickOpenResponse['accum'];
  /** 당일 화면 — 누적 선 없음(D-09). */
  isToday?: boolean;
  /** 종목 상장주식수(열기 응답 `stock.listing_shares`) — 차트 · 거래대금 카드의 시총 대비. */
  listingShares?: number | null;
  /** 당일 바이트 경로(37-19) — 없으면 과거 격자. */
  live?: TickViewerLive;
}

export interface TickViewerLive {
  /** 커서가 끝이 아닐 때 붙은 레코드 수. */
  newCount: number;
  /** 「끝으로」 · 배지 — 새 틱 수를 비운다(요청 없음 · 커서는 뷰어가 끝으로 옮긴다). */
  onGoEnd: () => void;
  /** 커서가 끝 틱인지 바뀔 때마다. */
  onAtEnd: (atEnd: boolean) => void;
}

/** HTS 칸 렌더 문맥 — 칸마다 같은 세션 · 커서를 본다. */
interface PaneCtx {
  session: TickSession;
  cursor: TickCursor;
  unit: TickBookUnit;
  setUnit: (u: TickBookUnit) => void;
  accum: TickOpenResponse['accum'];
  isToday: boolean;
  listingShares: number | null;
  /** 당일 과거 틱 배지(전문 목록 끝) — 끝이면 null. */
  badge: ReactNode;
  /** 우리 체결 모델(Phase 38) — 조회 전 · 실패면 null. */
  own: OwnModel | null;
  /** 고른 우리 줄(주문 줄 · 짝 없음 줄) — 커서가 그 줄의 기준 전문일 때만(파생). */
  ownSel: OwnSel | null;
  onOwnSelect: (sel: OwnSel, rec: number) => void;
  /** 전문 목록 항목 모델 — 뷰어가 한 번 만들어 목록 · 되돌아가기가 같이 쓴다(38-06). */
  rows: MsgRowsModel;
  /** 그 주문 줄 선택(없으면 첫 짝 체결 · 짝 없음 줄). */
  onOwnOrder: (orderId: number) => void;
  /** 카드 「보기 ›」 로 떠날 때 되돌아갈 주문 기억(D-10). */
  onOwnBack: (orderId: number) => void;
  /** 되돌아가기 알약의 주문 · 없으면 null. */
  ownBackOrder: OwnOrderView | null;
  onOwnBackGo: () => void;
}

interface HtsPane {
  id: string;
  /** 폰 세그먼트 라벨. */
  label: string;
  /** 데스크톱 폭 클래스(행 안 flex 항목). */
  desktop: string;
  render: (c: PaneCtx) => ReactNode;
}

/** HTS 칸 — 37-13(전문 · 버스트) · 37-14(팀)가 원소를 더한다. */
const HTS_PANES: readonly HtsPane[] = [
  {
    id: 'book',
    label: '호가',
    desktop: 'min-[641px]:w-[300px] min-[641px]:flex-none',
    render: ({ session, cursor, unit, setUnit }) => (
      <TickBook session={session} rec={cursor.rec} unit={unit} onUnit={setUnit} className="h-full" />
    ),
  },
  {
    // 전문 목록 — 남는 폭을 먼저 가져간다(flex-grow 999). 높이는 고정(창 가상화 · 호가 10단과 같은 줄 높이).
    id: 'msg',
    label: '전문',
    desktop: 'min-[641px]:flex-[999_1_480px]',
    render: ({ session, cursor, badge, own, ownSel, onOwnSelect, rows }) => (
      <div className="relative">
        <TickMsgList
          session={session}
          cursorRec={cursor.rec}
          onSelect={cursor.jumpToRec}
          mode={cursor.mode}
          onMode={cursor.setMode}
          own={own}
          ownSel={ownSel}
          onOwnSelect={onOwnSelect}
          rows={rows}
          className="h-[640px] max-[640px]:h-[min(640px,calc(100dvh-240px))] max-[640px]:min-h-[360px]"
        />
        {badge}
      </div>
    ),
  },
  {
    // 오른쪽 열 — 이 주문 · 거래대금 · 팀 거래정보(37-14). 한 줄이면 330 폭에 세로로 · 아래 줄로 내려가면 두 열.
    id: 'side',
    label: '버스트 · 팀',
    desktop: 'min-[641px]:flex-[1_1_330px] min-[641px]:max-h-[640px] min-[641px]:overflow-auto',
    render: ({
      session,
      cursor,
      accum,
      isToday,
      listingShares,
      own,
      ownSel,
      onOwnOrder,
      onOwnBack,
      ownBackOrder,
      onOwnBackGo,
    }) => (
      <div
        data-slot="tick-side"
        className="grid content-start gap-2.5 [grid-template-columns:repeat(auto-fit,minmax(300px,1fr))] max-[640px]:grid-cols-1"
      >
        {ownBackOrder !== null && (
          // 되돌아가기 알약(D-10) — 카드 위 · 한 단계. 격자 한 칸을 차지하지 않게 전체 폭 줄에 왼쪽 정렬.
          <button
            type="button"
            data-slot="tick-own-back"
            data-order={ownBackOrder.id}
            onClick={onOwnBackGo}
            className="col-span-full inline-flex h-6 items-center justify-self-start rounded-full bg-[var(--mine-bg)] px-2.5 text-[11.5px] font-semibold whitespace-nowrap text-[var(--mine-fg)]"
          >
            {`‹ 주문 #${ownBackOrder.orderNo !== '' ? ownBackOrder.orderNo : '—'} 로`}
          </button>
        )}
        <TickOrderCard
          session={session}
          cursorRec={cursor.rec}
          onJump={cursor.jumpToRec}
          own={own}
          ownSel={ownSel}
          onOwnJump={cursor.jumpToRec}
          onOwnBack={onOwnBack}
          onOwnOrder={onOwnOrder}
        />
        <TickAmountCard session={session} cursorRec={cursor.rec} listingShares={listingShares} />
        <TickTeamPanel session={session} cursorRec={cursor.rec} accum={accum} isToday={isToday} />
      </div>
    ),
  },
];

export function TickViewer({
  session,
  urlState,
  initialT,
  onTick,
  accum = null,
  isToday = false,
  listingShares = null,
  live,
}: TickViewerProps) {
  const cursor = useTickCursor(session, { initialT, urlState, live: live !== undefined });
  const { rec, atEnd } = cursor;
  const [unit, setUnit] = useState<TickBookUnit>('qty');
  const [pane, setPane] = useState<string>(HTS_PANES[0]!.id);
  const own = useTickOwn(urlState);
  const isLive = live !== undefined;
  const ownModel = useMemo(
    () => (own.own ? buildOwnModel(session, own.own, { live: isLive }) : null),
    [session, own.own, isLive],
  );
  // 우리 줄 선택 — 줄 클릭 때 (줄, 기준 rec) 을 기억하고, 커서가 그 rec 일 때만 선택으로 본다(파생 · 효과 없음).
  const [ownPick, setOwnPick] = useState<{ sel: OwnSel; rec: number } | null>(null);
  const ownSel = ownPick !== null && ownPick.rec === rec ? ownPick.sel : null;
  const jumpToRec = cursor.jumpToRec;
  const onOwnSelect = useCallback(
    (sel: OwnSel, at: number) => {
      setOwnPick({ sel, rec: at });
      jumpToRec(at);
    },
    [jumpToRec],
  );

  // 전문 목록 항목 — 한 번 만들어 목록과 주문 줄 찾기(카드 · 알약)가 같이 쓴다(38-06).
  const rows = useMemo(() => buildMsgRows(session, cursor.mode, ownModel), [session, cursor.mode, ownModel]);

  // 그 주문 줄 선택 — 주문 줄 → 없으면 첫 짝 체결 A3 → 없으면 첫 짝 없음 줄.
  const onOwnOrder = useCallback(
    (id: number) => {
      const o = ownModel?.orders[id];
      if (!ownModel || !o) return;
      const pos = rows.ownPosOfOrder[id] ?? -1;
      const at = pos >= 0 ? ownLineRec(rows, pos) : -1;
      if (at >= 0) {
        onOwnSelect({ kind: 'order', id }, at);
        return;
      }
      for (const fid of o.fills) {
        const f = ownModel.fills[fid]!;
        if (f.rec >= 0) {
          jumpToRec(f.rec);
          return;
        }
      }
      for (const fid of o.fills) {
        const p = rows.ownPosOfFill[fid] ?? -1;
        const r = p >= 0 ? ownLineRec(rows, p) : -1;
        if (r >= 0) {
          onOwnSelect({ kind: 'fill', id: fid }, r);
          return;
        }
      }
    },
    [ownModel, rows, onOwnSelect, jumpToRec],
  );

  // 되돌아가기 알약(D-10) — 주문 묶기 키로 기억(증분으로 주문 id 가 밀려도 같은 주문) · 종목 · 날짜 · 거래소가 바뀌면 파생으로 사라진다.
  const ownScope = `${urlState.isin ?? ''}|${urlState.d ?? ''}|${urlState.ex}`;
  const [ownBack, setOwnBack] = useState<{ key: string; scope: string } | null>(null);
  const ownBackOrder =
    ownBack !== null && ownBack.scope === ownScope && ownModel !== null
      ? (ownModel.orders.find((o) => o.key === ownBack.key) ?? null)
      : null;
  const onOwnBack = useCallback(
    (id: number) => {
      const o = ownModel?.orders[id];
      if (o) setOwnBack({ key: o.key, scope: ownScope });
    },
    [ownModel, ownScope],
  );
  const onOwnBackGo = useCallback(() => {
    if (ownBackOrder !== null) onOwnOrder(ownBackOrder.id);
    setOwnBack(null);
  }, [ownBackOrder, onOwnOrder]);

  const time = rec >= 0 ? fmtTickTime(session.index.recvNs[rec]!) : '';
  const seq = rec >= 0 && session.index.seq[rec]! >= 0 ? session.index.seq[rec]! : null;

  useEffect(() => {
    onTick?.({ time, seq });
  }, [onTick, time, seq]);

  const onAtEnd = live?.onAtEnd;
  useEffect(() => {
    onAtEnd?.(atEnd);
  }, [onAtEnd, atEnd]);

  const onGoEnd = live?.onGoEnd;
  const cursorGoEnd = cursor.goEnd;
  const goEnd = useCallback(() => {
    cursorGoEnd();
    onGoEnd?.();
  }, [cursorGoEnd, onGoEnd]);

  // 과거 틱을 보는 동안 「최신 받기」로 붙은 레코드가 있으면 배지(누르면 끝 틱으로 · 요청 없음)
  const badge =
    live !== undefined && !atEnd && live.newCount > 0 ? (
      <button
        type="button"
        data-slot="tick-live-badge"
        onClick={goEnd}
        className="absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full bg-[var(--up)] px-3 py-1 text-[11.5px] font-semibold whitespace-nowrap text-white shadow-md"
      >
        {`새 틱 ${fmtQty(live.newCount)}건 · 끝으로`}
      </button>
    ) : null;

  const ctx: PaneCtx = {
    session,
    cursor,
    unit,
    setUnit,
    accum,
    isToday,
    listingShares,
    badge,
    own: ownModel,
    ownSel,
    onOwnSelect,
    rows,
    onOwnOrder,
    onOwnBack,
    ownBackOrder,
    onOwnBackGo,
  };

  return (
    <div data-slot="tick-viewer-body" className="flex flex-col gap-3">
      <TickChart
        session={session}
        accum={accum}
        isToday={isToday}
        listingShares={listingShares}
        cursorRec={rec}
        onSeekMs={(ms) => cursor.seekNs(BigInt(Math.round(ms)) * 1_000_000n)}
        onJumpRec={cursor.jumpToRec}
      />

      <TickSlider
        session={session}
        rec={rec}
        onSeekNs={cursor.seekNs}
        onStep={cursor.step}
        playing={cursor.playing}
        onPlay={cursor.togglePlay}
        speed={cursor.speed}
        onSpeed={cursor.setSpeed}
        onJump={cursor.jumpTo}
        showEnd={live !== undefined}
        onEnd={goEnd}
      />

      <div role="group" aria-label="보기" className="min-[641px]:hidden">
        <div className="flex w-full rounded-full bg-[var(--muted)] p-0.5">
          {HTS_PANES.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-pressed={p.id === pane}
              onClick={() => setPane(p.id)}
              className={cn(
                'flex-1 rounded-full px-2.5 py-1 text-[11.5px] font-semibold',
                p.id === pane ? 'bg-[var(--pill-on-bg)] text-[var(--pill-on-fg)]' : 'text-[var(--fg-2)]',
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div data-slot="tick-hts" className="flex min-w-0 flex-wrap gap-2.5 max-[640px]:flex-col max-[640px]:flex-nowrap">
        {HTS_PANES.map((p) => (
          <div
            key={p.id}
            data-slot="tick-pane"
            data-pane={p.id}
            className={cn('min-w-0', p.desktop, p.id !== pane && 'max-[640px]:hidden')}
          >
            {p.render(ctx)}
          </div>
        ))}
      </div>
    </div>
  );
}
